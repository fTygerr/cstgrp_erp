import puppeteer from 'puppeteer';
import Mustache from 'mustache';
import { HttpException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { z } from 'zod/v4';
import { ContextProvider } from 'src/interceptors/context.provider';
import {
  createPaymentSchema,
  getAllPaymentsSchema,
  getDeliveriesForPaymentSchema,
} from './payments.schema';
import sql from 'src/utils/db';
import { idObjectSchema } from 'src/utils/schemas';

@Injectable()
export class PaymentsService {
  constructor(private readonly req: ContextProvider) {}

  // Precio de la entrega (regla Juan 11/09, 2ª versión): el precio se negocia
  // al momento del PAGO. Al generar el pago se congela en cm.price el precio
  // vigente de la lista del contratista para ese número de parte; mientras no
  // haya pago (vista previa) se muestra el precio de lista actual. Fallbacks:
  // precio del pase de salida de ese contratista, y por último el del job.
  // Requiere alias cm (contractormovements), j (jobs) y m (materials) en la consulta.
  private readonly deliveryPrice = sql`COALESCE(cm.price,
      (select cp.price from contractor_prices cp
        where cp."contractorId" = cm."contractorId" and cp.part = COALESCE(m.code, j.part)),
      (select ej.price from exitpass_jobs ej
        join "exitPass" e on e.id = ej."exitId"
        where ej."jobId" = j.id and e."contractorId" = cm."contractorId"
        order by (e.date <= cm.date) desc, e.date desc, ej.id desc
        limit 1),
      j."contractorPrice")`;

  async getAll(body: z.infer<typeof getAllPaymentsSchema>) {
    const rows = await sql`select p.*,
    (select string_agg(distinct c.name, ', ')
      from contractormovements cm
      join contractors c on c.id = cm."contractorId"
      where cm."paymentId" = p.id) as contractors,
    (select string_agg(distinct j.ref, ', ')
      from contractormovements cm
      join jobs j on j.id = cm."orderId"
      where cm."paymentId" = p.id) as orders,
    (select COALESCE(SUM(cm.accepted), 0)::int
      from contractormovements cm
      where cm."paymentId" = p.id) as accepted,
    (select COALESCE(SUM(cm.rejected), 0)::int
      from contractormovements cm
      where cm."paymentId" = p.id) as rejected,
    (select COALESCE(SUM(cm.accepted * ${this.deliveryPrice}), 0)::numeric(12,2)
      from contractormovements cm
      join jobs j on j.id = cm."orderId"
      left join materialmovements mm on j."movementId" = mm.id
      left join materials m on mm."materialId" = m.id
      where cm."paymentId" = p.id) as total
    from "contractorPayments" p
    WHERE
    ${body.date ? sql`"startDate" <= ${body.date} AND "endDate" >= ${body.date}` : sql`TRUE`} AND
    ${body.folio ? sql`folio = ${body.folio}` : sql`TRUE`}
    ORDER BY folio DESC`;
    return rows;
  }

  async create(body: z.infer<typeof createPaymentSchema>) {
    await sql.begin(async (sql) => {
      const [payment] =
        await sql`insert into "contractorPayments" ("startDate", "endDate", "folio") values 
        (${body.startDate}, ${body.endDate}, (select COALESCE(max(folio), 0) from "contractorPayments") + 1) 
        returning id`;

      for (const deliveryId of body.deliveriesId) {
        const [delivery] =
          await sql`update "contractormovements" set "paymentId" = ${payment.id} where id = ${deliveryId} and "paymentId" is null returning id`;
        if (!delivery)
          throw new HttpException('Una entrega ya tiene pago', 400);
      }

      // Congelar el precio de cada entrega con el precio vigente de la lista
      // del contratista en este momento (regla Juan 11/09)
      await sql`update contractormovements cm set price = sub.price
        from (select cm.id, ${this.deliveryPrice} as price
              from contractormovements cm
              join jobs j on j.id = cm."orderId"
              left join materialmovements mm on j."movementId" = mm.id
              left join materials m on mm."materialId" = m.id
              where cm."paymentId" = ${payment.id}) sub
        where cm.id = sub.id`;
    });
  }

  async delete(body: z.infer<typeof idObjectSchema>) {
    await sql.begin(async (sql) => {
      // al borrar el pago la entrega vuelve a estar libre y su precio se
      // vuelve a tomar de la lista cuando se genere el siguiente pago
      await sql`update contractormovements set price = null where "paymentId" = ${body.id}`;
      await sql`delete from "contractorPayments" where id = ${body.id}`;
    });
  }

  async getDeliveriesForPayment(
    body: z.infer<typeof getDeliveriesForPaymentSchema>,
  ) {
    const deliveries = await sql`select cm.id, cm.rejected, cm.accepted, cm.date,
    j.ref, j.description,
    (select name from contractors where id = cm."contractorId") as contractor,
    ${this.deliveryPrice} as price,
    (cm.accepted * ${this.deliveryPrice})::numeric(12,2) as total

    FROM contractormovements cm
    JOIN jobs j ON j.id = cm."orderId"
    LEFT JOIN materialmovements mm ON j."movementId" = mm.id
    LEFT JOIN materials m ON mm."materialId" = m.id
    WHERE cm.date >= ${body.startDate} AND cm.date <= ${body.endDate}
    AND cm."paymentId" is null
    AND cm.approved = true
    ORDER BY cm.date ASC`;

    return deliveries;
  }

  // Detalle de entregas de un pago (opción "Ver", obs 26-Ago) — solo lectura
  async getPaymentDeliveries(body: z.infer<typeof idObjectSchema>) {
    const rows = await sql`select cm.id, cm.date, cm.accepted, cm.rejected,
      (select name from contractors where id = cm."contractorId") as contractor,
      j.ref, COALESCE(m.code, j.part) as part, j.description,
      ${this.deliveryPrice} as price,
      (cm.accepted * ${this.deliveryPrice})::numeric(12,2) as total
    from contractormovements cm
    join jobs j on j.id = cm."orderId"
    left join materialmovements mm on j."movementId" = mm.id
    left join materials m on mm."materialId" = m.id
    where cm."paymentId" = ${body.id}
    order by cm.date asc`;
    return rows;
  }

  async download(body: z.infer<typeof idObjectSchema>) {
    const [payment] =
      await sql`select * from "contractorPayments" where id = ${body.id}`;
    if (!payment) throw new HttpException('Pago no encontrado', 400);

    const rows = await sql`select cm.rejected, cm.accepted, cm.date, cm."orderId",
    (select name from contractors where id = cm."contractorId") as contractor,
    (select COALESCE("ivaRate", 0) from contractors where id = cm."contractorId") as "ivaRate",
    ${this.deliveryPrice} as "deliveryPrice"
    FROM contractormovements cm
    JOIN jobs j ON j.id = cm."orderId"
    LEFT JOIN materialmovements mm ON j."movementId" = mm.id
    LEFT JOIN materials m ON mm."materialId" = m.id
    WHERE cm."paymentId" = ${payment.id}
    ORDER BY cm.date ASC`;

    for (const row of rows) {
      const [job] = await sql`
        select COALESCE(materials.code, jobs.part) as part, jobs.ref, jobs."contractorPrice", jobs.description
        from jobs
        left join materialmovements on jobs."movementId" = materialmovements.id
        left join materials on materialmovements."materialId" = materials.id
        where jobs.id = ${row.orderId}`;
      if (!job) throw new HttpException('Job no encontrado', 400);

      row.ref = job.ref;
      row.part = job.part;
      row.description = job.description;
      row.price = row.deliveryPrice ?? job.contractorPrice;
      row.total = row.accepted * row.price;
    }

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
        'prod',
        'contrator-payment.html',
      ),
      'utf-8',
    );

    const contractorsGroups = {};

    for (const row of rows) {
      if (!row.contractor)
        throw new HttpException('Contratista no encontrado', 400);

      if (!contractorsGroups[row.contractor]) {
        contractorsGroups[row.contractor] = [];
      }

      contractorsGroups[row.contractor].push(row);
    }

    let tableHTML = '';

    for (const contractor of Object.keys(contractorsGroups)) {
      tableHTML += `
      
      <thead>
        <th class="contractor-cell" colspan="7">${contractor}</th>
      </thead>
      <thead class="subheader">
        <th>Fecha</th>
        <th>Orden</th>
        <th>Descripcion</th>
        <th>Precio C/U</th>
        <th>Aceptado</th>
        <th>Rechazado</th>
        <th>Total</th>
      </thead>
      <tbody>
      ${contractorsGroups[contractor]
        .map(
          (row) => `
        <tr>
          <td>${format(row.date, 'dd/MM/yyyy')}</td>
          <td>${row.ref}</td>
          <td class="description">${row.description}</td>
          <td>${row.price}</td>
          <td>${row.accepted}</td>
          <td>${row.rejected}</td>
          <td>${row.total}</td>
        </tr>
      `,
        )
        .join('')}
        ${(() => {
          // IVA por tasa del contratista (obs 02/09; Juan 11/09: 0, 8 o 16%):
          // Total, renglón de IVA y gran total; el precio unitario no cambia.
          const subtotal = contractorsGroups[contractor].reduce(
            (acc, row) => acc + row.total,
            0,
          );
          const rate = Number(contractorsGroups[contractor][0]?.ivaRate || 0);
          if (!rate)
            return `<tr><td colspan="7" class="total-cell">TOTAL: ${subtotal}</td></tr>`;
          const iva = Math.round(subtotal * (rate / 100) * 100) / 100;
          return `
        <tr><td colspan="7" class="total-cell">TOTAL: ${subtotal}</td></tr>
        <tr><td colspan="7" class="total-cell">IVA (${rate}%): ${iva}</td></tr>
        <tr><td colspan="7" class="total-cell">GRAN TOTAL: ${Math.round((subtotal + iva) * 100) / 100}</td></tr>`;
        })()}
      </tbody>`;
    }

    const templateData = {
      folio: payment.folio,
      startDate: format(payment.startDate, 'dd/MM/yyyy'),
      endDate: format(payment.endDate, 'dd/MM/yyyy'),
      total:
        Math.round(
          rows.reduce(
            (acc, row) => acc + row.total * (1 + Number(row.ivaRate || 0) / 100),
            0,
          ) * 100,
        ) / 100,
      tableHTML,
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
      footerTemplate: `<span></span>`,
    });

    await browser.close();

    return pdf;
  }
}
