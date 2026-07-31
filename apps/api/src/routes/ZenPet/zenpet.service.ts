import { HttpException, Injectable } from '@nestjs/common';
import path from 'path';
import { promises as fs } from 'fs';
import sql from 'src/utils/db';

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

  async getFormulas() {
    const file = await fs.readFile(
      path.resolve(__dirname, '..', '..', '..', 'static', 'zenpet', 'formulas.json'),
      'utf-8',
    );
    return JSON.parse(file);
  }
}
