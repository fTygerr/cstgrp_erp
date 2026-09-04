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

  async createRequisition(body: z.infer<typeof requisitionSchema>) {
    // movimientos seleccionados, más viejo primero (obs 03/09: el reparto de
    // una requisición parcial es por antigüedad — las órdenes viejas completas
    // y la más reciente se divide)
    const movements = await sql`SELECT materialmovements.id, materialmovements.amount,
        materialmovements.active, materialmovements."reqId", materialmovements."jobId",
        jobs.ref, jobs.due
      FROM materialmovements JOIN jobs ON jobs.id = materialmovements."jobId"
      WHERE materialmovements.id IN ${sql(body.jobIds)}
      ORDER BY jobs.due ASC, materialmovements.id ASC`;

    if (!movements.length)
      throw new HttpException('Selecciona al menos un job', 400);
    if (movements.some((m) => m.active))
      throw new HttpException('Uno de los jobs ya fue expedido', 400);
    if (movements.some((m) => m.reqId))
      throw new HttpException('Uno de los jobs ya tiene una requisicion', 400);

    const necessary = movements.reduce(
      (acc, m) => acc + Math.abs(Number(m.amount)),
      0,
    );
    const requested = Math.abs(Number(body.requested));

    const inserted = await sql.begin(async (sql) => {
      const [inserted] =
        await sql`insert into requisitions (folio, petitioner, "user", motive, area, "materialId", jobs, requested, necesary) values
        (
          (SELECT COALESCE(MAX(folio), 0) + 1 FROM requisitions),
          ${body.petitioner},
          (select username from users where id = ${this.req.userId}),
          ${body.motive},
          (select name from areas where id = ${body.areaId}),
          (select id from materials where code = ${body.code}),
          ${',' + movements.map((m) => m.ref).join(',') + ','},
          ${requested},
          ${necessary}
        ) returning id, folio`;

      // reparto FIFO de lo requerido entre los movimientos seleccionados
      let remaining = requested;
      for (const m of movements) {
        const amount = Math.abs(Number(m.amount));
        if (remaining >= amount) {
          // cubierto completo: el movimiento del job queda ligado entero
          await sql`update materialmovements set "reqId" = ${inserted.id} where id = ${m.id}`;
          remaining -= amount;
        } else if (remaining > 0) {
          // parcial (obs 03/09): renglón nuevo ligado a la requisición por lo
          // pedido, y el renglón de la orden queda con el restante pendiente
          await sql`insert into materialmovements
            ("materialId", "jobId", "reqId", amount, "realAmount", active)
            values ((select "materialId" from materialmovements where id = ${m.id}),
              ${m.jobId}, ${inserted.id}, ${-remaining}, ${-remaining}, false)`;
          await sql`update materialmovements
            set amount = ${-(amount - remaining)}, "realAmount" = ${-(amount - remaining)}
            where id = ${m.id}`;
          remaining = 0;
        }
        // remaining = 0: movimientos restantes quedan sin requisición
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
