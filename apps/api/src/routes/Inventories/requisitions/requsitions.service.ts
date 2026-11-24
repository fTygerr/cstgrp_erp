import { HttpException, Injectable } from '@nestjs/common';
import exceljs from 'exceljs';
import { z } from 'zod/v4';
import sql from 'src/utils/db';
import {
  jobsSchema,
  movementsFilterSchema,
  requisitionSchema,
  suppliesSchema,
} from './requsitions.schema';
import { ContextProvider } from 'src/interceptors/context.provider';
import { PetitionsService } from '../petitions/petitions.service';
@Injectable()
export class RequisitionsService {
  constructor(
    private readonly req: ContextProvider,
    private readonly petitionsService: PetitionsService,
  ) {}

  async getMovements(body: z.infer<typeof movementsFilterSchema>) {
    const movements = await sql`SELECT
      materials.code, materials.description, materials.measurement, materials."clientId", materials."leftoverAmount", materials.amount as inventory, materialmovements.amount, materialmovements."realAmount", jobs.due, jobs.ref, jobs.programation
      FROM materialmovements
      JOIN materials on materials.id = materialmovements."materialId"
      JOIN jobs on jobs.id = materialmovements."jobId"
      WHERE
      NOT materialmovements.active AND
      NOT materialmovements.extra AND
      materialmovements."reqId" IS NULL AND
      ${body.jobpo ? sql`jobs.ref = ${body.jobpo}` : sql`TRUE`} AND
      ${body.programation ? sql`jobs.programation = ${body.programation}` : sql`TRUE`} AND
      ${body.code ? sql`materials.code LIKE ${'%' + body.code + '%'}` : sql`TRUE`} AND
      jobs."areaId" IN (SELECT unnest(prod_areas) FROM users WHERE id = ${this.req.userId})
      ORDER BY jobs.due DESC, jobs.ref DESC, materials.code DESC, materialmovements.amount DESC, materialmovements.id DESC
      LIMIT 300`;
    return movements;
  }

  async getPendingJobs(body: z.infer<typeof jobsSchema>) {
    const movements = await sql`SELECT
      -materialmovements.amount as amount, jobs.due, jobs.ref, jobs.programation, materialmovements.id, false as selected
      FROM materialmovements
      JOIN materials on materials.id = materialmovements."materialId"
      JOIN jobs on jobs.id = materialmovements."jobId"
      WHERE
      materials.code = ${body.code} AND
      jobs."areaId" IN (SELECT unnest(prod_areas) FROM users WHERE id = ${this.req.userId}) AND
      materialmovements."reqId" IS NULL AND
      NOT materialmovements.active AND
      NOT materialmovements.extra
      ORDER BY jobs.due DESC, jobs.ref DESC`;
    return movements;
  }

  // Obs 20-Nov (Juan) punto 3: cada usuario sólo puede tener UNA requisición
  // abierta por material. "Abierta" = alguno de sus movimientos aún no tiene
  // check en Movimientos (una surtida parcial sigue abierta). Se compara por la
  // cuenta con la que se entra (requisitions."user"), no por el solicitante.
  private async assertNoOpenRequisition(
    materialId: number,
    code: string,
    db: any = sql,
  ) {
    const [open] = await db`SELECT r.folio FROM requisitions r
      WHERE r."materialId" = ${materialId}
        AND r."user" = (select username from users where id = ${this.req.userId})
        AND EXISTS (SELECT 1 FROM materialmovements mm WHERE mm."reqId" = r.id AND NOT mm.active)
      ORDER BY r.folio DESC LIMIT 1`;
    if (open)
      throw new HttpException(
        `Ya tienes la REQ ${open.folio} abierta de ${code}. Hasta que almacén le dé check en Movimientos no puedes pedir otra del mismo material.`,
        400,
      );
  }

  async createRequisition(body: z.infer<typeof requisitionSchema>) {
    // Obs 20-Nov (Juan) punto 1: la cantidad se captura POR ORDEN. Cada orden
    // pide igual o menos de lo que necesita. Si viene el formato viejo
    // (requested + jobIds) se arma el mismo reparto FIFO de antes (obs 03/09).
    const ids = body.items?.length
      ? body.items.map((i) => i.id)
      : body.jobIds || [];
    if (!ids.length) throw new HttpException('Selecciona al menos un job', 400);

    const movements =
      await sql`SELECT materialmovements.id, materialmovements.amount,
        materialmovements.active, materialmovements."reqId", materialmovements."jobId",
        materialmovements."materialId", jobs.ref, jobs.due
      FROM materialmovements JOIN jobs ON jobs.id = materialmovements."jobId"
      WHERE materialmovements.id IN ${sql(ids)}
      ORDER BY jobs.due ASC, materialmovements.id ASC`;

    if (!movements.length)
      throw new HttpException('Selecciona al menos un job', 400);
    if (movements.some((m) => m.active))
      throw new HttpException('Uno de los jobs ya fue expedido', 400);
    if (movements.some((m) => m.reqId))
      throw new HttpException('Uno de los jobs ya tiene una requisicion', 400);

    // cantidad pedida por movimiento
    const wanted = new Map<number, number>();
    if (body.items?.length) {
      for (const it of body.items) {
        const m = movements.find((mv) => Number(mv.id) === it.id);
        if (!m) throw new HttpException('Uno de los jobs ya no existe', 400);
        const need = Math.abs(Number(m.amount));
        if (!(it.amount > 0))
          throw new HttpException(
            `La cantidad de ${m.ref} debe ser mayor a 0`,
            400,
          );
        if (it.amount > need + 1e-9)
          throw new HttpException(
            `La cantidad de ${m.ref} (${it.amount}) no puede ser mayor a lo que necesita la orden (${need})`,
            400,
          );
        wanted.set(Number(m.id), it.amount);
      }
    } else {
      let remaining = Math.abs(Number(body.requested || 0));
      for (const m of movements) {
        const take = Math.min(remaining, Math.abs(Number(m.amount)));
        if (take > 0) wanted.set(Number(m.id), take);
        remaining -= take;
      }
    }

    const linked = movements.filter((m) => wanted.has(Number(m.id)));
    if (!linked.length)
      throw new HttpException(
        'Escribe la cantidad requerida de al menos una orden',
        400,
      );

    const necessary = linked.reduce(
      (acc, m) => acc + Math.abs(Number(m.amount)),
      0,
    );
    const requested =
      Math.round([...wanted.values()].reduce((a, b) => a + b, 0) * 100) / 100;

    // Obs 23-Sep (Juan) punto 1: si no hay existencia suficiente no se deja
    // hacer la requisición y se avisa cuánto hay realmente.
    // materials.amount = suma de movimientos activos (existencia en almacén).
    const [material] =
      await sql`select id, code, amount, measurement from materials where code = ${body.code}`;
    if (!material) throw new HttpException('Material no existente', 400);
    if (linked.some((m) => Number(m.materialId) !== Number(material.id)))
      throw new HttpException('Las órdenes no corresponden al material', 400);
    if (Number(material.amount) < requested)
      throw new HttpException(
        `No hay suficiente material para surtir la requisición. Existencia de ${material.code}: ${Number(material.amount)} ${material.measurement || ''} (se pidieron ${requested})`.trim(),
        400,
      );

    const inserted = await sql.begin(async (sql) => {
      await this.assertNoOpenRequisition(material.id, material.code, sql);

      const [inserted] =
        await sql`insert into requisitions (folio, petitioner, "user", motive, area, "materialId", jobs, requested, necesary) values
        (
          (SELECT COALESCE(MAX(folio), 0) + 1 FROM requisitions),
          ${body.petitioner},
          (select username from users where id = ${this.req.userId}),
          ${body.motive},
          (select name from areas where id = ${body.areaId}),
          ${material.id},
          ${',' + linked.map((m) => m.ref).join(',') + ','},
          ${requested},
          ${necessary}
        ) returning id, folio`;

      for (const m of linked) {
        const amount = Math.abs(Number(m.amount));
        const take = wanted.get(Number(m.id));
        if (take >= amount - 1e-9) {
          // completo: el movimiento del job queda ligado entero
          await sql`update materialmovements set "reqId" = ${inserted.id} where id = ${m.id}`;
        } else {
          // parcial: renglón nuevo ligado a la requisición por lo pedido, y el
          // renglón de la orden queda con el restante pendiente
          await sql`insert into materialmovements
            ("materialId", "jobId", "reqId", amount, "realAmount", active)
            values (${m.materialId}, ${m.jobId}, ${inserted.id}, ${-take}, ${-take}, false)`;
          const rest = Math.round((amount - take) * 100) / 100;
          await sql`update materialmovements
            set amount = ${-rest}, "realAmount" = ${-rest}
            where id = ${m.id}`;
        }
      }

      await this.req.record(
        `Hizo una requisicion de folio: ${inserted.folio}`,
        sql,
      );
      return inserted;
    });

    return inserted;
  }

  async createSupplyRequisition(body: z.infer<typeof suppliesSchema>) {
    await sql.begin(async (sql) => {
      for (const movement of body.materials) {
        const [material] =
          await sql`select id, type from materials where code = ${movement.code}`;
        if (!material) throw new HttpException('Material no existente', 400);
        if (material.type !== 'insumo')
          throw new HttpException(
            `El material ${movement.code} no está marcado como insumo. Márquelo como insumo en Almacén → Inventario para poder pedirlo aquí`,
            400,
          );
        await this.assertNoOpenRequisition(material.id, movement.code, sql);

        const [inserted] =
          await sql`insert into requisitions (folio, petitioner, "user", motive, area, "materialId", jobs, requested, necesary) values
        (
          (SELECT COALESCE(MAX(folio), 0) + 1 FROM requisitions),
          ${body.petitioner},
          (select username from users where id = ${this.req.userId}),
          ${body.motive},
          (select name from areas where id = ${body.areaId}),
          ${material.id},
          ${body.job || ''},
          ${movement.amount},
          ${movement.amount}
        ) returning folio, id`;

        await sql`insert into materialmovements ("materialId", "reqId", amount, "realAmount") values
        (${material.id}, ${inserted.id}, ${-movement.amount}, ${-movement.amount})`;

        await this.req.record(
          `Hizo una requisicion de insumos de folio: ${inserted.folio}`,
          sql,
        );
      }
    });
  }

  async exportPending() {
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Inventario');

    const results = await sql`SELECT
      materials.code, materials.description, materials.measurement, materials."clientId", materials."leftoverAmount", materials.amount as inventory, materialmovements.amount, materialmovements."realAmount", materialmovements.id, jobs.due, jobs.ref, jobs.programation
      FROM materialmovements
      JOIN materials on materials.id = materialmovements."materialId"
      JOIN jobs on jobs.id = materialmovements."jobId"
      WHERE materialmovements.active = false
      ORDER BY jobs.due DESC, jobs.ref DESC, materials.code DESC, materialmovements.amount DESC, materialmovements.id DESC`;

    worksheet.columns = [
      { header: 'Programacion', key: 'programation', width: 16 },
      { header: 'Job', key: 'ref', width: 12 },
      { header: 'Material', key: 'code', width: 22 },
      { header: 'Descripcion', key: 'description', width: 22 },
      { header: 'Cantidad', key: 'amount', width: 15 },
      { header: 'Inventario', key: 'inventory', width: 20 },
      { header: 'En area', key: 'leftoverAmount', width: 20 },
      { header: 'Medida', key: 'measurement', width: 14 },
    ];

    worksheet.addRows(results);

    worksheet.getRow(1).eachCell((cell) => {
      cell.style = { font: { bold: true } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
}
