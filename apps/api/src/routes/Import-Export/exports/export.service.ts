import { Injectable } from '@nestjs/common';
import { ContextProvider } from 'src/interceptors/context.provider';
import { z } from 'zod/v4';
import { getExportSchema, getInventoryExportSchema } from './export.schema';
import sql from 'src/utils/db';

@Injectable()
export class ExportService {
  constructor(private readonly context: ContextProvider) {}

  // Jobs liberados por Calidad, con sus pallets disponibles (sin exportar).
  // Base del nuevo flujo de generación de packing lists.
  async findAll(filter: z.infer<typeof getExportSchema>) {
    // filtro por folio de orden de exportación (obs 03/09 p.4): cuando viene,
    // los pallets listados/contados son EXACTAMENTE los de esa orden
    const eo = filter.exportOrder ? Number(filter.exportOrder) : null;
    const palletScope = () =>
      eo ? sql`and p."exportOrderId" = ${eo}` : sql``;
    return sql`select
    jobs.id, jobs.ref, jobs.programation,
    COALESCE(materials.code, jobs.part) as part,
    jobs.description,
    clients.name as client, clients.id as "clientId",
    jobs.amount, (jobs.calidad + jobs.contractor)::int as liberated,
    (select string_agg(distinct d.so, ', ')
      from order_destiny od join destinys d on d.id = od."destinyId"
      where od."orderId" = jobs.id and od."exportOrderId" is null
        and d.exported is null) as so,
    (select string_agg(p.folio::text, ', ' order by p.folio)
      from pallets p
      where p."destinyId" is null ${palletScope()}
        and exists (select 1 from pallet_contents pc
          where pc."palletId" = p.id and pc."jobId" = jobs.id)) as "palletFolios",
    (select count(*)::int
      from pallets p
      where p."destinyId" is null ${palletScope()}
        and exists (select 1 from pallet_contents pc
          where pc."palletId" = p.id and pc."jobId" = jobs.id)) as "palletCount",
    (select COALESCE(sum(pc.amount), 0)::int
      from pallet_contents pc join pallets p on p.id = pc."palletId"
      where pc."jobId" = jobs.id and p."destinyId" is null ${palletScope()}) as "availableAmount"

    from jobs
    join clients on clients.id = jobs."clientId"
    left join materialmovements on jobs."movementId" = materialmovements.id
    left join materials on materialmovements."materialId" = materials.id

    -- liberado incluye entregas de contratista aceptadas (obs 02/09 punto 1;
    -- fix 03/09: este listado se quedó con la regla vieja y ocultaba jobs
    -- liberados 100% vía contratista — caso pallet 92 / S-16898)
    where (jobs.calidad + jobs.contractor) > 0
    and exists (select 1 from pallet_contents pc
      join pallets p on p.id = pc."palletId"
      where pc."jobId" = jobs.id and p."destinyId" is null ${palletScope()})
    ${filter.job ? sql`AND jobs.ref ILIKE ${'%' + filter.job + '%'}` : sql``}
    ${filter.part ? sql`AND COALESCE(materials.code, jobs.part) ILIKE ${'%' + filter.part + '%'}` : sql``}
    ${filter.clientId ? sql`AND clients.id = ${filter.clientId}` : sql``}
    order by jobs.ref desc
    limit 300`;
  }

  // Materia prima / subproductos exportables directo del inventario (obs 04/08)
  async findInventory(filter: z.infer<typeof getInventoryExportSchema>) {
    return sql`select
      materials.id, materials.code, materials.description, materials.measurement,
      materials.total::float as available,
      clients.name as client, clients.id as "clientId"
    from materials
    left join clients on clients.id = materials."clientId"
    where COALESCE(materials.type,
        case when materials.product then 'producto' else 'materiaPrima' end) = ${filter.type}
      and materials.total > 0
    ${filter.code ? sql`AND (materials.code ILIKE ${'%' + filter.code + '%'} OR materials.description ILIKE ${'%' + filter.code + '%'})` : sql``}
    ${filter.clientId ? sql`AND materials."clientId" = ${filter.clientId}` : sql``}
    order by materials.code
    limit 300`;
  }
}
