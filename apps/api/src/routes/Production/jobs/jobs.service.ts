import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import sql from 'src/utils/db';
import {
  exportSchema,
  IEFilterSchema,
  updateExportSchema,
} from './jobs.schema';
import { updateMaterialAmount } from 'src/utils/functions';
import { ContextProvider } from 'src/interceptors/context.provider';
import { idObjectSchema } from 'src/utils/schemas';

@Injectable()
export class JobsService {
  constructor(private readonly req: ContextProvider) {}

  async get(body: z.infer<typeof IEFilterSchema>) {
    const movements = await sql`
      SELECT id, ref, programation, due, part, description, "clientId", amount::int
      FROM jobs
      WHERE TRUE 
      ${body.job ? sql`AND ref ILIKE ${'%' + body.job + '%'} ` : sql``}
      ${
        body.programation
          ? sql`AND "programation" = ${body.programation}`
          : sql``
      }
      ORDER BY due DESC, ref DESC limit 150`;

    return movements;
  }

  async getOne(body: z.infer<typeof idObjectSchema>) {
    const [data] = await sql`select * from jobs where id = ${body.id}`;
    const [productMovement] =
      await sql`select "materialId" as "productId" from materialmovements where "id" = ${data?.movementId || null}`;

    const materials =
      await sql`select id, (select code from materials where id = "materialId"), amount, "realAmount", active from materialmovements where "jobId" = ${body.id} and NOT extra
      ${data?.movementId ? sql`and id <> ${data.movementId}` : sql``}`;

    const destinations =
      await sql`select order_destiny.id, so, order_destiny.po, amount, date
       from order_destiny 
       join destinys on destinys.id = order_destiny."destinyId"
       where "orderId" = ${data?.id || null}`;

    const operations =
      await sql`select id, code, minutes, area from operations where "orderId" = ${data?.id || null}`;

    return {
      ...data,
      clientId: String(data.clientId),
      ...productMovement,
      due: data.due.toISOString().split('T')[0],
      materials,
      operations,
      destinations: destinations.map((destination) => ({
        ...destination,
        date: destination.date.toISOString().split('T')[0],
      })),
    };
  }

  async getComparison(body: z.infer<typeof idObjectSchema>) {
    const movements = await sql`SELECT
    materials.code,
    materials.measurement,
    materialmovements.amount,
    (
        SELECT SUM(amount) 
        FROM materialmovements AS m
        WHERE m."materialId" = materialmovements."materialId" AND m."jobId" = materialmovements."jobId"
    ) AS "realAmount"
        FROM
        materialmovements
    JOIN
        materials ON materials.id = materialmovements."materialId"
    JOIN
        jobs ON jobs.id = materialmovements."jobId"
    WHERE
        materialmovements."jobId" = ${body.id} AND materialmovements.active IS true
        AND materialmovements.extra = false
    ORDER BY
        materialmovements.id DESC;`;

    return movements;
  }

  // Finds the finished-product material for a part number, creating it if new.
  // Every job links to a product material so quality releases feed inventory.
  private async resolveProductMaterial(
    sql2: any,
    part: string,
    description: string | null,
    clientId: number | string,
  ) {
    // Un job puede producir un Producto terminado o un Subproducto (obs 04/08);
    // solo se rechaza ligar la parte a materia prima.
    const [material] = await sql2`select id, product,
      COALESCE(type, case when product then 'producto' else 'materiaPrima' end) as type
      from materials where code = ${part}`;

    if (material && material.type === 'materiaPrima')
      throw new HttpException(
        `El No. de parte ${part} ya existe como MATERIA PRIMA en inventario; cámbialo a Producto o Subproducto en Almacén para poder producirlo`,
        400,
      );
    if (material) return material.id;

    const [created] = await sql2`insert into materials ${sql2({
      code: part,
      description: description || part,
      measurement: 'PZ',
      clientId: clientId,
      product: true,
      type: 'producto',
    })} returning id`;
    return created.id;
  }

  async post(body: z.infer<typeof exportSchema>) {
    const materials = body.materials.map((item: any) => item.code);

    const materialRows =
      await sql`SELECT code FROM materials WHERE code in ${sql(materials)}`;
    if (materialRows.length !== materials.length)
      throw new HttpException(
        'Uno o varios de los materiales incorrectos',
        400,
      );

    await sql.begin(async (sql) => {
      for (const ref of body.jobs) {
        const [insertedJob] = await sql`Insert into jobs ${sql({
          ref: ref,
          programation: body.programation,
          due: body.due,
          clientId: body.clientId,
          areaId: body.areaId,
          part: body.part,
          description: body.description,
          perBox: body.perBox,
          bastones: body.bastones,
          amount: body.amount,
          corteTime: body.corteTime,
          cortesVariosTime: body.cortesVariosTime,
          produccionTime: body.produccionTime,
          calidadTime: body.calidadTime,
          serigrafiaTime: body.serigrafiaTime,
          contractorAmount: 0,
        })} returning id`;

        for (const material of body.materials) {
          const [movement] =
            await sql`insert into materialmovements ("materialId", "jobId", amount, "realAmount", active, "activeDate") values
         ((select id from materials where code = ${material.code}), ${insertedJob.id} ,${-Math.abs(Number(material.amount))}, ${-Math.abs(Number(material.realAmount))}, ${material.active}, ${material.active ? new Date() : null})
         returning "materialId"`;

          if (material.active)
            await updateMaterialAmount(movement.materialId, sql);
        }

        // Link the finished-product movement, resolved from the part number
        const productId = await this.resolveProductMaterial(
          sql,
          body.part,
          body.description,
          body.clientId,
        );
        const [productMovement] = await sql`insert into materialmovements ${sql(
          {
            materialId: productId,
            jobId: insertedJob.id,
            amount: 0,
            realAmount: 0,
            active: true,
            activeDate: new Date(),
          },
        )} returning id`;

        await sql`update jobs set "movementId" = ${productMovement.id} where id = ${insertedJob.id}`;

        // Add destinations info
        if (body.destinations.length) {
          await sql`insert into destinys ${sql(body.destinations, 'so')} on conflict ("so") do nothing`;

          for (const destination of body.destinations) {
            await sql`insert into order_destiny ("orderId", "destinyId", "amount", "date", "po") values
         (${insertedJob.id}, (select id from destinys where so = ${destination.so}), ${destination.amount}, ${destination.date}, ${destination.po})`;
          }
        }

        // Add operations info

        if (body.operations.length) {
          await sql`insert into operations ${sql(
            body.operations.map((operation) => ({
              orderId: insertedJob.id,
              code: operation.code,
              minutes: operation.minutes,
              area: operation.area,
            })),
          )}`;
        }

        // Make record
        await this.req.record(`Registro el job: ${ref}`, sql);
      }
    });

    return;
  }

  async update(body: z.infer<typeof updateExportSchema>) {
    const [user] =
      await sql`select permissions from users where id = ${this.req.userId}`;
    if (user.permissions.jobs < 3) throw new HttpException('', 403);

    const materials: {
      materialId: number;
      jobId: number;
      amount: number;
      realAmount: number;
      active: boolean;
      transaction?: string;
      id: number | null;
    }[] = [];

    for (const movement of body.materials) {
      const [material] =
        await sql`select id from materials where code = ${movement.code}`;

      if (!material) throw new HttpException('Material no existente', 400);

      materials.push({
        materialId: material.id,
        jobId: body.id,
        amount: -Math.abs(parseFloat(movement.amount)),
        realAmount: -Math.abs(parseFloat(movement.realAmount)),
        active: movement.active,
        transaction: movement.transaction,
        id: movement.id || null,
      });
    }

    await sql.begin(async (sql) => {
      // Update Job
      const [previousJob] =
        await sql`select ref, programation from jobs where id = ${body.id}`;

      const [newJob] = await sql`update jobs set ${sql({
        due: body.due,
        ref: body.ref,
        programation: body.programation,
        clientId: body.clientId,
        areaId: body.areaId,
        part: body.part,
        description: body.description,
        perBox: body.perBox,
        bastones: body.bastones,
        amount: body.amount,
        corteTime: body.corteTime,
        cortesVariosTime: body.cortesVariosTime,
        produccionTime: body.produccionTime,
        calidadTime: body.calidadTime,
        serigrafiaTime: body.serigrafiaTime,
        contractorAmount: 0,
      })} where id = ${body.id} returning id, ref, programation, part`;

      // Keep the product movement's material in sync with the part number
      const [jobRow] =
        await sql`select "movementId" from jobs where id = ${body.id}`;
      if (jobRow?.movementId && body.part) {
        const [current] =
          await sql`select "materialId" from materialmovements where id = ${jobRow.movementId}`;
        const newMaterialId = await this.resolveProductMaterial(
          sql,
          body.part,
          body.description,
          body.clientId,
        );
        if (current && current.materialId !== newMaterialId) {
          await sql`update materialmovements set "materialId" = ${newMaterialId} where id = ${jobRow.movementId}`;
          await updateMaterialAmount(current.materialId, sql);
          await updateMaterialAmount(newMaterialId, sql);
        }
      }

      // Update Materials
      for (const material of materials) {
        let inserted;
        if (material.transaction === 'delete') {
          // Delete
          await sql`delete from materialmovements where id = ${material.id || ''}`;
        } else if (material.transaction === 'insert') {
          // Insert
          delete material.transaction;
          delete material.id;
          [inserted] =
            await sql`insert into materialmovements ${sql(material)} returning id, active, "activeDate"`;
        } else if (!material.transaction) {
          // Update
          delete material.transaction;
          [inserted] =
            await sql`update materialmovements set ${sql(material)} where id = ${material.id} returning id, active, "activeDate"`;
        }

        if (inserted) {
          if (inserted.active && !inserted.activeDate)
            await sql`update materialmovements set "activeDate" = now() where id = ${inserted.id}`;
          if (!inserted.active && inserted.activeDate)
            await sql`update materialmovements set "activeDate" = null where id = ${inserted.id}`;
        }
        await updateMaterialAmount(material.materialId, sql);
      }

      // Update Destinations
      if (body.destinations.length > 0) {
        await sql`insert into destinys ${sql(body.destinations, 'so')} on conflict ("so") do nothing`;

        for (const destination of body.destinations) {
          if (destination.transaction === 'delete') {
            // deleting the line cascades its export movement; restore stock
            const exportMovements =
              await sql`select "materialId" from materialmovements where "orderDestinyId" = ${destination.id}`;
            await sql`delete from order_destiny where id = ${destination.id}`;
            for (const movement of exportMovements)
              await updateMaterialAmount(movement.materialId, sql);
          } else if (destination.transaction === 'insert') {
            await sql`insert into order_destiny ("orderId", "destinyId", "amount", "date", "po") values
          (${newJob.id}, (select id from destinys where so = ${destination.so}), ${destination.amount}, ${destination.date}, ${destination.po})`;
          } else if (!destination.transaction) {
            await sql`update order_destiny set "amount" = ${destination.amount}, "date" = ${destination.date}, "po" = ${destination.po}, "destinyId" = (select id from destinys where so = ${destination.so})
             where id = ${destination.id}`;
            // keep any existing export movement in sync with the new amount
            const syncedMovements =
              await sql`update materialmovements set amount = ${-Math.abs(Number(destination.amount))}, "realAmount" = ${-Math.abs(Number(destination.amount))}
               where "orderDestinyId" = ${destination.id} returning "materialId"`;
            for (const movement of syncedMovements)
              await updateMaterialAmount(movement.materialId, sql);
          }
        }
      }

      // Update operations
      for (const operation of body.operations) {
        if (operation.transaction === 'delete') {
          // Delete
          await sql`delete from operations where id = ${operation.id || ''}`;
        } else if (operation.transaction === 'insert') {
          // Insert
          delete operation.transaction;
          delete operation.id;
          await sql`insert into operations ${sql({ ...operation, orderId: newJob.id })}`;
        } else if (!operation.transaction) {
          // Update
          delete operation.transaction;
          await sql`update operations set ${sql(operation)} where id = ${operation.id} `;
        }
      }

      // Make record
      await this.req.record(
        `Actualizo la exportacion: ${previousJob?.ref}, programacion: ${previousJob?.programation} a ${newJob?.ref}, ${newJob?.programation}`,
        sql,
      );
    });

    return;
  }

  async delete(body: z.infer<typeof idObjectSchema>) {
    const [user] =
      await sql`select permissions from users where id = ${this.req.userId}`;
    if (user.permissions.jobs < 3) throw new HttpException('', 403);

    const movements =
      await sql`select "materialId" from materialmovements where "jobId" = ${body.id}`;

    await sql.begin(async (sql) => {
      const deleted = (
        await sql`delete from jobs where id = ${body.id} returning ref`
      )[0];

      for (const movement of movements) {
        await updateMaterialAmount(movement.materialId, sql);
      }

      await this.req.record(`Elimino el job ${deleted?.ref}`, sql);
    });

    return;
  }
}
