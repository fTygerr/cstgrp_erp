import { Injectable } from '@nestjs/common';
import { ContextProvider } from 'src/interceptors/context.provider';
import { z } from 'zod/v4';
import { getExportSchema } from './export.schema';
import sql from 'src/utils/db';

@Injectable()
export class ExportService {
  constructor(private readonly context: ContextProvider) {}

  // Jobs liberados por Calidad, con sus pallets disponibles (sin exportar).
  // Base del nuevo flujo de generación de packing lists.
  async findAll(filter: z.infer<typeof getExportSchema>) {
    return sql`select
    jobs.id, jobs.ref, jobs.programation,
    COALESCE(materials.code, jobs.part) as part,
    jobs.description,
    clients.name as client, clients.id as "clientId",
    jobs.amount, jobs.calidad as liberated,
    (select string_agg(distinct d.so, ', ')
      from order_destiny od join destinys d on d.id = od."destinyId"
      where od."orderId" = jobs.id and od."exportOrderId" is null
        and d.exported is null) as so,
    (select string_agg(p.folio::text, ', ' order by p.folio)
      from pallets p
      where p."destinyId" is null
        and exists (select 1 from pallet_contents pc
          where pc."palletId" = p.id and pc."jobId" = jobs.id)) as "palletFolios",
    (select count(*)::int
      from pallets p
      where p."destinyId" is null
        and exists (select 1 from pallet_contents pc
          where pc."palletId" = p.id and pc."jobId" = jobs.id)) as "palletCount",
    (select COALESCE(sum(pc.amount), 0)::int
      from pallet_contents pc join pallets p on p.id = pc."palletId"
      where pc."jobId" = jobs.id and p."destinyId" is null) as "availableAmount"

    from jobs
    join clients on clients.id = jobs."clientId"
    left join materialmovements on jobs."movementId" = materialmovements.id
    left join materials on materialmovements."materialId" = materials.id

    where jobs.calidad > 0
    and exists (select 1 from pallet_contents pc
      join pallets p on p.id = pc."palletId"
      where pc."jobId" = jobs.id and p."destinyId" is null)
    ${filter.job ? sql`AND jobs.ref ILIKE ${'%' + filter.job + '%'}` : sql``}
    ${filter.part ? sql`AND COALESCE(materials.code, jobs.part) ILIKE ${'%' + filter.part + '%'}` : sql``}
    ${filter.clientId ? sql`AND clients.id = ${filter.clientId}` : sql``}
    order by jobs.ref desc
    limit 300`;
  }
}
