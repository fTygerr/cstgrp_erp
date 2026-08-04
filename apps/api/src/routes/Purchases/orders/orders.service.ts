import { promises as fs } from 'fs';
import { HttpException, Injectable } from '@nestjs/common';
import {
  deleteSchema,
  editSchema,
  createSchema,
  getProductsSchema,
  searchSchema,
} from './orders.schema';
import { z } from 'zod/v4';
import sql from 'src/utils/db';
import exceljs from 'exceljs';
import { updateMaterialAmount } from 'src/utils/functions';
import { ContextProvider } from 'src/interceptors/context.provider';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { generateOrder } from './orders.generate';
import { convertMeasurements } from './orders.utils';

@Injectable()
export class OrdersService {
  constructor(private readonly req: ContextProvider) {}

  async findAllOrders(body: z.infer<typeof searchSchema>) {
    const orders =
      await sql`Select *, (select name from purchasesuppliers where id = purchaseorders."supplierId") as supplier,
        (case
          when not exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id)
            then 'abierta'
          when not exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id and mm.active = false)
            then 'cerrada'
          when exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id and mm.active = true)
            then 'parcial'
          else 'abierta' end) as status from purchaseorders
      ${body.name ? sql`WHERE ref::text ILIKE ${'%' + body.name + '%'}` : sql``}
      ${body.name ? sql`OR (select name from purchasesuppliers where id = purchaseorders."supplierId") ILIKE ${'%' + body.name + '%'}` : sql``}
      order by ref desc limit 150`;
    return orders;
  }

  async createOrder(body: z.infer<typeof createSchema>) {
    let net = 0;
    const products = body.products.map((material: any) => {
      material.total = material.price * material.quantity;
      net += material.total;
      return material;
    });

    const [lastOrder] = await sql`select max(ref) as ref from purchaseorders`;

    const [supplier] =
      await sql`select * from purchasesuppliers where id = ${body.supplierId}`;

    await sql.begin(async (sql) => {
      const [order] = await sql`insert into purchaseorders ${sql({
        ref: lastOrder.ref + 1,
        issuer: body.issuer,
        supplierId: body.supplierId,
        currency: body.currency,
        comments: body.comments,
        iva: body.iva,
        business: body.business,
        address: body.address || null,
        net,
        products: JSON.stringify(products),
        supplier: JSON.stringify(supplier),
      })} returning id`;

      for (const product of products) {
        const [productRow] =
          await sql`select "materialId", measurement as "purchaseMeasurement", (select measurement from materials where id = "materialId") as "materialMeasurement" from purchaseproducts where id = ${product.id}`;

        if (productRow?.materialId) {
          const amount = convertMeasurements({
            amount: Math.abs(product.quantity),
            from: productRow.purchaseMeasurement,
            to: productRow.materialMeasurement,
          });
          await sql`insert into materialmovements ("materialId", "purchaseId", amount, "realAmount") values (${productRow.materialId}, ${order.id}, ${amount}, ${amount})`;
        }
      }

      await this.req.record(`Creo la orden ${lastOrder.ref + 1}`, sql);
    });
  }

  async editOrder(body: z.infer<typeof editSchema>) {
    let net = 0;
    const products = body.products.map((material: any) => {
      material.total = material.price * material.quantity;
      net += material.total;
      return material;
    });

    const extra: any = {};

    const [order] =
      await sql`select * from purchaseorders where id = ${body.id}`;

    if (Number(body.supplierId) !== Number(order.supplierId)) {
      const [supplier] =
        await sql`select * from purchasesuppliers where id = ${body.supplierId}`;
      extra.supplier = JSON.stringify(supplier);
    }

    const prevMovements =
      await sql`select id from materialmovements where "purchaseId" = ${body.id} and active = true`;
    if (prevMovements.length)
      throw new HttpException(
        'No se puede editar una orden que ya se ha surtido en almacen',
        400,
      );

    await sql.begin(async (sql) => {
      await sql`update purchaseorders set ${sql({
        ...extra,
        created_at: new Date(),
        issuer: body.issuer,
        supplierId: body.supplierId,
        currency: body.currency,
        comments: body.comments,
        iva: body.iva,
        address: body.address,
        net,
        products: JSON.stringify(products),
        business: body.business,
      })}
      where id = ${body.id}`;

      await sql`delete from materialmovements where "purchaseId" = ${body.id}`;
      for (const product of products) {
        const [productRow] =
          await sql`select "materialId", measurement as "purchaseMeasurement", (select measurement from materials where id = "materialId") as "materialMeasurement" from purchaseproducts where id = ${product.id}`;

        if (productRow?.materialId) {
          const amount = convertMeasurements({
            amount: Math.abs(product.quantity),
            from: productRow.purchaseMeasurement,
            to: productRow.materialMeasurement,
          });
          await sql`insert into materialmovements ("materialId", "purchaseId", amount, "realAmount") values (${productRow.materialId}, ${body.id}, ${amount}, ${amount})`;
        }
      }
      await this.req.record(`Edito la orden ${body.id}`, sql);
    });
  }

  async deleteOrder(body: z.infer<typeof deleteSchema>) {
    const prevMovements =
      await sql`select id from materialmovements where "purchaseId" = ${body.id} and active = true`;
    if (prevMovements.length)
      throw new HttpException(
        'No se puede eliminar una orden que ya se ha surtido en almacen',
        400,
      );

    await sql.begin(async (sql) => {
      const [row] =
        await sql`delete from purchaseorders where id = ${body.id} returning *`;
      await this.req.record(`Borro la orden ${row.ref}`, sql);
    });
  }

  async getBasicData() {
    const suppliers =
      await sql`select id as value, name from purchasesuppliers order by name`;
    const [issuer] =
      await sql`select username as value from users where id = ${this.req.userId}`;
    const [ref] = await sql`select max(ref) + 1 as value from purchaseorders`;

    return {
      suppliers,
      issuer: issuer.value || 'Sin usuario',
      ref: ref.value || 1,
    };
  }

  async getProducts(body: z.infer<typeof getProductsSchema>) {
    const products = await sql`
    SELECT id, code, description, price, image, measurement
    FROM purchaseproducts
    WHERE
     ${body.code ? sql`code ILIKE ${'%' + body.code + '%'}` : sql`TRUE`}
     ${body.code ? sql`OR description ILIKE ${'%' + body.code + '%'}` : sql`AND TRUE`}
     ${body.supplierId ? sql`AND EXISTS (SELECT 1 FROM products_suppliers WHERE "productId" = purchaseproducts.id AND "supplierId" = ${body.supplierId})` : sql`AND TRUE`}
    order by id desc LIMIT 80;
  `;
    return products;
  }

  async download(body: z.infer<typeof deleteSchema>) {
    const [order] =
      await sql`select * from purchaseorders where id = ${body.id}`;

    try {
      order.supplier = JSON.parse(order.supplier);
    } catch {}
    try {
      order.products = JSON.parse(order.products);
    } catch {}

    const templatePath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'static',
      'templates',
      'oc.pdf',
    );

    const template = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(template);
    const [page] = pdfDoc.getPages();

    let imagePathName: string = '';
    if (order.business === 1) imagePathName = 'bcpet.png';
    if (order.business === 2) imagePathName = 'mpm.png';
    if (order.business === 3) imagePathName = 'cstech.png';

    const imageBytes = await fs.readFile(
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'static',
        'templates',
        imagePathName,
      ),
    );

    const logo = await pdfDoc.embedPng(imageBytes);

    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    generateOrder(page, font, bold, order, logo);

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  // Cierre manual de OC (obs 04/08-02): confirma fecha de recepción y activa
  // los movimientos pendientes de la orden (cantidad = lo esperado restante).
  async closeOrder(body: { id: number; date: string }) {
    await sql.begin(async (sql) => {
      const [order] = await sql`select ref from purchaseorders where id = ${body.id}`;
      if (!order) throw new HttpException('Orden no existente', 400);
      const pending = await sql`update materialmovements
        set active = true, "activeDate" = ${body.date}
        where "purchaseId" = ${body.id} and active = false
        returning "materialId"`;
      for (const m of new Set(pending.map((p) => p.materialId)))
        await updateMaterialAmount(m, sql);
      await this.req.record(`Cerro la OC ${order.ref}`, sql);
    });
    return;
  }

  // Excel de OCs (obs 04/08-02): toda la información de cada OC en columnas
  async exportOrders() {
    const orders = await sql`Select purchaseorders.*,
      (select name from purchasesuppliers where id = purchaseorders."supplierId") as supplier,
      (case
        when not exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id) then 'ABIERTA'
        when not exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id and mm.active = false) then 'CERRADA'
        when exists (select 1 from materialmovements mm where mm."purchaseId" = purchaseorders.id and mm.active = true) then 'PARCIAL'
        else 'ABIERTA' end) as status
      from purchaseorders order by purchaseorders.ref desc`;

    const wb = new exceljs.Workbook();
    const ws = wb.addWorksheet('Ordenes de compra');
    ws.columns = [
      { header: 'OC', key: 'ref', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Proveedor', key: 'supplier', width: 30 },
      { header: 'Fecha', key: 'created_at', width: 14 },
      { header: 'Due', key: 'due', width: 14 },
      { header: 'Emisor', key: 'issuer', width: 22 },
      { header: 'Empresa', key: 'business', width: 22 },
      { header: 'Direccion', key: 'address', width: 30 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Neto', key: 'net', width: 12 },
      { header: 'IVA', key: 'iva', width: 10 },
      { header: 'Tax', key: 'tax', width: 10 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Productos', key: 'products', width: 60 },
      { header: 'Comentarios', key: 'comments', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const o of orders)
      ws.addRow({
        ...o,
        created_at: o.created_at?.toISOString?.().slice(0, 10) || o.created_at,
        due: o.due?.toISOString?.().slice(0, 10) || o.due,
        products: Array.isArray(o.products)
          ? o.products
              .map((p: any) => `${p.code || p.description || ''} x${p.amount || ''}`)
              .join(' | ')
          : '',
      });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
