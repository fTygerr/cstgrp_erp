import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import sql from 'src/utils/db';
import { ContextProvider } from 'src/interceptors/context.provider';
import { idObjectSchema } from 'src/utils/schemas';
import {
  createExportOrderSchema,
  createPalletsSchema,
  exportOrdersFilterSchema,
  palletJobsFilterSchema,
  palletsFilterSchema,
  updateContentSchema,
} from './pallets.schema';
import { generateExportOrderPdf, generatePalletLabelPdf } from './pallets.generate';

const MAX_CONTENTS = 5;

@Injectable()
export class PalletsService {
  constructor(private readonly req: ContextProvider) {}

  async getJobs(query: z.infer<typeof palletJobsFilterSchema>) {
    return sql`
      SELECT jobs.id, jobs.ref, jobs.programation, jobs.part, jobs.description,
        jobs.amount, jobs.calidad, jobs."perBox", jobs."clientId", clients.name AS client, jobs.due,
        COALESCE((SELECT SUM(pc.amount)::int FROM pallet_contents pc WHERE pc."jobId" = jobs.id), 0) AS palletized
      FROM jobs
      JOIN clients ON clients.id = jobs."clientId"
      WHERE jobs.part IS NOT NULL
      AND jobs.calidad > 0
      ${query.job ? sql`AND jobs.ref ILIKE ${'%' + query.job + '%'}` : sql``}
      ${query.programation ? sql`AND jobs.programation ILIKE ${'%' + query.programation + '%'}` : sql``}
      ${query.clientId ? sql`AND jobs."clientId" = ${query.clientId}` : sql``}
      ${
        query.pending === 'true'
          ? sql`AND COALESCE((SELECT SUM(pc.amount) FROM pallet_contents pc WHERE pc."jobId" = jobs.id), 0) < jobs.amount`
          : sql``
      }
      ORDER BY jobs.due DESC, jobs.id DESC
      LIMIT 150`;
  }

  async getPallets(query: z.infer<typeof palletsFilterSchema>) {
    return sql`
      SELECT pallets.id, pallets.folio, pallets.created_at, pallets."clientId",
        clients.name AS client, pallets."exportOrderId",
        (SELECT json_agg(json_build_object(
            'id', pc.id, 'ref', j.ref, 'programation', j.programation,
            'part', j.part, 'description', j.description,
            'amount', pc.amount, 'boxes', pc.boxes) ORDER BY pc.id)
          FROM pallet_contents pc JOIN jobs j ON j.id = pc."jobId"
          WHERE pc."palletId" = pallets.id) AS contents
      FROM pallets
      JOIN clients ON clients.id = pallets."clientId"
      WHERE TRUE
      ${query.folio ? sql`AND pallets.folio = ${Number(query.folio) || 0}` : sql``}
      ${query.clientId ? sql`AND pallets."clientId" = ${query.clientId}` : sql``}
      ${query.pending === 'true' ? sql`AND pallets."exportOrderId" IS NULL` : sql``}
      ${query.pending === 'false' ? sql`AND pallets."exportOrderId" IS NOT NULL` : sql``}
      ORDER BY pallets.id DESC
      LIMIT 200`;
  }

  async create(body: z.infer<typeof createPalletsSchema>) {
    const folios: string[] = [];

    await sql.begin(async (sql) => {
      const [job] = await sql`
        SELECT jobs.id, jobs.ref, jobs.amount, jobs."clientId", clients.name AS client
        FROM jobs JOIN clients ON clients.id = jobs."clientId"
        WHERE jobs.id = ${body.jobId}`;
      if (!job) throw new HttpException('Job no existente', 400);

      const [{ palletized }] = await sql`
        SELECT COALESCE(SUM(amount), 0)::int AS palletized
        FROM pallet_contents WHERE "jobId" = ${body.jobId}`;

      const requested = body.rows.reduce((acc, r) => acc + r.amount, 0);
      if (palletized + requested > job.amount)
        throw new HttpException(
          `La cantidad excede el total del job (${palletized + requested} de ${job.amount})`,
          400,
        );

      for (const row of body.rows) {
        if (row.combineFolio) {
          const [target] = await sql`
            SELECT pallets.id, pallets."exportOrderId",
              (SELECT COUNT(*)::int FROM pallet_contents WHERE "palletId" = pallets.id) AS contents
            FROM pallets
            WHERE "clientId" = ${job.clientId} AND folio = ${row.combineFolio}`;

          if (!target)
            throw new HttpException(
              `No existe el pallet ${row.combineFolio} para este cliente`,
              400,
            );
          if (target.exportOrderId)
            throw new HttpException(
              `El pallet ${row.combineFolio} ya está en una exportación`,
              400,
            );
          if (target.contents >= MAX_CONTENTS)
            throw new HttpException(
              `El pallet ${row.combineFolio} ya tiene ${MAX_CONTENTS} jobs`,
              400,
            );

          await sql`INSERT INTO pallet_contents ${sql({
            palletId: target.id,
            jobId: job.id,
            amount: row.amount,
            boxes: row.boxes,
          })}`;
          folios.push(`${job.client}-${row.combineFolio} (combinado)`);
        } else {
          const [{ palletSeq }] = await sql`
            UPDATE clients SET "palletSeq" = "palletSeq" + 1
            WHERE id = ${job.clientId} RETURNING "palletSeq"`;

          const [pallet] = await sql`INSERT INTO pallets ${sql({
            folio: palletSeq,
            clientId: job.clientId,
          })} RETURNING id`;

          await sql`INSERT INTO pallet_contents ${sql({
            palletId: pallet.id,
            jobId: job.id,
            amount: row.amount,
            boxes: row.boxes,
          })}`;
          folios.push(`${job.client}-${palletSeq}`);
        }
      }

      await this.req.record(
        `Registro pallets del job ${job.ref}: ${folios.join(', ')}`,
        sql,
      );
    });

    return { folios };
  }

  async updateContent(body: z.infer<typeof updateContentSchema>) {
    const [content] = await sql`
      SELECT pc.id, p."exportOrderId" FROM pallet_contents pc
      JOIN pallets p ON p.id = pc."palletId" WHERE pc.id = ${body.id}`;
    if (!content) throw new HttpException('Contenido no existente', 400);
    if (content.exportOrderId)
      throw new HttpException('El pallet ya está en una exportación', 400);

    await sql`UPDATE pallet_contents SET amount = ${body.amount}, boxes = ${body.boxes} WHERE id = ${body.id}`;
    return;
  }

  async deletePallet(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      const [pallet] = await sql`
        SELECT pallets.id, pallets.folio, pallets."clientId", pallets."exportOrderId", clients.name AS client
        FROM pallets JOIN clients ON clients.id = pallets."clientId"
        WHERE pallets.id = ${body.id}`;
      if (!pallet) throw new HttpException('Pallet no existente', 400);
      if (pallet.exportOrderId)
        throw new HttpException('El pallet ya está en una exportación', 400);

      await sql`DELETE FROM pallets WHERE id = ${body.id}`;

      // if it was the client's latest folio, roll the counter back so the
      // number gets reused; historical gaps are never reused
      await sql`UPDATE clients SET "palletSeq" = "palletSeq" - 1
        WHERE id = ${pallet.clientId} AND "palletSeq" = ${pallet.folio}`;

      await this.req.record(
        `Elimino el pallet ${pallet.client}-${pallet.folio}`,
        sql,
      );
    });
    return;
  }

  async downloadLabel(body: z.infer<typeof idObjectSchema>) {
    const [pallet] = await sql`
      SELECT pallets.folio, clients.name AS client,
        (SELECT json_agg(json_build_object(
            'ref', j.ref, 'part', j.part, 'description', j.description, 'amount', pc.amount) ORDER BY pc.id)
          FROM pallet_contents pc JOIN jobs j ON j.id = pc."jobId"
          WHERE pc."palletId" = pallets.id) AS contents
      FROM pallets JOIN clients ON clients.id = pallets."clientId"
      WHERE pallets.id = ${body.id}`;
    if (!pallet) throw new HttpException('Pallet no existente', 400);

    return generatePalletLabelPdf(pallet as any);
  }

  // ---- Export orders ----

  async createExportOrder(body: z.infer<typeof createExportOrderSchema>) {
    let orderId: number;

    await sql.begin(async (sql) => {
      const pallets = await sql`
        SELECT id, folio, "clientId", "exportOrderId" FROM pallets
        WHERE id IN ${sql(body.palletIds)}`;

      if (pallets.length !== body.palletIds.length)
        throw new HttpException('Uno o varios pallets no existen', 400);
      if (pallets.some((p) => p.exportOrderId))
        throw new HttpException(
          'Uno o varios pallets ya están en una exportación',
          400,
        );
      const clientIds = new Set(pallets.map((p) => String(p.clientId)));
      if (clientIds.size > 1)
        throw new HttpException(
          'Todos los pallets deben ser del mismo cliente',
          400,
        );

      const [order] = await sql`INSERT INTO exportorders ${sql({
        clientId: pallets[0].clientId,
      })} RETURNING id`;
      orderId = order.id;

      await sql`UPDATE pallets SET "exportOrderId" = ${order.id} WHERE id IN ${sql(body.palletIds)}`;

      await this.req.record(
        `Creo la orden de exportación ${order.id} con ${pallets.length} pallets`,
        sql,
      );
    });

    return { id: orderId };
  }

  async getExportOrders(query: z.infer<typeof exportOrdersFilterSchema>) {
    return sql`
      SELECT eo.id, eo.date, eo.created_at, clients.name AS client,
        (SELECT COUNT(*)::int FROM pallets p WHERE p."exportOrderId" = eo.id) AS pallets,
        (SELECT COALESCE(SUM(pc.amount), 0)::int FROM pallets p
          JOIN pallet_contents pc ON pc."palletId" = p.id
          WHERE p."exportOrderId" = eo.id) AS pieces,
        (SELECT COALESCE(SUM(pc.boxes), 0)::int FROM pallets p
          JOIN pallet_contents pc ON pc."palletId" = p.id
          WHERE p."exportOrderId" = eo.id) AS boxes
      FROM exportorders eo
      JOIN clients ON clients.id = eo."clientId"
      WHERE TRUE
      ${query.id ? sql`AND eo.id = ${Number(query.id) || 0}` : sql``}
      ORDER BY eo.id DESC
      LIMIT 150`;
  }

  async deleteExportOrder(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      const [deleted] =
        await sql`DELETE FROM exportorders WHERE id = ${body.id} RETURNING id`;
      if (!deleted) throw new HttpException('Orden no existente', 400);

      // if it held the newest number ever issued, roll the sequence back so
      // the number gets reused; historical gaps are never reused
      const [{ last_value }] =
        await sql`SELECT last_value FROM exportorders_id_seq`;
      if (Number(last_value) === Number(deleted.id))
        await sql`SELECT setval('exportorders_id_seq', ${deleted.id}, false)`;

      await this.req.record(
        `Elimino la orden de exportación ${deleted.id} (pallets liberados)`,
        sql,
      );
    });
    return;
  }

  async downloadExportOrder(body: z.infer<typeof idObjectSchema>) {
    const [order] = await sql`
      SELECT eo.id, eo.date, clients.name AS client
      FROM exportorders eo JOIN clients ON clients.id = eo."clientId"
      WHERE eo.id = ${body.id}`;
    if (!order) throw new HttpException('Orden no existente', 400);

    const pallets = await sql`
      SELECT pallets.folio,
        (SELECT json_agg(json_build_object(
            'ref', j.ref, 'part', j.part, 'description', j.description,
            'amount', pc.amount, 'boxes', pc.boxes) ORDER BY pc.id)
          FROM pallet_contents pc JOIN jobs j ON j.id = pc."jobId"
          WHERE pc."palletId" = pallets.id) AS contents
      FROM pallets WHERE "exportOrderId" = ${body.id}
      ORDER BY pallets.folio ASC`;

    return generateExportOrderPdf(order as any, pallets as any);
  }
}
