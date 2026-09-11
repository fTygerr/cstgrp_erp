import { HttpException, Injectable } from '@nestjs/common';
import path from 'path';
import { promises as fs } from 'fs';
import sql from 'src/utils/db';
import { getOpenPoLines, getOpenPoSummary } from 'src/utils/openpos';

@Injectable()
export class ZenPetService {
  private async clientId() {
    const [client] = await sql`SELECT id FROM clients WHERE name = 'ZENPET'`;
    if (!client) throw new HttpException('Cliente ZENPET no existente', 400);
    return client.id;
  }

  // Live stage figures computed from what the ERP already records.
  // Every number carries its formula so Juan can verify the source.
  async getStages() {
    const zp = await this.clientId();

    // Stage 1 — raw material on hand, grouped by code family (units are mixed per family)
    const rawByFamily = await sql`
      SELECT substring(code from 5 for 2) AS family,
        COUNT(*)::int AS materials, ROUND(SUM(amount)::numeric, 0) AS units,
        mode() WITHIN GROUP (ORDER BY measurement) AS unit
      FROM materials
      WHERE "clientId" = ${zp} AND product = false AND code LIKE 'ZEN-Z%'
      GROUP BY 1 ORDER BY 1`;

    // Per-job pipeline positions (active jobs only)
    const [pipeline] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN "corteTime" > 0 THEN GREATEST(corte -
          (CASE WHEN "serigrafiaTime" > 0 THEN serigrafia ELSE produccion END), 0) ELSE 0 END), 0)::int AS at_corte,
        COALESCE(SUM(CASE WHEN "cortesVariosTime" > 0 THEN GREATEST("cortesVarios" - produccion, 0) ELSE 0 END), 0)::int AS at_cortes_varios,
        COALESCE(SUM(CASE WHEN "serigrafiaTime" > 0 THEN GREATEST(serigrafia - produccion, 0) ELSE 0 END), 0)::int AS at_serigrafia,
        COALESCE(SUM(CASE WHEN "produccionTime" > 0 THEN GREATEST(produccion - calidad, 0) ELSE 0 END), 0)::int AS at_produccion,
        COALESCE(SUM(GREATEST("contractorAmount" - contractor, 0)), 0)::int AS at_contractors,
        COALESCE(SUM(GREATEST(calidad - COALESCE(pal.palletized, 0), 0)), 0)::int AS liberado_sin_pallet,
        COUNT(*)::int AS jobs_activos
      FROM jobs
      LEFT JOIN LATERAL (
        SELECT SUM(pc.amount)::int AS palletized FROM pallet_contents pc WHERE pc."jobId" = jobs.id
      ) pal ON true
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL`;

    // Stage 7 proxy — jobs with raw material staged (surtido) but production not started
    const [kits] = await sql`
      SELECT COUNT(*)::int AS jobs, COALESCE(SUM(amount), 0)::int AS units
      FROM jobs
      WHERE "clientId" = ${zp} AND completed = false AND part IS NOT NULL
        AND produccion = 0
        AND EXISTS (
          SELECT 1 FROM materialmovements mm
          WHERE mm."jobId" = jobs.id AND mm.active = true AND NOT mm.extra
            AND (jobs."movementId" IS NULL OR mm.id <> jobs."movementId"))`;

    // Stage 12 — pieces on registered pallets not yet in an export order
    const [packaging] = await sql`
      SELECT COUNT(DISTINCT p.id)::int AS pallets, COALESCE(SUM(pc.amount), 0)::int AS units
      FROM pallets p JOIN pallet_contents pc ON pc."palletId" = p.id
      WHERE p."clientId" = ${zp} AND p."exportOrderId" IS NULL`;

    // Stage 13 — finished-goods stock (Z0) + pieces on pallets already in an export order
    const [finished] = await sql`
      SELECT COUNT(*)::int AS skus, ROUND(COALESCE(SUM(amount), 0)::numeric, 0) AS units
      FROM materials WHERE "clientId" = ${zp} AND product = true`;
    const [inExport] = await sql`
      SELECT COUNT(DISTINCT p.id)::int AS pallets, COALESCE(SUM(pc.amount), 0)::int AS units
      FROM pallets p JOIN pallet_contents pc ON pc."palletId" = p.id
      WHERE p."clientId" = ${zp} AND p."exportOrderId" IS NOT NULL`;

    // En route — pieces on packing lists saved (exported) in the last 60 days
    const [enRoute] = await sql`
      SELECT COUNT(DISTINCT d.id)::int AS pls, COALESCE(SUM(od.amount), 0)::int AS units
      FROM destinys d
      JOIN order_destiny od ON od."destinyId" = d.id
      JOIN jobs j ON j.id = od."orderId"
      WHERE j."clientId" = ${zp} AND d.exported IS NOT NULL
        AND d."shipDate" >= (now() - interval '60 days')`;

    return {
      generatedAt: new Date(),
      environment: process.env.DB_NAME || 'testing',
      rawByFamily,
      pipeline,
      kits,
      packaging,
      finished,
      inExport,
      enRoute,
    };
  }

  // Etapas ZenPet según las reglas de Juan (Observaciones 18-Ago):
  // activación por requisición de material (familia) ligada a la orden,
  // cierre al capturar la totalidad en el área correspondiente.
  async getEtapas() {
    const zp = await this.clientId();

    // 1. Materia prima recibida (existencia con cliente ZENPET)
    const rawByFamily = await sql`
      SELECT substring(code from 5 for 2) AS family,
        COUNT(*)::int AS materials, ROUND(SUM(total)::numeric, 0) AS units,
        mode() WITHIN GROUP (ORDER BY measurement) AS unit
      FROM materials
      WHERE "clientId" = ${zp} AND COALESCE(type, case when product then 'producto' else 'materiaPrima' end) = 'materiaPrima'
        AND code LIKE 'ZEN-Z%'
      GROUP BY 1 ORDER BY 1`;

    // activación por requisición: la orden aparece en r.jobs (",REF,") y el
    // material pedido pertenece a la familia de la etapa
    const reqActivated = (pattern: string) => sql`EXISTS (
      SELECT 1 FROM requisitions r JOIN materials rm ON rm.id = r."materialId"
      WHERE rm.code LIKE ${pattern} AND r.jobs LIKE '%,' || jobs.ref || ',%')`;
    const reqActivatedAny = (p1: string, p2: string) => sql`EXISTS (
      SELECT 1 FROM requisitions r JOIN materials rm ON rm.id = r."materialId"
      WHERE (rm.code LIKE ${p1} OR rm.code LIKE ${p2}) AND r.jobs LIKE '%,' || jobs.ref || ',%')`;

    const baseCols = sql`jobs.ref, jobs.programation, COALESCE(m.code, jobs.part) AS part,
      jobs.description, jobs.amount::int`;
    const baseFrom = sql`FROM jobs
      LEFT JOIN materialmovements mm ON jobs."movementId" = mm.id
      LEFT JOIN materials m ON mm."materialId" = m.id`;

    // 2. Corte de tela: requisición de telas Z1; cierra al capturar el total de corte
    const corteTela = await sql`
      SELECT ${baseCols}, jobs.corte::int AS capturado, (jobs.amount - jobs.corte)::int AS faltante
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND ${reqActivated('ZEN-Z1-%')} AND jobs.corte < jobs.amount
      ORDER BY jobs.ref DESC`;

    // 3. Serigrafía: activadas en corte y con operación de serigrafía
    const serigrafia = await sql`
      SELECT ${baseCols}, jobs.serigrafia::int AS capturado, (jobs.amount - jobs.serigrafia)::int AS faltante
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND jobs."serigrafiaTime" > 0
        AND ${reqActivated('ZEN-Z1-%')} AND jobs.serigrafia < jobs.amount
      ORDER BY jobs.ref DESC`;

    // 4/8. Corte de PVC + Bladder: requisición de film PVC (solo 2115/2116,
    // los demás films son obsoletos — Juan 25/08);
    // cierra cuando se produce el bladder. Control por inventario de bladders.
    const cortePvc = await sql`
      SELECT ${baseCols}, GREATEST(jobs.produccion, jobs.calidad)::int AS producido,
        (jobs.amount - GREATEST(jobs.produccion, jobs.calidad))::int AS faltante
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM requisitions r JOIN materials rm ON rm.id = r."materialId"
          WHERE rm.code IN ('ZEN-Z4-2115', 'ZEN-Z4-2116')
            AND r.jobs LIKE '%,' || jobs.ref || ',%')
        AND GREATEST(jobs.produccion, jobs.calidad) < jobs.amount
      ORDER BY jobs.ref DESC`;
    const bladderInventory = await sql`
      SELECT code, description, ROUND(total::numeric, 0) AS units, measurement
      FROM materials WHERE "clientId" = ${zp} AND code LIKE 'ZEN-Z4-25%'
      ORDER BY code`;

    // 5. Corte de componentes: requisición Z3/Z5; cierra al capturar cortes varios
    const corteComponentes = await sql`
      SELECT ${baseCols}, jobs."cortesVarios"::int AS capturado, (jobs.amount - jobs."cortesVarios")::int AS faltante
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND ${reqActivatedAny('ZEN-Z3-%', 'ZEN-Z5-%')} AND jobs."cortesVarios" < jobs.amount
        AND COALESCE(m.code, jobs.part) NOT LIKE 'ZEN-Z4-%'
      ORDER BY jobs.ref DESC`;

    // 6. Corte de PET: con pase de salida (proceso externo); cierra al liberar
    // calidad. Solo los 4 números de parte de PET (Juan, obs 26-Ago).
    const cortePet = await sql`
      SELECT ${baseCols}, ep.surtido, jobs.calidad::int AS liberado
      ${baseFrom}
      JOIN LATERAL (
        SELECT COALESCE(SUM(ej.amount), 0)::int AS surtido FROM exitpass_jobs ej WHERE ej."jobId" = jobs.id
      ) ep ON ep.surtido > 0
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND COALESCE(m.code, jobs.part) IN ('ZEN-Z4-3520', 'ZEN-Z4-3521', 'ZEN-Z4-3522', 'ZEN-Z4-3523')
        AND jobs.calidad < jobs.amount
      ORDER BY jobs.ref DESC`;

    // 7. Kits: fases de corte/serigrafía/cortes varios completas (las activas);
    // sale al generar pase de salida o al empezar a capturar producción
    const kits = await sql`
      SELECT ${baseCols}
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND (jobs."corteTime" > 0 OR jobs."serigrafiaTime" > 0 OR jobs."cortesVariosTime" > 0)
        AND (jobs."corteTime" = 0 OR jobs.corte >= jobs.amount)
        AND (jobs."serigrafiaTime" = 0 OR jobs.serigrafia >= jobs.amount)
        AND (jobs."cortesVariosTime" = 0 OR jobs."cortesVarios" >= jobs.amount)
        AND jobs.produccion = 0
        AND NOT EXISTS (SELECT 1 FROM exitpass_jobs ej WHERE ej."jobId" = jobs.id)
        AND COALESCE(m.code, jobs.part) NOT LIKE 'ZEN-Z4-%'
      ORDER BY jobs.ref DESC`;

    // 9/10 fusionados (Juan, obs 26-Ago): "Producción" — interna + contratistas
    // en un solo apartado. En poder de contratistas = surtido − entregado aceptado.
    const produccion = await sql`
      SELECT ${baseCols},
        jobs.produccion::int AS producido,
        COALESCE(ep.surtido, 0) AS surtido,
        jobs.contractor::int AS aceptado,
        GREATEST(COALESCE(ep.surtido, 0) - jobs.contractor, 0)::int AS "enPoder",
        ep.contratistas
      ${baseFrom}
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ej.amount), 0)::int AS surtido,
          string_agg(DISTINCT c.name, ', ') AS contratistas
        FROM exitpass_jobs ej
        JOIN "exitPass" e ON e.id = ej."exitId"
        JOIN contractors c ON c.id = e."contractorId"
        WHERE ej."jobId" = jobs.id
      ) ep ON true
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false AND jobs.part IS NOT NULL
        AND (jobs.produccion > 0 OR COALESCE(ep.surtido, 0) - jobs.contractor > 0)
        -- Regla Juan 11/09: Ensamble = jobs Z9 (y los Z0 que NO tienen Z9, p.ej.
        -- E-Collar/ZenDog, cuyo job Z0 es su ensamble). Los Z0 con Z9 gemelo son
        -- EMPAQUE (bloque empaqueZ0); los Z4 (cortes de PET) son Corte de PET.
        AND COALESCE(m.code, jobs.part) NOT LIKE 'ZEN-Z4-%'
        AND NOT (COALESCE(m.code, jobs.part) LIKE 'ZEN-Z0-%' AND EXISTS (
          SELECT 1 FROM materials z9 WHERE z9."clientId" = ${zp}
            AND z9.code = 'ZEN-Z9-' || substring(COALESCE(m.code, jobs.part) from 8)))
      ORDER BY jobs.ref DESC`;

    // 10b. EMPAQUE por job (Juan 11/09: "Z0 lo compone su empaque y su Z9"):
    // jobs Z0 abiertos cuyo producto tiene subensamble Z9 — el job Z0 es la
    // etapa de empacar el Z9. empacado = liberado por calidad + contratista.
    const empaqueZ0 = await sql`
      SELECT ${baseCols},
        (jobs.calidad + jobs.contractor)::int AS empacado,
        GREATEST(jobs.amount - jobs.calidad - jobs.contractor, 0)::int AS faltante,
        'ZEN-Z9-' || substring(COALESCE(m.code, jobs.part) from 8) AS "z9"
      ${baseFrom}
      WHERE jobs."clientId" = ${zp} AND jobs.completed = false
        AND COALESCE(m.code, jobs.part) LIKE 'ZEN-Z0-%'
        AND EXISTS (SELECT 1 FROM materials z9 WHERE z9."clientId" = ${zp}
          AND z9.code = 'ZEN-Z9-' || substring(COALESCE(m.code, jobs.part) from 8))
      ORDER BY jobs.programation, jobs.ref`;

    // 11. Acabado y calidad: producto terminado liberado por calidad.
    // Solo familia Z0 — los Z4 (bladders) y Z9 (collares ensamblados) son
    // subensambles, no producto terminado (Juan 01/09)
    // Regla Juan 08/09 (v2): esta etapa se toma del INVENTARIO de subproductos
    // (los Z9 en existencia esperando empaque; al empacarse se convierten en
    // Z0). Los bladders se excluyen (tienen su propio bloque). El cálculo por
    // órdenes se quedaba inflado porque un job Z9 nunca se paletiza como Z9.
    // Se conserva la MISMA forma de fila que antes (ref/part/liberado/enPallet/
    // sinPallet) para no romper el parser del sistema de ZenPet.
    // Regla Juan 11/09 (v3): (a) SOLO códigos Z9 — los cortes de PET (Z4-352x,
    // tipo subproducto) son componente y se liberan al inventario por su lado,
    // no aquí (van en petInventario); (b) los Z0 ya liberados por calidad
    // consumieron su Z9 aunque la línea del job siga pendiente (hoy Juan lo
    // descuenta a mano), así que sinPallet = existencia − pendiente de esos Z0.
    // Forma de fila intacta; llaves extra (existencia, pendienteZ0) aditivas.
    const calidadLib = await sql`
      SELECT m.code AS ref, 'INVENTARIO' AS programation, m.code AS part,
        m.description,
        GREATEST(ROUND(m.total::numeric) - p.pend, 0)::int AS amount,
        GREATEST(ROUND(m.total::numeric) - p.pend, 0)::int AS liberado,
        0 AS "enPallet",
        GREATEST(ROUND(m.total::numeric) - p.pend, 0)::int AS "sinPallet",
        ROUND(m.total::numeric)::int AS existencia,
        p.pend::int AS "pendienteZ0"
      FROM materials m
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(LEAST(ABS(mm.amount), j.calidad + j.contractor)), 0) AS pend
        FROM materialmovements mm JOIN jobs j ON j.id = mm."jobId"
        WHERE mm."materialId" = m.id AND mm.active = false
          AND j.part LIKE 'ZEN-Z0-%' AND (j.calidad + j.contractor) > 0
      ) p ON true
      WHERE m."clientId" = ${zp} AND m.code LIKE 'ZEN-Z9-%'
        AND (m.total::numeric > 0 OR p.pend > 0)
      ORDER BY m.code`;

    // Cortes de PET en existencia (componente, Juan 11/09) — antes se colaban
    // en calidadLib por ser tipo subproducto. Unidad: CORTES, no conos.
    const petInventario = await sql`
      SELECT code, description, ROUND(total::numeric)::int AS units
      FROM materials WHERE "clientId" = ${zp} AND code IN
        ('ZEN-Z4-3520','ZEN-Z4-3521','ZEN-Z4-3522','ZEN-Z4-3523')
      ORDER BY code`;

    // 12/13. Empaque / PT listo: liberado y en pallet, listo para exportar
    const empaque = await sql`
      SELECT p.folio, string_agg(j.ref, ', ' ORDER BY j.ref) AS jobs,
        SUM(pc.amount)::int AS units, SUM(pc.boxes)::int AS boxes,
        (p."exportOrderId" IS NOT NULL) AS "enOrden"
      FROM pallets p
      JOIN pallet_contents pc ON pc."palletId" = p.id
      JOIN jobs j ON j.id = pc."jobId"
      WHERE p."clientId" = ${zp} AND p."destinyId" IS NULL
      GROUP BY p.id ORDER BY p.folio`;

    // En ruta: exportado en packing lists de los últimos 60 días
    const [enRoute] = await sql`
      SELECT COUNT(DISTINCT d.id)::int AS pls, COALESCE(SUM(od.amount), 0)::int AS units
      FROM destinys d
      JOIN order_destiny od ON od."destinyId" = d.id
      LEFT JOIN jobs j ON j.id = od."orderId"
      LEFT JOIN materials lm ON lm.id = od."materialId"
      WHERE COALESCE(j."clientId", lm."clientId") = ${zp}
        AND (d.so LIKE 'PS-%' OR d.exported IS NOT NULL)
        AND d."shipDate" >= (now() - interval '60 days')`;

    // ── Llaves ADITIVAS (11-Sep, Hector/Juan): mismas etapas con desglose por
    // job para que el tablero de ZenPet muestre piezas por producto/PO en
    // Palletized y Shipped (antes: solo pallets y total). Las llaves viejas
    // (empaque, enRoute) se conservan hasta que su chat confirme la migración.
    const empaqueJobs = await sql`
      SELECT jobs.ref, jobs.programation, COALESCE(m.code, jobs.part) AS part, jobs.description,
        jobs.amount::int, SUM(pc.amount)::int AS "enPallet", SUM(pc.boxes)::int AS boxes,
        string_agg(p.folio::text, ', ' ORDER BY p.folio) AS pallets,
        bool_or(p."exportOrderId" IS NOT NULL) AS "enOrden"
      FROM pallet_contents pc
      JOIN pallets p ON p.id = pc."palletId"
      JOIN jobs ON jobs.id = pc."jobId"
      LEFT JOIN materialmovements mm ON jobs."movementId" = mm.id
      LEFT JOIN materials m ON mm."materialId" = m.id
      WHERE p."clientId" = ${zp} AND p."destinyId" IS NULL
      GROUP BY jobs.id, m.code ORDER BY jobs.programation, jobs.ref`;

    // Embarques por job (últimos 60 días) con el ciclo real del PL:
    // generado (en PL, no ha salido) · embarcado · cruzado · recibido
    const embarques = await sql`
      SELECT jobs.ref, jobs.programation, COALESCE(m.code, jobs.part) AS part, jobs.description,
        od.amount::int AS units, od.boxes::int AS boxes,
        d."packSlip", d.status, d."shipDate", d."shippedAt", d."crossedAt", d."receivedAt",
        d."receivedComplete", d.invoice,
        (SELECT string_agg(pf.pedimento, ', ') FROM preforms pf WHERE pf."destinyId" = d.id) AS pedimento
      FROM order_destiny od
      JOIN destinys d ON d.id = od."destinyId"
      JOIN jobs ON jobs.id = od."orderId"
      LEFT JOIN materialmovements mm ON jobs."movementId" = mm.id
      LEFT JOIN materials m ON mm."materialId" = m.id
      WHERE jobs."clientId" = ${zp} AND d."packSlip" IS NOT NULL
        AND (d.so LIKE 'PS-%' OR d.exported IS NOT NULL)
        AND d."shipDate" >= (now() - interval '60 days')
      ORDER BY d."shipDate" DESC, d."packSlip" DESC, jobs.programation, jobs.ref`;

    // PO abiertos: misma consulta que Reportes → PO Abiertos (utils/openpos.ts)
    const openPos = await getOpenPoSummary(zp, true);
    const openPoLines = await getOpenPoLines(zp, false);

    return {
      generatedAt: new Date(),
      environment: process.env.DB_NAME || 'testing',
      rawByFamily,
      corteTela,
      serigrafia,
      cortePvc,
      bladderInventory,
      corteComponentes,
      cortePet,
      kits,
      produccion,
      calidadLib,
      empaque,
      enRoute,
      empaqueJobs,
      embarques,
      openPos,
      openPoLines,
      empaqueZ0,
      petInventario,
    };
  }

  // Producto terminado Z0 en fábrica (fase 13). Incluye existencias en CERO a
  // propósito — el cero es dato ("se acabaron los conos M"). Trae también el
  // agregado {skus, units} para que el sistema de ZenPet migre de /stages con
  // un cambio de una línea (petición chat ZenPet 04/09).
  async getFinishedGoods() {
    const zp = await this.clientId();
    const items = await sql`
      SELECT code, description, ROUND(total::numeric, 0) AS units, measurement
      FROM materials
      WHERE "clientId" = ${zp} AND code LIKE 'ZEN-Z0-%'
        AND COALESCE(type, case when product then 'producto' else 'materiaPrima' end) = 'producto'
      ORDER BY code`;
    return {
      skus: items.length,
      units: items.reduce((acc, m) => acc + Number(m.units), 0),
      items,
    };
  }

  // detalle por material (drop-down de familias en Datos). Endpoint propio,
  // fuera de /etapas, para no tocar el payload que consume la app de ZenPet.
  async getRawMaterials() {
    const zp = await this.clientId();
    return sql`
      SELECT substring(code from 5 for 2) AS family, code, description,
        ROUND(total::numeric, 2) AS units, measurement
      FROM materials
      WHERE "clientId" = ${zp} AND COALESCE(type, case when product then 'producto' else 'materiaPrima' end) = 'materiaPrima'
        AND code LIKE 'ZEN-Z%'
      ORDER BY code`;
  }

  // PO abiertos (11-Sep): {summary, lines} — igual al reporte del ERP
  async getOpenPos() {
    const zp = await this.clientId();
    const [summary, lines] = await Promise.all([
      getOpenPoSummary(zp, true),
      getOpenPoLines(zp, false),
    ]);
    const pos = new Set(summary.map((r) => r.po));
    return {
      generatedAt: new Date(),
      summary,
      lines: lines.filter((l) => pos.has(l.po)),
    };
  }

  async getFormulas() {
    const file = await fs.readFile(
      path.resolve(__dirname, '..', '..', '..', 'static', 'zenpet', 'formulas.json'),
      'utf-8',
    );
    return JSON.parse(file);
  }
}
