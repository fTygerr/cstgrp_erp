import { BadRequestException, Injectable } from '@nestjs/common';
import sql from 'src/utils/db';
import { z } from 'zod/v4';
import {
  getHistorySchema,
  getMovementsSchema,
  updateHistorySchema,
} from './history.schema';
import { ContextProvider } from 'src/interceptors/context.provider';
import { idObjectSchema } from 'src/utils/schemas';
import { updateOrderAmounts } from '../production.utils';

@Injectable()
export class HistoryService {
  constructor(private readonly req: ContextProvider) {}

  async getOrders(body: z.infer<typeof getHistorySchema>) {
    // Producción y Calidad incluyen lo hecho por contratistas (obs 07/09):
    // producción = interna + entregas aceptadas; calidad = liberado total.
    // Cantidad = la cantidad completa de la orden.
    const orders = await sql`
    select id, programation, ref, part, description, "due", "clientId",
    amount, completed,
    CASE WHEN "serigrafiaTime" > 0 THEN "serigrafia" ELSE NULL END as "serigrafia",
    CASE WHEN "corteTime" > 0 THEN "corte" ELSE NULL END as "corte",
    CASE WHEN "cortesVariosTime" > 0 THEN "cortesVarios" ELSE NULL END as "cortesVarios",
    CASE WHEN "produccionTime" > 0 OR contractor > 0 THEN ("produccion" + contractor) ELSE NULL END as "produccion",
    CASE WHEN "calidadTime" > 0 OR contractor > 0 THEN ("calidad" + contractor) ELSE NULL END as "calidad"
    from jobs
    WHERE
      ${body.jobpo ? sql`ref LIKE ${'%' + body.jobpo + '%'}` : sql`TRUE`} AND
      ${body.programation ? sql`programation LIKE ${'%' + body.programation + '%'}` : sql`TRUE`} AND
      ${body.clientId ? sql`"clientId" = ${body.clientId}` : sql`TRUE`} AND
      completed = ${body.completed}
    order by "due" desc, ref desc limit 100
    `;
    return orders;
  }

  async getMovements(body: z.infer<typeof getMovementsSchema>) {
    // historial cronológico completo (obs 07/09): capturas internas + entregas
    // de contratistas aceptadas (producción externa y liberación de calidad).
    // Las filas de contratista son de solo lectura (editable = false).
    const jobs = await sql`
      select id, created_at, date, corte, "cortesVarios", produccion, calidad,
        serigrafia, NULL::text as contratista, NULL::int as entrega, true as editable
      from ordermovements where "progressId" = ${body.id}
      UNION ALL
      select cm.id, cm.created_at, cm.date, NULL, NULL, NULL, NULL, NULL,
        COALESCE(c.name, '(sin contratista)'), cm.accepted::int, false
      from contractormovements cm
      left join contractors c on c.id = cm."contractorId"
      where cm."orderId" = ${body.id} and cm.approved = true
      order by date asc, created_at asc`;
    return jobs;
  }

  async updateHistory(body: z.infer<typeof updateHistorySchema>) {
    await sql.begin(async (sql) => {
      const [order] = await sql`select *,
         (select SUM(${sql(body.area)})::integer from ordermovements om2 where om2."progressId" = ordermovements."progressId") as done,
         (select "prodAmount" from jobs where id = ordermovements."progressId"),
         (select "amount" from jobs where id = ordermovements."progressId"),
         (select ref from jobs where id = ordermovements."progressId") as ref
         from ordermovements where id = ${body.id}`;

      //check to not surpass previous areas
      if (body.area === 'calidad' || body.area === 'produccion') {
        if (order.done - order[body.area] + body.amount > order.prodAmount)
          throw new BadRequestException(
            'El progreso no puede ser mayor al total',
          );
      } else {
        if (order.done - order[body.area] + body.amount > order.amount)
          throw new BadRequestException(
            'El progreso no puede ser mayor al total',
          );
      }

      await sql`update ordermovements set ${sql(body.area)} = ${body.amount} where id = ${body.id}`;
      await updateOrderAmounts(order.progressId, sql);
      await this.req.record(
        `Actualizó ${body.area} de ${order.ref} a ${body.amount}pz`,
        sql,
      );
    });
  }

  async deleteHistory(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      const [order] =
        await sql`delete from ordermovements where id = ${body.id} returning "progressId"`;
      await updateOrderAmounts(order.progressId, sql);
      await this.req.record(`Eliminó un registro de producción`, sql);
    });
  }
}
