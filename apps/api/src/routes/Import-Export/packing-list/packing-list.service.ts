import puppeteer from 'puppeteer';
import Mustache from 'mustache';
import { Injectable } from '@nestjs/common';
import { ContextProvider } from 'src/interceptors/context.provider';
import sql from 'src/utils/db';
import { z } from 'zod/v4';
import {
  downloadPackingListSchema,
  editPackingListSchema,
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
        GROUP BY pc."jobId"`;
      if (!lines.length)
        throw new HttpException('La orden no tiene pallets', 400);

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
    if (!orders.length)
      throw new HttpException(
        'El packing list no tiene ordenes de exportación aplicadas',
        400,
      );

    const pallets = await sql`
      SELECT pallets.folio,
        (SELECT json_agg(json_build_object(
            'ref', j.ref, 'part', j.part, 'description', j.description,
            'amount', pc.amount, 'boxes', pc.boxes) ORDER BY pc.id)
          FROM pallet_contents pc JOIN jobs j ON j.id = pc."jobId"
          WHERE pc."palletId" = pallets.id) AS contents
      FROM pallets
      WHERE "exportOrderId" IN ${sql(orders.map((o) => o.id))}
      ORDER BY pallets.folio ASC`;

    return generateExportOrderPdf(
      { id: destiny.id, date: orders[0].date, client: orders[0].client } as any,
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
              <td>${Math.ceil(order.amount / order.perBox)}</td>
              <td>${order.ref}</td>
              <td>${order.po}</td>
              <td class="description">${order.description}</td>
              <td>${order.umc}</td>
              <td>${order.amount}</td>
            </tr>`
        );
      }, ''),
      totalAmount: data.orders?.reduce((acc, order) => acc + order.amount, 0),
      boxes: data.orders?.reduce(
        (acc, order) => acc + Math.ceil(order.amount / order.perBox),
        0,
      ),
      pallets: Math.ceil(
        data.orders?.reduce(
          (acc, order) => acc + Number(order.pallets || 0),
          0,
        ),
      ),
      type: 'FINISHED GOODS',
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
