import puppeteer from 'puppeteer';
import Mustache from 'mustache';
import { Injectable } from '@nestjs/common';
import { ContextProvider } from 'src/interceptors/context.provider';
import sql from 'src/utils/db';
import { z } from 'zod/v4';
import {
  createInventoryPlSchema,
  createPackingListSchema,
  downloadPackingListSchema,
  editPackingListSchema,
  getPackingListsSchema,
  previewPackingListSchema,
  updatePlDataSchema,
} from './packing-list.schema';
import path from 'path';
import { promises as fs } from 'fs';
import { idObjectSchema } from 'src/utils/schemas';
import { format } from 'date-fns';
import { updateMaterialAmount } from 'src/utils/functions';
import { HttpException } from '@nestjs/common';
import { applyExportOrderSchema } from './packing-list.schema';
import { generateExportOrderPdf } from 'src/routes/Quality/pallets/pallets.generate';

@Injectable()
export class PackingListService {
  constructor(private readonly req: ContextProvider) {}

  async getOptions() {
    const carriers =
      await sql`select id as value, name from carriers order by name`;
    const shippers =
      await sql`select id as value, name from shippers order by name`;
    const destinations =
      await sql`select id as value, name from "destinationDirections" order by name`;
    const clients =
      await sql`select id as value, "legalName" as name from clients order by name`;
    const shipTo =
      await sql`select id as value, name from "shipTo" order by name`;

    return { carriers, shippers, destinations, clients, shipTo };
  }

  async getData(body: z.infer<typeof idObjectSchema>) {
    const orders = await sql`select 
    order_destiny.id,
    jobs.ref,
    jobs.part,
    order_destiny.amount,
    order_destiny.date,
    order_destiny.pallets

    from order_destiny
    left join jobs on jobs.id = order_destiny."orderId" 
    where order_destiny."destinyId" = ${body.id}`;

    const [data] = await sql`select * from destinys where id = ${body.id}`;

    return { orders, data };
  }

  // Export orders created by Calidad, available for (or applied to) this PL
  async getExportOrders(body: z.infer<typeof idObjectSchema>) {
    const orders = await sql`
      SELECT eo.id, eo.date, eo."destinyId", clients.name AS client,
        (SELECT COUNT(*)::int FROM pallets p WHERE p."exportOrderId" = eo.id) AS pallets,
        (SELECT COALESCE(SUM(pc.amount), 0)::int FROM pallets p
          JOIN pallet_contents pc ON pc."palletId" = p.id
          WHERE p."exportOrderId" = eo.id) AS pieces
      FROM exportorders eo
      JOIN clients ON clients.id = eo."clientId"
      WHERE eo."destinyId" IS NULL OR eo."destinyId" = ${body.id}
      ORDER BY eo.id DESC LIMIT 100`;

    return {
      applied: orders.filter((o) => o.destinyId),
      available: orders.filter((o) => !o.destinyId),
    };
  }

  // Pour an export order's pallets into the PL as order_destiny lines
  async applyExportOrder(body: z.infer<typeof applyExportOrderSchema>) {
    await sql.begin(async (sql) => {
      const [order] = await sql`
        SELECT id, "destinyId" FROM exportorders WHERE id = ${body.exportOrderId}`;
      if (!order) throw new HttpException('Orden no existente', 400);
      if (order.destinyId)
        throw new HttpException(
          'La orden ya está aplicada a otro packing list',
          400,
        );

      // per job: total pieces and fractional pallets (share of each pallet)
      const lines = await sql`
        SELECT pc."jobId",
          SUM(pc.amount)::int AS amount,
          ROUND(SUM(pc.amount::numeric / pt.total), 4) AS pallets
        FROM pallets p
        JOIN pallet_contents pc ON pc."palletId" = p.id
        JOIN LATERAL (
          SELECT SUM(amount)::numeric AS total FROM pallet_contents WHERE "palletId" = p.id
        ) pt ON true
        WHERE p."exportOrderId" = ${body.exportOrderId}
          AND p."destinyId" IS NULL
        GROUP BY pc."jobId"`;
      if (!lines.length)
        throw new HttpException('La orden no tiene pallets disponibles', 400);

      for (const line of lines) {
        await sql`INSERT INTO order_destiny ${sql({
          orderId: line.jobId,
          destinyId: body.id,
          amount: line.amount,
          date: new Date(),
          po: '',
          pallets: line.pallets,
          exportOrderId: body.exportOrderId,
        })}`;
      }

      await sql`UPDATE exportorders SET "destinyId" = ${body.id} WHERE id = ${body.exportOrderId}`;
      // liga también los pallets al PL: dejan de estar disponibles en Imp-Exp
      await sql`UPDATE pallets SET "destinyId" = ${body.id}
        WHERE "exportOrderId" = ${body.exportOrderId} AND "destinyId" IS NULL`;

      await this.req.record(
        `Aplico la orden de exportación ${body.exportOrderId} al packing list`,
        sql,
      );
    });
    return;
  }

  // Detach an export order: remove exactly the lines it generated
  async removeExportOrder(body: z.infer<typeof applyExportOrderSchema>) {
    await sql.begin(async (sql) => {
      const movements = await sql`
        SELECT "materialId" FROM materialmovements
        WHERE "orderDestinyId" IN
          (SELECT id FROM order_destiny WHERE "exportOrderId" = ${body.exportOrderId} AND "destinyId" = ${body.id})`;

      await sql`DELETE FROM order_destiny WHERE "exportOrderId" = ${body.exportOrderId} AND "destinyId" = ${body.id}`;
      await sql`UPDATE exportorders SET "destinyId" = NULL WHERE id = ${body.exportOrderId}`;
      await sql`UPDATE pallets SET "destinyId" = NULL
        WHERE "exportOrderId" = ${body.exportOrderId} AND "destinyId" = ${body.id}`;

      for (const movement of movements)
        await updateMaterialAmount(movement.materialId, sql);

      await this.req.record(
        `Quito la orden de exportación ${body.exportOrderId} del packing list`,
        sql,
      );
    });
    return;
  }

  // "Desgloce de pallets": same layout as the Orden de Exportación, per-pallet
  // detail of everything shipped by this PL
  async downloadDesglose(body: z.infer<typeof idObjectSchema>) {
    const [destiny] = await sql`
      SELECT id, so, "packSlip" FROM destinys WHERE id = ${body.id}`;
    if (!destiny) throw new HttpException('Packing list no existente', 400);

    const orders = await sql`
      SELECT eo.id, eo.date, clients.name AS client
      FROM exportorders eo JOIN clients ON clients.id = eo."clientId"
      WHERE eo."destinyId" = ${body.id} ORDER BY eo.id`;

    const pallets = await sql`
      SELECT pallets.folio,
        (SELECT json_agg(json_build_object(
            'ref', j.ref, 'part', j.part, 'description', j.description,
            'amount', pc.amount, 'boxes', pc.boxes) ORDER BY pc.id)
          FROM pallet_contents pc JOIN jobs j ON j.id = pc."jobId"
          WHERE pc."palletId" = pallets.id) AS contents
      FROM pallets
      WHERE pallets."destinyId" = ${body.id}
      ${orders.length ? sql`OR pallets."exportOrderId" IN ${sql(orders.map((o) => o.id))}` : sql``}
      ORDER BY pallets.folio ASC`;
    if (!pallets.length)
      throw new HttpException('El packing list no tiene pallets ligados', 400);

    const [meta] = await sql`
      SELECT COALESCE(d."shipDate", d.created_at::date) AS date,
        (SELECT string_agg(DISTINCT c.name, ', ')
          FROM order_destiny od JOIN jobs j ON j.id = od."orderId"
          JOIN clients c ON c.id = j."clientId"
          WHERE od."destinyId" = d.id) AS client
      FROM destinys d WHERE d.id = ${body.id}`;

    return generateExportOrderPdf(
      {
        id: destiny.id,
        date: orders[0]?.date || meta.date,
        client: orders[0]?.client || meta.client || '',
      } as any,
      pallets as any,
      { title: 'DESGLOCE DE PALLETS', packSlip: destiny.packSlip || destiny.so },
    );
  }

  async update(body: z.infer<typeof editPackingListSchema>) {
    await sql.begin(async (sql) => {
      const [previousData] =
        await sql`select so from destinys where id = ${body.id}`;

      const headerData = await sql`select key, data from docs_data`;

      const orders = await sql`select 
      COALESCE(jobs.ref, '') as ref,
      COALESCE(jobs.part, '') as part,
      COALESCE(order_destiny.amount, 0) as amount,
      COALESCE(order_destiny.po, '') as po,
      COALESCE(order_destiny.pallets, 0) as pallets,
      COALESCE(jobs.description, '') as description,
      jobs."perBox",
      'EA' as umc
  
      from order_destiny
      left join jobs on jobs.id = order_destiny."orderId" 
      where order_destiny."destinyId" = ${body.id}`;

      const [shipper] =
        await sql`select name from shippers where id = ${body.shipVia}`;
      const [consignee] =
        await sql`select "legalName" from clients where id = ${body.consignee}`;
      const [destination] =
        await sql`select name, direction from "destinationDirections" where id = ${body.destination}`;
      const [carrier] =
        await sql`select name from carriers where id = ${body.carrierExp}`;
      const [shipTo] =
        await sql`select name, direction from "shipTo" where id = ${body.shipTo}`;

      const packingData = {
        ...body,

        exported: headerData.find((item) => item.key === 'ie_exported')?.data,
        soldTo: headerData.find((item) => item.key === 'ie_sold_to')?.data,
        orders: orders,

        shipVia: shipper.name,
        consignee: consignee.legalName,
        destination: destination,
        carrierExp: carrier.name,
        shipTo: shipTo,
      };

      await sql`update destinys set ${sql(packingData)} where id = ${body.id}`;

      // Saving the PL is the export act: rebuild the negative inventory
      // movements for every shipped line (idempotent on re-save). Jobs
      // without a product movement (pre part-driven registration) are skipped.
      const deletedMovements =
        await sql`delete from materialmovements where "orderDestinyId" in
          (select id from order_destiny where "destinyId" = ${body.id})
          returning "materialId"`;

      const insertedMovements = await sql`
        insert into materialmovements
          ("materialId", "orderDestinyId", amount, "realAmount", active, "activeDate")
        select mm."materialId", od.id, -od.amount, -od.amount, true, now()
        from order_destiny od
        join jobs j on j.id = od."orderId"
        join materialmovements mm on mm.id = j."movementId"
        where od."destinyId" = ${body.id}
        returning "materialId"`;

      const affectedMaterials = new Set(
        [...deletedMovements, ...insertedMovements].map((m) => m.materialId),
      );
      for (const materialId of affectedMaterials)
        await updateMaterialAmount(materialId, sql);

      await this.req.record(
        `Actualizo la informacion del packing list ${previousData.so}`,
        sql,
      );
    });
    return;
  }

  // PL de inventario (obs 04/08): materia prima / subproducto directo del
  // inventario. Descuenta existencias con referencia al PL; sin jobs/pallets.
  async createInventory(body: z.infer<typeof createInventoryPlSchema>) {
    let result: { id: number; folio: number };
    await sql.begin(async (sql) => {
      const ids = body.lines.map((l) => l.materialId);
      const materials = await sql`
        select materials.id, materials.code, materials.description,
          materials.measurement, materials.total::float as available,
          materials."clientId",
          COALESCE(materials.type,
            case when materials.product then 'producto' else 'materiaPrima' end) as type
        from materials where materials.id in ${sql(ids)}`;

      if (materials.length !== ids.length)
        throw new HttpException('Uno o varios materiales no existen', 400);
      if (materials.some((m) => m.type !== body.plType))
        throw new HttpException(
          'Todos los materiales deben ser del mismo tipo (un solo tipo por PL)',
          400,
        );
      const clientIds = new Set(materials.map((m) => String(m.clientId)));
      if (clientIds.size > 1)
        throw new HttpException(
          'Todos los materiales deben ser del mismo cliente',
          400,
        );
      for (const line of body.lines) {
        const material = materials.find((m) => Number(m.id) === line.materialId);
        if (line.amount > material.available)
          throw new HttpException(
            `${material.code}: la cantidad (${line.amount}) excede la existencia (${material.available})`,
            400,
          );
      }

      const [{ folio }] =
        await sql`SELECT nextval('packslip_seq')::int AS folio`;

      const [destiny] = await sql`
        INSERT INTO destinys (so, "packSlip", "shipDate", "plType")
        VALUES (${'PS-' + folio}, ${String(folio)}, ${body.shipDate}, ${body.plType})
        RETURNING id`;

      const orders = [];
      for (const line of body.lines) {
        const material = materials.find((m) => Number(m.id) === line.materialId);
        const [od] = await sql`INSERT INTO order_destiny ${sql({
          destinyId: destiny.id,
          materialId: line.materialId,
          amount: line.amount,
          date: body.shipDate,
          po: '',
          boxes: line.boxes ?? null,
        })} RETURNING id`;

        await sql`insert into materialmovements
          ("materialId", "orderDestinyId", amount, "realAmount", active, "activeDate")
          values (${line.materialId}, ${od.id}, ${-line.amount}, ${-line.amount}, true, now())`;

        orders.push({
          ref: '',
          part: material.code,
          amount: line.amount,
          po: '',
          pallets: 0,
          description: material.description,
          perBox: null,
          boxes: line.boxes ?? null,
          umc: material.measurement || 'EA',
        });
      }

      const headerData = await sql`select key, data from docs_data`;
      const [shipper] = body.shipVia
        ? await sql`select name from shippers where id = ${body.shipVia}`
        : [null];
      const [consignee] = body.consignee
        ? await sql`select "legalName" from clients where id = ${body.consignee}`
        : [null];
      const [destination] = body.destination
        ? await sql`select name, direction from "destinationDirections" where id = ${body.destination}`
        : [null];
      const [carrier] = body.carrierExp
        ? await sql`select name from carriers where id = ${body.carrierExp}`
        : [null];
      const [shipTo] = body.shipTo
        ? await sql`select name, direction from "shipTo" where id = ${body.shipTo}`
        : [null];

      await sql`update destinys set ${sql({
        shipDate: body.shipDate,
        blNo: body.blNo || '',
        trk: body.trk || '',
        invoice: body.invoice || '',
        weight: body.weight || '',
        po: '',
        exported: headerData.find((item) => item.key === 'ie_exported')?.data,
        soldTo: headerData.find((item) => item.key === 'ie_sold_to')?.data,
        orders: orders,
        shipVia: shipper?.name || '',
        consignee: consignee?.legalName || '',
        destination: destination || null,
        carrierExp: carrier?.name || '',
        shipTo: shipTo || null,
      })} where id = ${destiny.id}`;

      for (const id of ids) await updateMaterialAmount(id, sql);

      await this.req.record(
        `Generó el packing list ${folio} de ${body.plType === 'materiaPrima' ? 'materia prima' : 'subproductos'} (inventario)`,
        sql,
      );

      result = { id: destiny.id, folio };
    });
    return result;
  }

  // Modificar los datos de un PL existente (obs 04/08): actualiza el snapshot
  // de destinys que renderiza el PDF. No toca inventario ni cantidades.
  async updatePlData(body: z.infer<typeof updatePlDataSchema>) {
    await sql.begin(async (sql) => {
      const [destiny] = await sql`
        select id, so, "packSlip", orders from destinys where id = ${body.id}
        and (so LIKE 'PS-%' OR exported IS NOT NULL)`;
      if (!destiny) throw new HttpException('Packing list no existente', 400);

      const changes: Record<string, any> = {};
      for (const key of [
        'shipDate',
        'shipVia',
        'consignee',
        'blNo',
        'trk',
        'po',
        'invoice',
        'weight',
        'carrierExp',
        'exported',
        'soldTo',
        'destination',
        'totalBoxes',
        'totalPallets',
      ])
        if (body[key] !== undefined) changes[key] = body[key];

      if (body.orders !== undefined && Array.isArray(destiny.orders))
        changes.orders = destiny.orders.map((order: any, i: number) => ({
          ...order,
          boxes: body.orders?.[i]?.boxes ?? order.boxes ?? null,
        }));

      if (Object.keys(changes).length)
        await sql`update destinys set ${sql(changes)} where id = ${body.id}`;

      await this.req.record(
        `Modifico los datos del packing list ${destiny.packSlip || destiny.so}`,
        sql,
      );
    });
    return;
  }

  // Folio proyectado para el Pack Slip (el definitivo se asigna al guardar)
  async getNextFolio() {
    const [row] = await sql`
      SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS folio
      FROM packslip_seq`;
    return { folio: Number(row.folio) };
  }

  // Vista previa del PL: jobs seleccionados -> pallets disponibles -> líneas
  async preview(body: z.infer<typeof previewPackingListSchema>) {
    const jobs = await sql`
      SELECT jobs.id, jobs.ref, COALESCE(materials.code, jobs.part) AS part,
        jobs.description, clients.name AS client
      FROM jobs
      JOIN clients ON clients.id = jobs."clientId"
      LEFT JOIN materialmovements ON jobs."movementId" = materialmovements.id
      LEFT JOIN materials ON materialmovements."materialId" = materials.id
      WHERE jobs.id IN ${sql(body.jobIds)}`;

    const pallets = await sql`
      SELECT p.id, p.folio,
        (SELECT json_agg(json_build_object(
            'jobId', pc2."jobId", 'ref', j.ref, 'part', j.part,
            'description', j.description, 'amount', pc2.amount, 'boxes', pc2.boxes)
          ORDER BY pc2.id)
          FROM pallet_contents pc2 JOIN jobs j ON j.id = pc2."jobId"
          WHERE pc2."palletId" = p.id) AS contents
      FROM pallets p
      WHERE p."destinyId" IS NULL
        AND EXISTS (SELECT 1 FROM pallet_contents pc
          WHERE pc."palletId" = p.id AND pc."jobId" IN ${sql(body.jobIds)})
        ${body.exportOrderId ? sql`AND p."exportOrderId" = ${body.exportOrderId}` : sql``}
        ${
          body.excludedPalletIds?.length
            ? sql`AND p.id NOT IN ${sql(body.excludedPalletIds)}`
            : sql``
        }
      ORDER BY p.folio`;

    const palletIds = pallets.map((p) => p.id);

    const lines = palletIds.length
      ? await sql`
        SELECT pc."jobId", j.ref, COALESCE(m.code, j.part) AS part,
          j.description, c.name AS client,
          SUM(pc.amount)::int AS amount,
          ROUND(SUM(pc.amount::numeric / pt.total), 4) AS pallets
        FROM pallet_contents pc
        JOIN pallets p ON p.id = pc."palletId"
        JOIN jobs j ON j.id = pc."jobId"
        JOIN clients c ON c.id = j."clientId"
        LEFT JOIN materialmovements mm ON j."movementId" = mm.id
        LEFT JOIN materials m ON mm."materialId" = m.id
        JOIN LATERAL (
          SELECT SUM(amount)::numeric AS total FROM pallet_contents WHERE "palletId" = p.id
        ) pt ON true
        WHERE pc."palletId" IN ${sql(palletIds)}
        GROUP BY pc."jobId", j.ref, m.code, j.part, j.description, c.name
        ORDER BY j.ref`
      : [];

    const withPallets = new Set(
      pallets.flatMap((p) => (p.contents || []).map((c) => c.jobId)),
    );
    const missing = jobs.filter((j) => !withPallets.has(j.id));

    const { folio } = await this.getNextFolio();

    return {
      folio,
      lines: lines.map((l) => ({
        ...l,
        implicit: !body.jobIds.includes(Number(l.jobId)),
      })),
      pallets,
      missing,
    };
  }

  // Generar el PL: crea destiny con folio automático, liga pallets, inserta
  // líneas y descuenta el producto terminado del inventario (acto de exportar)
  async create(body: z.infer<typeof createPackingListSchema>) {
    let result: { id: number; folio: number };
    await sql.begin(async (sql) => {
      const pallets = await sql`
        SELECT DISTINCT p.id FROM pallets p
        JOIN pallet_contents pc ON pc."palletId" = p.id
        WHERE pc."jobId" IN ${sql(body.jobIds)}
          AND p."destinyId" IS NULL
          ${body.exportOrderId ? sql`AND p."exportOrderId" = ${body.exportOrderId}` : sql``}
          ${
            body.excludedPalletIds?.length
              ? sql`AND p.id NOT IN ${sql(body.excludedPalletIds)}`
              : sql``
          }`;
      if (!pallets.length)
        throw new HttpException(
          'Los jobs seleccionados no tienen pallets disponibles para exportar',
          400,
        );
      const palletIds = pallets.map((p) => p.id);

      const lines = await sql`
        SELECT pc."jobId",
          SUM(pc.amount)::int AS amount,
          ROUND(SUM(pc.amount::numeric / pt.total), 4) AS pallets
        FROM pallet_contents pc
        JOIN pallets p ON p.id = pc."palletId"
        JOIN LATERAL (
          SELECT SUM(amount)::numeric AS total FROM pallet_contents WHERE "palletId" = p.id
        ) pt ON true
        WHERE pc."palletId" IN ${sql(palletIds)}
        GROUP BY pc."jobId"`;

      const [{ folio }] =
        await sql`SELECT nextval('packslip_seq')::int AS folio`;

      const [destiny] = await sql`
        INSERT INTO destinys (so, "packSlip", "shipDate")
        VALUES (${'PS-' + folio}, ${String(folio)}, ${body.shipDate})
        RETURNING id`;

      await sql`UPDATE pallets SET "destinyId" = ${destiny.id}
        WHERE id IN ${sql(palletIds)}`;

      for (const line of lines) {
        const [stub] = await sql`
          SELECT od.po FROM order_destiny od
          JOIN destinys d ON d.id = od."destinyId"
          WHERE od."orderId" = ${line.jobId} AND d.exported IS NULL
            AND COALESCE(od.po, '') != '' LIMIT 1`;
        await sql`INSERT INTO order_destiny ${sql({
          orderId: line.jobId,
          destinyId: destiny.id,
          amount: line.amount,
          date: body.shipDate,
          po: stub?.po || '',
          pallets: line.pallets,
        })}`;
      }

      const headerData = await sql`select key, data from docs_data`;

      const orders = await sql`select
        COALESCE(jobs.ref, '') as ref,
        COALESCE(jobs.part, '') as part,
        COALESCE(order_destiny.amount, 0) as amount,
        COALESCE(order_destiny.po, '') as po,
        COALESCE(order_destiny.pallets, 0) as pallets,
        COALESCE(jobs.description, '') as description,
        jobs."perBox",
        'EA' as umc
        from order_destiny
        left join jobs on jobs.id = order_destiny."orderId"
        where order_destiny."destinyId" = ${destiny.id}`;

      const [shipper] = body.shipVia
        ? await sql`select name from shippers where id = ${body.shipVia}`
        : [null];
      const [consignee] = body.consignee
        ? await sql`select "legalName" from clients where id = ${body.consignee}`
        : [null];
      const [destination] = body.destination
        ? await sql`select name, direction from "destinationDirections" where id = ${body.destination}`
        : [null];
      const [carrier] = body.carrierExp
        ? await sql`select name from carriers where id = ${body.carrierExp}`
        : [null];
      const [shipTo] = body.shipTo
        ? await sql`select name, direction from "shipTo" where id = ${body.shipTo}`
        : [null];

      const packingData = {
        packSlip: String(folio),
        shipDate: body.shipDate,
        blNo: body.blNo || '',
        trk: body.trk || '',
        invoice: body.invoice || '',
        weight: body.weight || '',
        po: [...new Set(orders.map((o) => o.po).filter(Boolean))].join(', '),
        exported: headerData.find((item) => item.key === 'ie_exported')?.data,
        soldTo: headerData.find((item) => item.key === 'ie_sold_to')?.data,
        orders: orders,
        shipVia: shipper?.name || '',
        consignee: consignee?.legalName || '',
        destination: destination || null,
        carrierExp: carrier?.name || '',
        shipTo: shipTo || null,
      };

      await sql`update destinys set ${sql(packingData)} where id = ${destiny.id}`;

      const insertedMovements = await sql`
        insert into materialmovements
          ("materialId", "orderDestinyId", amount, "realAmount", active, "activeDate")
        select mm."materialId", od.id, -od.amount, -od.amount, true, now()
        from order_destiny od
        join jobs j on j.id = od."orderId"
        join materialmovements mm on mm.id = j."movementId"
        where od."destinyId" = ${destiny.id}
        returning "materialId"`;

      const affectedMaterials = new Set(
        insertedMovements.map((m) => m.materialId),
      );
      for (const materialId of affectedMaterials)
        await updateMaterialAmount(materialId, sql);

      await this.req.record(`Generó el packing list ${folio}`, sql);

      result = { id: destiny.id, folio };
    });
    return result;
  }

  // Listado del submódulo Packing List
  async getPackingLists(body: z.infer<typeof getPackingListsSchema>) {
    return sql`select destinys.id,
      COALESCE(NULLIF(destinys."packSlip", ''), destinys.so) as "packSlip",
      destinys."shipDate",
      destinys."plType",
      string_agg(distinct COALESCE(clients.name, matclients.name), ', ') as client,
      string_agg(distinct jobs.ref, ', ') as jobs,
      string_agg(distinct COALESCE(materials.code, jobs.part, linemat.code), ', ') as parts,
      string_agg(distinct COALESCE(jobs.description, linemat.description), ', ') as description,
      string_agg(distinct nullif(order_destiny.po, ''), ', ') as po,
      COALESCE(sum(order_destiny.amount), 0)::int as amount,
      ((select count(*) from pallets p where p."destinyId" = destinys.id)
        + (select count(*) from pallets p where p."exportOrderId" in
            (select id from exportorders where "destinyId" = destinys.id)))::int as pallets
      from destinys
      left join order_destiny on order_destiny."destinyId" = destinys.id
      left join jobs on jobs.id = order_destiny."orderId"
      left join clients on clients.id = jobs."clientId"
      left join materialmovements on jobs."movementId" = materialmovements.id
      left join materials on materialmovements."materialId" = materials.id
      left join materials linemat on linemat.id = order_destiny."materialId"
      left join clients matclients on matclients.id = linemat."clientId"
      where (destinys.so LIKE 'PS-%' OR destinys.exported IS NOT NULL)
      ${body.packSlip ? sql`AND COALESCE(NULLIF(destinys."packSlip", ''), destinys.so) ILIKE ${'%' + body.packSlip + '%'}` : sql``}
      ${body.clientId ? sql`AND destinys.id in (
        select od2."destinyId" from order_destiny od2
        left join jobs j2 on j2.id = od2."orderId"
        left join materials m2 on m2.id = od2."materialId"
        where j2."clientId" = ${body.clientId} or m2."clientId" = ${body.clientId})` : sql``}
      group by destinys.id
      order by destinys.id desc
      limit 200`;
  }

  // Eliminar PL (solo privilegio EDITAR Y ELIMINAR): revierte inventario y
  // libera los pallets para poder volver a exportarlos
  async deletePl(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      const [destiny] = await sql`
        select id, so, "packSlip" from destinys where id = ${body.id}
        and (so LIKE 'PS-%' OR exported IS NOT NULL)`;
      if (!destiny) throw new HttpException('Packing list no existente', 400);

      const movements = await sql`
        select "materialId" from materialmovements
        where "orderDestinyId" in
          (select id from order_destiny where "destinyId" = ${body.id})`;

      await sql`update pallets set "destinyId" = null where "destinyId" = ${body.id}`;
      await sql`update exportorders set "destinyId" = null where "destinyId" = ${body.id}`;
      await sql`delete from order_destiny where "destinyId" = ${body.id}`;
      await sql`delete from destinys where id = ${body.id}`;

      for (const movement of movements)
        await updateMaterialAmount(movement.materialId, sql);

      await this.req.record(
        `Eliminó el packing list ${destiny.packSlip || destiny.so}`,
        sql,
      );
    });
    return;
  }

  async download(body: z.infer<typeof downloadPackingListSchema>) {
    const [data] = await sql`select * from destinys where id = ${body.id}`;

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
      executablePath:
        process.env.NODE_ENV === 'production'
          ? '/usr/bin/google-chrome'
          : undefined,
    });
    const page = await browser.newPage();

    const template = await fs.readFile(
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'static',
        'templates',
        'ie',
        'packing-list.html',
      ),
      'utf-8',
    );

    // cajas por línea: el override editado manda; si no, el cálculo con perBox
    const lineBoxes = (order: any) =>
      order.boxes ?? (order.perBox ? Math.ceil(order.amount / order.perBox) : 0);

    const templateData = {
      ...data,
      shipDate: format(data.shipDate, 'MM-dd-yyyy'),
      rows: data.orders?.reduce((acc, order, i) => {
        if (i > 50) return acc;
        return (
          acc +
          `
            <tr>
              <td>${order.part}</td>
              <td>${lineBoxes(order) || ''}</td>
              <td>${order.ref}</td>
              <td>${order.po}</td>
              <td class="description">${order.description}</td>
              <td>${order.umc}</td>
              <td>${order.amount}</td>
            </tr>`
        );
      }, ''),
      totalAmount: data.orders?.reduce((acc, order) => acc + order.amount, 0),
      boxes:
        data.totalBoxes ??
        data.orders?.reduce((acc, order) => acc + lineBoxes(order), 0),
      pallets:
        data.totalPallets != null
          ? Number(data.totalPallets)
          : Math.ceil(
              data.orders?.reduce(
                (acc, order) => acc + Number(order.pallets || 0),
                0,
              ),
            ),
      type:
        data.plType === 'materiaPrima'
          ? 'RAW MATERIALS'
          : data.plType === 'subproducto'
            ? 'SUBPRODUCTS'
            : 'FINISHED GOODS',
    };

    await page.setContent(Mustache.render(template, templateData));

    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      margin: {
        top: '0.7in',
        right: '0.7in',
        bottom: '0.7in',
        left: '0.7in',
      },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
  <div style="font-size:11px; width:100%; padding: 0 0.7in; color:#555; display:flex; justify-content:space-between; align-items:center;">
      <div>
        CST GROUP INC
      </div>
      <div style="text-align:right;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    </div>
  `,
    });

    await browser.close();

    return pdf;
  }
}
