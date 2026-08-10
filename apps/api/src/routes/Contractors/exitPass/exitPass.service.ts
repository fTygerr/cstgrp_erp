import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { ContextProvider } from 'src/interceptors/context.provider';
import {
  editPassSchema,
  getJobsSchema,
  getPassesSchema,
} from './exitPass.schema';
import sql from 'src/utils/db';
import { idObjectSchema } from 'src/utils/schemas';
import { fillExitPass } from './exitPass.generate';

@Injectable()
export class ExitPassService {
  constructor(private readonly req: ContextProvider) {}

  async getAll(body: z.infer<typeof getPassesSchema>) {
    const passes = await sql`select * from "exitPass"
    WHERE 
    ${body.contractorId ? sql`"contractorId" = ${body.contractorId}` : sql`TRUE`} AND
    ${body.date ? sql`"date" = ${body.date}` : sql`TRUE`}
    ORDER BY "date" DESC
    `;

    return passes;
  }

  async createOrEdit(
    body: z.infer<typeof editPassSchema>,
    edit: boolean = false,
  ) {
    const jobsRows = await sql`
    select jobs.id, jobs.ref, COALESCE(materials.code, jobs.part) as code
    from jobs
    left join materialmovements on jobs."movementId" = materialmovements.id
    left join materials on materialmovements."materialId" = materials.id
    where jobs.id in ${sql(body.jobs.map((job) => job.id))}`;

    const jobs = jobsRows.map((job) => ({
      id: job.id,
      ref: job.ref,
      code: job.code,
      contractorAmount:
        body.jobs.find((j) => j.id === job.id)?.contractorAmount || 0,
      price: 0,
    }));

    for (const job of jobs) {
      const [contractorPrice] = await sql`select * from contractor_prices 
      WHERE "contractorId" = ${body.contractorId} 
      AND part = ${job.code}`;

      if (!contractorPrice) {
        throw new HttpException(`Precio no encontrado: ${job.ref}`, 400);
      }

      job.price = contractorPrice.price;
    }

    if (jobsRows.length !== body.jobs.length) {
      throw new HttpException('Uno o varios jobs no encontrados', 400);
    }
    if (jobs.some((job) => !job.price || job.price <= 0)) {
      throw new HttpException('El precio no puede ser 0', 400);
    }
    if (jobs.some((job) => job.contractorAmount <= 0)) {
      throw new HttpException('La cantidad de producción no puede ser 0', 400);
    }

    await sql.begin(async (sql) => {
      let passId: number;
      const touchedJobs = new Set<number>();

      if (edit) {
        const [updatedPass] =
          await sql`update "exitPass" set ${sql({ date: body.date, contractorId: body.contractorId })} where id = ${body.id} returning id`;

        if (!updatedPass) {
          throw new HttpException('Pase no encontrado', 400);
        }
        passId = updatedPass.id;

        const previous = await sql`delete from exitpass_jobs
          where "exitId" = ${passId} returning "jobId"`;
        for (const row of previous) touchedJobs.add(Number(row.jobId));
      } else {
        const [insertedPass] =
          await sql`insert into "exitPass" ("date", "contractorId", "folio") values
          (${body.date}, ${body.contractorId}, (select COALESCE(max(folio), 0) from "exitPass") + 1) returning id`;
        passId = insertedPass.id;
      }

      for (const job of jobs) {
        // saldo: lo asignado en OTROS pases no puede excederse (obs Juan 10/08)
        const [{ assigned }] = await sql`select COALESCE(sum(amount), 0)::int as assigned
          from exitpass_jobs where "jobId" = ${job.id}`;
        const [{ amount: total }] =
          await sql`select amount from jobs where id = ${job.id}`;
        if (assigned + job.contractorAmount > Number(total))
          throw new HttpException(
            `${job.ref}: la cantidad excede el restante (${Number(total) - assigned} de ${total})`,
            400,
          );

        await sql`insert into exitpass_jobs ${sql({
          exitId: passId,
          jobId: job.id,
          amount: job.contractorAmount,
          price: job.price,
        })}`;
        touchedJobs.add(Number(job.id));
      }

      for (const jobId of touchedJobs) await this.resyncJob(sql, jobId);
    });
  }

  async delete(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      const rows = await sql`delete from exitpass_jobs
        where "exitId" = ${body.id} returning "jobId"`;
      await sql`delete from "exitPass" where id = ${body.id}`;
      for (const row of rows) await this.resyncJob(sql, Number(row.jobId));
    });
    return;
  }

  // jobs.contractorAmount = suma de todos sus pases; exitId/contractorPrice =
  // último pase (compatibilidad con entregas, pagos y progress)
  private async resyncJob(sql2: any, jobId: number) {
    await sql2`update jobs set
      "contractorAmount" = COALESCE((select sum(amount) from exitpass_jobs where "jobId" = ${jobId}), 0),
      "contractorPrice" = (select price from exitpass_jobs where "jobId" = ${jobId} order by id desc limit 1),
      "exitId" = (select "exitId" from exitpass_jobs where "jobId" = ${jobId} order by id desc limit 1)
      where id = ${jobId}`;
  }

  async getJobs(body: z.infer<typeof getJobsSchema>) {
    if (!body.contractorId) return [];

    const jobs = await sql`
    SELECT * FROM (
      select jobs.id, jobs.ref, COALESCE(materials.code, jobs.part) as code, jobs.description, jobs.amount,
        jobs.amount - COALESCE((select sum(ej.amount) from exitpass_jobs ej where ej."jobId" = jobs.id), 0) as remaining
      from jobs
      left join materialmovements on jobs."movementId" = materialmovements.id
      left join materials on materialmovements."materialId" = materials.id
      order by due desc, ref desc
      limit 500
    ) 
      WHERE code is not null
      AND remaining > 0
      AND code in (select part from contractor_prices where "contractorId" = ${body.contractorId})
    `;

    return jobs;
  }

  async getJobsForExitPass(exitId: number) {
    return sql`
      select jobs.id, jobs.ref, COALESCE(materials.code, jobs.part) as code, jobs.description, jobs.amount,
        ej.amount as "contractorAmount",
        jobs.amount - COALESCE((select sum(e2.amount) from exitpass_jobs e2
          where e2."jobId" = jobs.id and e2."exitId" != ${exitId}), 0) as remaining
      from exitpass_jobs ej
      join jobs on jobs.id = ej."jobId"
      left join materialmovements on jobs."movementId" = materialmovements.id
      left join materials on materialmovements."materialId" = materials.id
      where ej."exitId" = ${exitId}
      order by jobs.due desc, jobs.ref desc
`;
  }

  async download(body: z.infer<typeof idObjectSchema>) {
    const [data] =
      await sql`select *, (select name from contractors where id = "contractorId") as contractor from "exitPass" where id = ${body.id}`;

    data.jobs =
      await sql`select jobs.ref, jobs.description, ej.amount as "contractorAmount"
    from exitpass_jobs ej
    join jobs on jobs.id = ej."jobId"
    where ej."exitId" = ${body.id}
    order by jobs.due desc, jobs.ref desc`;

    const templatePath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'static',
      'templates',
      'exitPass.pdf',
    );

    const template = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(template);
    const [page] = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    fillExitPass(page, font, data);

    const pdfBytes = await pdfDoc.save();

    return pdfBytes;
  }
}
