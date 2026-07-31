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
    const jobs = await sql`select jobs.*, "exitPass"."contractorId"
       from jobs
       left join "exitPass" on "exitPass"."id" = jobs."exitId"
       where "contractorAmount" > 0
       ${body.completed === null ? sql`` : body.completed ? sql`AND jobs."completedContractor" = true` : sql`AND jobs."completedContractor" = false`}
       ${body.job ? sql`AND jobs.ref LIKE ${'%' + body.job + '%'}` : sql``}
       ${body.programation ? sql`AND jobs.programation LIKE ${'%' + body.programation + '%'}` : sql``}
       ${body.contractorId ? sql`AND "exitPass"."contractorId" = ${body.contractorId}` : sql``}
       order by jobs.ref desc limit 200`;

    return jobs;
  }

  async getOrderHistory(body: z.infer<typeof getHistorySchema>) {
    const movements =
      await sql`select * from contractormovements where "orderId" = ${body.id}
      ${body.all === 'true' ? sql`` : sql`and approved = true`}
      order by date desc`;
    return movements;
  }

  async captureDailyProgress(body: z.infer<typeof captureProgressSchema>) {
    await sql.begin(async (sql) => {
      const [order] = await sql`select SUM(accepted)::integer as done,
         (select "contractorAmount" from jobs where id = ${body.orderId}) as amount,
         (select ref from jobs where id = ${body.orderId})
          from contractormovements where "orderId" = ${body.orderId}`;

      if (order.done + body.amount > order.amount)
        throw new BadRequestException(
          'El progreso no puede ser mayor al total',
        );

      await sql`insert into contractormovements (date, "orderId", amount) values (${body.date}, ${body.orderId}, ${body.amount})`;
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
        where "orderId" = ${movement.orderId} and id != ${body.id}`;

      if (others.done + (body.amount - movement.rejected) >
        movement.contractorAmount)
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
