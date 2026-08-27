import { BadRequestException, Injectable } from '@nestjs/common';
import sql from 'src/utils/db';
import { z } from 'zod/v4';
import {
  captureProgressSchema,
  deleteMovementSchema,
  editMovementSchema,
  getHistorySchema,
  getProgressSchema,
} from './progress.schema';
import { ContextProvider } from 'src/interceptors/context.provider';
import { updateContractorAmounts } from '../contractors.utils';

@Injectable()
export class ProgressService {
  constructor(private readonly req: ContextProvider) {}

  async getOrders(body: z.infer<typeof getProgressSchema>) {
    // Una fila por orden×contratista (obs 26-Ago): cada contratista ve SU
    // surtido, SUS entregas y SU faltante — sin mezclar con los demás.
    const jobs = await sql`select jobs.*,
        ec."contractorId",
        ec.surtido AS "contractorAmount",
        COALESCE(del.accepted, 0)::int AS contractor,
        (COALESCE(del.accepted, 0) >= ec.surtido) AS "completedContractor"
       from jobs
       join lateral (
         select e."contractorId", SUM(ej.amount)::int AS surtido
         from exitpass_jobs ej
         join "exitPass" e on e.id = ej."exitId"
         where ej."jobId" = jobs.id
         group by e."contractorId"
       ) ec on ec.surtido > 0
       left join lateral (
         select SUM(cm.accepted)::int AS accepted
         from contractormovements cm
         where cm."orderId" = jobs.id and cm."contractorId" = ec."contractorId"
           and cm.approved = true
       ) del on true
       where true
       ${body.completed === null ? sql`` : body.completed ? sql`AND COALESCE(del.accepted, 0) >= ec.surtido` : sql`AND COALESCE(del.accepted, 0) < ec.surtido`}
       ${body.job ? sql`AND jobs.ref LIKE ${'%' + body.job + '%'}` : sql``}
       ${body.programation ? sql`AND jobs.programation LIKE ${'%' + body.programation + '%'}` : sql``}
       ${body.contractorId ? sql`AND ec."contractorId" = ${body.contractorId}` : sql``}
       order by jobs.ref desc limit 200`;

    return jobs;
  }

  async getOrderHistory(body: z.infer<typeof getHistorySchema>) {
    const movements =
      await sql`select * from contractormovements where "orderId" = ${body.id}
      ${body.contractorId ? sql`and "contractorId" = ${body.contractorId}` : sql``}
      ${body.all === 'true' ? sql`` : sql`and approved = true`}
      order by date desc`;
    return movements;
  }

  async captureDailyProgress(body: z.infer<typeof captureProgressSchema>) {
    await sql.begin(async (sql) => {
      // tope por contratista: lo entregado por ESTE contratista no puede
      // exceder lo que ESE contratista tiene surtido en pases (obs 26-Ago)
      const [order] = await sql`select
         (select COALESCE(SUM(accepted), 0)::integer from contractormovements
           where "orderId" = ${body.orderId} and "contractorId" = ${body.contractorId}) as done,
         (select COALESCE(SUM(ej.amount), 0)::integer from exitpass_jobs ej
           join "exitPass" e on e.id = ej."exitId"
           where ej."jobId" = ${body.orderId} and e."contractorId" = ${body.contractorId}) as amount,
         (select ref from jobs where id = ${body.orderId})`;

      if (order.amount === 0)
        throw new BadRequestException(
          'Ese contratista no tiene pases de salida de esta orden',
        );
      if (order.done + body.amount > order.amount)
        throw new BadRequestException(
          'El progreso no puede ser mayor a lo surtido a ese contratista',
        );

      await sql`insert into contractormovements (date, "orderId", "contractorId", amount) values (${body.date}, ${body.orderId}, ${body.contractorId}, ${body.amount})`;
      await updateContractorAmounts(body.orderId, sql);

      await this.req.record(
        `Agregó ${body.amount}pz a contratista, orden: ${order.ref}`,
        sql,
      );
    });
  }

  async editMovement(body: z.infer<typeof editMovementSchema>) {
    await sql.begin(async (sql) => {
      const [movement] = await sql`select contractormovements.*, jobs.ref,
          jobs."contractorAmount"
        from contractormovements
        join jobs on jobs.id = contractormovements."orderId"
        where contractormovements.id = ${body.id}`;

      if (!movement) throw new BadRequestException('Captura no encontrada');
      if (movement.paymentId)
        throw new BadRequestException(
          'La entrega ya está incluida en un pago, no se puede modificar',
        );
      if (body.amount < movement.rejected)
        throw new BadRequestException(
          'La cantidad no puede ser menor a la cantidad rechazada',
        );

      const [others] = await sql`select COALESCE(SUM(accepted), 0)::int as done
        from contractormovements
        where "orderId" = ${movement.orderId} and id != ${body.id}
          and "contractorId" is not distinct from ${movement.contractorId}`;
      const [{ surtido }] = await sql`select COALESCE(SUM(ej.amount), 0)::int as surtido
        from exitpass_jobs ej join "exitPass" e on e.id = ej."exitId"
        where ej."jobId" = ${movement.orderId} and e."contractorId" = ${movement.contractorId}`;

      if (others.done + (body.amount - movement.rejected) >
        (surtido || movement.contractorAmount))
        throw new BadRequestException(
          'El progreso no puede ser mayor al total',
        );

      await sql`update contractormovements set amount = ${body.amount}, date = ${body.date}
        where id = ${body.id}`;
      await updateContractorAmounts(movement.orderId, sql);

      await this.req.record(
        `Editó captura de contratista (${movement.amount}pz → ${body.amount}pz), orden: ${movement.ref}`,
        sql,
      );
    });
  }

  async deleteMovement(body: z.infer<typeof deleteMovementSchema>) {
    await sql.begin(async (sql) => {
      const [movement] = await sql`select contractormovements.*, jobs.ref
        from contractormovements
        join jobs on jobs.id = contractormovements."orderId"
        where contractormovements.id = ${body.id}`;

      if (!movement) throw new BadRequestException('Captura no encontrada');
      if (movement.paymentId)
        throw new BadRequestException(
          'La entrega ya está incluida en un pago, no se puede eliminar',
        );

      await sql`delete from contractormovements where id = ${body.id}`;
      await updateContractorAmounts(movement.orderId, sql);

      await this.req.record(
        `Eliminó captura de contratista de ${movement.amount}pz, orden: ${movement.ref}`,
        sql,
      );
    });
  }
}
