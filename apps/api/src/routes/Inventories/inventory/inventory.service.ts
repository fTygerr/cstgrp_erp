import { Injectable } from '@nestjs/common';
import sql from 'src/utils/db';
import exceljs from 'exceljs';
import { idObjectSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';
import { exportHistorySchema } from './inventory.schema';
import { updateMaterialAmount } from 'src/utils/functions';

@Injectable()
export class InventoryService {
  async getInventory() {
    const inventory = await sql`Select * from materials order by "code" asc`;

    return inventory;
  }

  // Historial del material. Petición Juan 06-Oct: una orden puede liberarse en
  // VARIAS fechas (capturas de calidad y/o entregas de contratista), pero el
  // sistema guarda UN SOLO movimiento de producto por orden (jobs."movementId")
  // al que le sobrescribe el acumulado — por eso dos entregas de 8,000 salían
  // como un renglón de 16,000, y con la fecha de alta de la orden.
  //
  // Aquí ese movimiento se ABRE en una fila por liberación real, con su fecha.
  // No se toca ningún dato: las fechas y cantidades ya viven en ordermovements
  // (calidad) y contractormovements (contratistas), así que el historial viejo
  // también queda bien sin reescribir inventario.
  //
  // Red de seguridad: si lo reconstruido no suma exactamente el movimiento, esa
  // orden se muestra como hasta hoy (un solo renglón).
  async getMaterialMovements(body: z.infer<typeof idObjectSchema>) {
    const movements = await sql`
      WITH base AS (
        SELECT mm.id, mm."activeDate", mm.amount, mm."realAmount", mm.extra, mm.active,
               mm."jobId", mm."importId", mm."reqId", mm."purchaseId", mm."orderDestinyId",
               mm.type, j.id AS prod_job_id
        FROM materialmovements mm
        LEFT JOIN jobs j ON j."movementId" = mm.id
        WHERE mm."materialId" = ${body.id} AND mm.active IS TRUE
      ),
      releases AS (
        SELECT b.id AS src_id, om.date::date AS d,
               ROUND(om.calidad::numeric, 2) AS qty, om.id AS kid, 1 AS kind
        FROM base b
        JOIN ordermovements om ON om."progressId" = b.prod_job_id
          AND om.calidad IS NOT NULL AND om.calidad <> 0
        WHERE b.prod_job_id IS NOT NULL
        UNION ALL
        SELECT b.id, cm.date::date,
               ROUND(cm.accepted::numeric, 2), cm.id, 2
        FROM base b
        JOIN contractormovements cm ON cm."orderId" = b.prod_job_id AND cm.approved = TRUE
        WHERE b.prod_job_id IS NOT NULL
      ),
      recon AS (SELECT src_id, SUM(qty) AS total FROM releases GROUP BY src_id),
      ledger AS (
        SELECT b.id AS ord_id, 0 AS sub, b."activeDate", b.amount, b."realAmount",
               b.extra, b.active, b."jobId", b."importId", b."reqId", b."purchaseId",
               b."orderDestinyId", b.type
        FROM base b
        LEFT JOIN recon r ON r.src_id = b.id
        WHERE r.src_id IS NULL OR r.total <> b.amount
        UNION ALL
        SELECT rel.src_id, rel.kind * 1000000 + rel.kid, rel.d, rel.qty, rel.qty,
               b.extra, b.active, b."jobId", b."importId", b."reqId", b."purchaseId",
               b."orderDestinyId", b.type
        FROM releases rel
        JOIN base b ON b.id = rel.src_id
        JOIN recon r ON r.src_id = rel.src_id AND r.total = b.amount
      )
      SELECT
        ledger."activeDate",
        jobs.programation,
        COALESCE(
          CASE
            WHEN destinys.id IS NULL THEN NULL
            ELSE CONCAT('PL-', COALESCE(NULLIF(NULLIF(destinys."packSlip", ''), '-'), destinys.so))
          END,
          jobs.ref,
          imports.ref,
          CASE WHEN requisitions.folio IS NULL THEN NULL ELSE CONCAT('REQ-', requisitions.folio::text) END,
          CASE WHEN purchaseorders.ref IS NULL THEN NULL ELSE CONCAT('OC-', purchaseorders.ref::text) END,
          CASE ledger.type
            WHEN 'return' THEN 'RETORNO'
            WHEN 'scrap' THEN 'SCRAP'
            WHEN 'consumable' THEN 'INSUMO'
            WHEN 'adjustment' THEN 'AJUSTE'
            ELSE ''
          END
        ) as ref,
        ledger.amount,
        ledger.extra,
        ledger."realAmount",
        ledger.active,
        SUM(ledger."realAmount") OVER (ORDER BY ledger."activeDate" ASC, ledger.ord_id ASC, ledger.sub ASC) AS balance,
        SUM(ledger.amount) OVER (ORDER BY ledger."activeDate" ASC, ledger.ord_id ASC, ledger.sub ASC) AS "totalBalance",
        SUM(ledger.amount - ledger."realAmount") OVER (ORDER BY ledger."activeDate" ASC, ledger.ord_id ASC, ledger.sub ASC) AS "leftoverAmount"
      FROM ledger
      LEFT JOIN jobs ON jobs.id = ledger."jobId"
      LEFT JOIN imports ON imports.id = ledger."importId"
      LEFT JOIN requisitions ON requisitions.id = ledger."reqId"
      LEFT JOIN purchaseorders ON purchaseorders.id = ledger."purchaseId"
      LEFT JOIN order_destiny ON order_destiny.id = ledger."orderDestinyId"
      LEFT JOIN destinys ON destinys.id = order_destiny."destinyId"
      ORDER BY ledger."activeDate" DESC, ledger.ord_id DESC, ledger.sub DESC
      LIMIT 300`;
    return movements;
  }

  async exportMaterialmMovements(body: z.infer<typeof idObjectSchema>) {
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Movimientos');

    const movments = await this.getMaterialMovements(body);
    const rows = movments.map((movement) => ({
      ...movement,
      jobpo: movement.jobpo || '' + (movement.extra ? ' -R' : ''),
    }));

    worksheet.columns = [
      { header: 'Ref', key: 'ref', width: 15 },
      { header: 'Programación', key: 'programation', width: 15 },
      { header: 'Cantidad Job', key: 'amount', width: 15 },
      { header: 'Cantidad Real', key: 'realAmount', width: 15 },
      { header: 'Fecha', key: 'activeDate', width: 15 },
      { header: 'Balance', key: 'balance', width: 15 },
      { header: 'Sobrante', key: 'leftoverAmount', width: 15 },
      { header: 'Total Balance', key: 'totalBalance', width: 15 },
    ];

    worksheet.addRows(rows);

    worksheet.getRow(1).eachCell((cell) => {
      cell.style = { font: { bold: true } };
    });

    return workbook.xlsx.writeBuffer();
  }

  async getMaterialComparison(body: z.infer<typeof idObjectSchema>) {
    const movements = await sql`SELECT
    materialmovements."activeDate" as due,
    programation,
    ref,
    materialmovements.amount,
    (
        SELECT SUM(amount) 
        FROM materialmovements AS m
        WHERE m."materialId" = materialmovements."materialId" AND m."jobId" = materialmovements."jobId"
    ) AS "realAmount"
        FROM
        materialmovements
    JOIN
        materials ON materials.id = materialmovements."materialId"
    JOIN
        jobs ON jobs.id = materialmovements."jobId"
    WHERE
        materials.id = ${body.id} 
        AND materialmovements.active IS true
        AND materialmovements.extra = false
    ORDER BY
        materialmovements."activeDate" DESC,
        materialmovements.id DESC
    LIMIT 300;`;

    return movements;
  }

  async export() {
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Inventario');

    const rows = await sql`select
      id, code, description, total, "leftoverAmount", amount, measurement,
      (select name from clients where id = "clientId") as client
      from materials`;

    const results = await Promise.all(
      rows.map(async (row) => {
        const movements = await sql`SELECT ref FROM materialmovements
          JOIN jobs ON jobs.id = materialmovements."jobId"
          WHERE materialmovements.active = true
          AND jobs.ref IS NOT NULL
          AND materialmovements."materialId" = ${row.id}
          ORDER BY materialmovements."activeDate" DESC, jobs.id DESC
          LIMIT 25`;

        for (let i = 0; i < 25; i++) {
          row['job' + i] = movements[i]?.ref;
        }

        return row;
      }),
    );

    worksheet.columns = [
      { header: 'Material', key: 'code', width: 25 },
      { header: 'Descripcion', key: 'description', width: 120 },
      { header: 'Cantidad', key: 'amount', width: 15 },
      { header: 'Sobrante en area', key: 'leftoverAmount', width: 20 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Medida', key: 'measurement', width: 14 },
      { header: 'Cliente', key: 'client', width: 15 },
      { header: 'Job 1', key: 'job0', width: 12 },
      { header: 'Job 2', key: 'job1', width: 12 },
      { header: 'Job 3', key: 'job2', width: 12 },
      { header: 'Job 4', key: 'job3', width: 12 },
      { header: 'Job 5', key: 'job4', width: 12 },
      { header: 'Job 6', key: 'job5', width: 12 },
      { header: 'Job 7', key: 'job6', width: 12 },
      { header: 'Job 8', key: 'job7', width: 12 },
      { header: 'Job 9', key: 'job8', width: 12 },
      { header: 'Job 10', key: 'job9', width: 12 },
      { header: 'Job 11', key: 'job10', width: 12 },
      { header: 'Job 12', key: 'job11', width: 12 },
      { header: 'Job 13', key: 'job12', width: 12 },
      { header: 'Job 14', key: 'job13', width: 12 },
      { header: 'Job 15', key: 'job14', width: 12 },
      { header: 'Job 16', key: 'job15', width: 12 },
      { header: 'Job 17', key: 'job16', width: 12 },
      { header: 'Job 18', key: 'job17', width: 12 },
      { header: 'Job 19', key: 'job18', width: 12 },
      { header: 'Job 20', key: 'job19', width: 12 },
      { header: 'Job 21', key: 'job20', width: 12 },
      { header: 'Job 22', key: 'job21', width: 12 },
      { header: 'Job 23', key: 'job22', width: 12 },
      { header: 'Job 24', key: 'job23', width: 12 },
      { header: 'Job 25', key: 'job24', width: 12 },
    ];

    worksheet.addRows(results);

    worksheet.getRow(1).eachCell((cell) => {
      cell.style = { font: { bold: true } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  async exportHistory(body: z.infer<typeof exportHistorySchema>) {
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Historial-inventario');

    const rows =
      await sql`select materials.code, SUM(materialmovements.amount * -1) as amount
    from materialmovements
    join materials on materials.id = materialmovements."materialId"
    where "activeDate" >= ${body.startDate} and "activeDate" <= ${body.endDate} and materialmovements.amount < 0
    group by code `;

    worksheet.columns = [
      { header: 'Material', key: 'code', width: 35 },
      { header: 'Cantidad gastada', key: 'amount', width: 25 },
    ];

    worksheet.addRows(rows);

    worksheet.getRow(1).eachCell((cell) => {
      cell.style = { font: { bold: true } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  async recalculate() {
    const materials = await sql`select id from materials`;
    for (const material of materials) {
      await updateMaterialAmount(material.id);
    }
  }
}
