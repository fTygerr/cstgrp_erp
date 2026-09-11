# Production Release Checklist — dev → master

Living document: every change on `dev` that needs a MANUAL step at prod-release
time gets a line here. Code itself needs nothing (the merge carries it) — this
list is exclusively for database/config steps. Update it in the same commit as
the change that creates the step. Check items off at release, then reset the
file for the next cycle.

Release procedure (proven, used for Phase 1 on 2026-07-23):
1. `pg_dump` backup of prod DB.
2. Run the pending DB steps below against prod (`-d postgres`).
3. Merge `dev` → `master`, `git push --no-verify origin master` (deliberate release).
4. Verify deploy: `/auth/user` 401s, spot-check the new features on app.cstgrp.com.

---

## PENDING for next release

### Migrations to run on prod (already applied to testing)
- [ ] `2026-09-12_contratistas_iva_tasa.sql` — contractors."ivaRate" (0/8/16) con
  backfill 16 para los que tenían iva=true (CRISTOBAL, NANCY, TONIX en prod).
  Aditiva; `iva` booleano se mantiene en sincronía. VA JUNTO con el commit
  "IVA por tasa" — correr ANTES del deploy.
- [ ] `2026-09-11_impexp_status_openpo.sql` — ciclo del Packing List
  (destinys.status generado/embarcado/cruzado/recibido + shippedAt/crossedAt/
  receivedAt/receivedPallets/receivedComplete/receivedNotes), liga
  preforms."destinyId" → destinys, y BACKFILL: todo PL existente con shipDate
  ≤ hoy queda 'embarcado' (Juan: los PL históricos son embarques reales).
  Aditiva; el código viejo sigue funcionando con ella puesta.
  Sin seeds ni permisos nuevos (PO Abiertos usa `reports_orders`).

(la migración `2026-09-08_precios_contratista_8dec.sql` YA está en prod desde
el 08-09 — línea anterior eliminada del pendiente)

---

## Done in previous releases
- 2026-09-11 (5º cherry-pick): precio congelado por entrega al generar el pago
  (regla Juan). Migración `2026-09-12_pago_precio_congelado.sql` aplicada a
  testing y PROD (backfill 118/121 entregas pagadas; las 3 sin precio son del
  pago folio 3, entregas de julio sin contratista ni pase — ya sumaban 0 antes).
  Backup: pre-release-pagoprecio-20260911-2220.dump. Master 33f8f94..e405657
  = commit a8fc8ca de dev. Imp-Exp sigue DEV-ONLY.
- 2026-09-11 (4º cherry-pick): pagos de contratistas al precio del pase de salida
  de SU contratista (jobs.contractorPrice era el del último pase, de cualquiera)
  — master e883139..33f8f94 = commit 45a17e8 de dev. Sin migración. Pagos 6 y 11
  salen corregidos (totales en vivo). Imp-Exp sigue DEV-ONLY.
- 2026-09-11 (3er cherry-pick): calidadLib con campos reales (liberado = Z9 en
  existencia, enPallet = ya empacado como Z0, sinPallet = resto) — master
  2bfa27f..e883139 = commit e9d5ba6 de dev. Solo query. Imp-Exp sigue DEV-ONLY.
- 2026-09-11 (2º cherry-pick): finished goods netos de pallets + "Units by SKU"
  en Vista ZenPet (master f8eb486..2bfa27f = commit bd86770 de dev). Solo
  queries. Imp-Exp sigue DEV-ONLY.
- 2026-09-11: reglas v3 ZenPet (Juan por WhatsApp) a prod vía CHERRY-PICK
  (master 678522c..f8eb486 = commit 2b1b224 de dev sin el batch Imp-Exp).
  Solo queries, sin migración. produccion = solo ensamble; empaqueZ0 y
  petInventario nuevos; calidadLib v3. El batch Imp-Exp (f205bdf, migración
  2026-09-11_impexp_status_openpo.sql) sigue DEV-ONLY esperando a Juan.
- 2026-09-07: obs 7-Sept a prod (visto bueno de Juan). Contratistas integrados en
  Historial, cronológico de la orden y módulo Producción; folio real en Capturar
  pallets. Sin migraciones. Merge master: e2b1433..9cd90ee.
- 2026-09-04: obs 3-Sept a prod (visto bueno de Juan). Migración
  `2026-09-04_obs0309_req_parcial.sql` aplicada a prod (only_one_type relajado
  para jobId+reqId; backfill de 9,714 ligas históricas). Requisiciones parciales
  FIFO, folio en PDF de orden exp, filtro por orden exp en Exportaciones.
  Antes en el día (cherry-pick 3f02245): `/zenpet/finished-goods`. Backup:
  pre-release-obs0309-20260904-1801.dump. Merge master: 3f02245..8db3ab7.
- 2026-09-03: obs 2-Sept a prod (visto bueno de Juan). Migración
  `2026-09-02_obs0209_iva_jobs_ref.sql` (contractors.iva + drop unique jobs.ref)
  y seed `2026-09-03_obs0209_seed_iva_cristobal.sql` (IVA a CRISTOBAL ASCOLANI,
  igual que Juan lo marcó en app2) aplicados a prod. Backup previo:
  pre-release-obs0209-20260903-2024.dump. Merge master: b185560..2c21dc4.
- 2026-08-27: obs 26-Ago puntos 1-3 + fix atribución por contratista a prod
  (visto bueno de Juan en app2). Migración `2026-08-27_obs26_insumo_atribucion_contratista.sql`
  aplicada a prod (26 entregas reales backfilled con su contratista). Antes en el
  día: puntos 4-6 ZenPet (PET 4 códigos, producción fusionada, totales por parte)
  a testing y prod. Merge master: 152b408..649b048.
- 2026-08-10: varios pases de salida por job con saldo (petición Juan mismo día).
  Migración `2026-08-10_multi_exitpass.sql` aplicada a testing y prod (aditiva +
  backfill de 12 relaciones reales). E2E en testing; deploy dev y master.
- 2026-08-05 (~00:30 UTC): TODO el backlog de julio-agosto a prod: Phase 2 pallets,
  obs 31/07 (Imp-Exp/PL), obs 03/08 (parser NaN, pre-exportación, comentarios,
  quitar por pallet, folio global de pallets), obs 04/08 (subproductos, PL de
  inventario, Modificar PL) y obs 04/08-02 (parciales almacén, status OCs).
  6 migraciones aplicadas; seeds: packslip_seq=2856 (siguiente 2857),
  pallet_seq desde 1 (Juan pidió arrancar de cero); permisos nivel 3 a JUAN
  MUÑOZ. Backup previo: pre-release-obs0308-20260805-0024.dump. Merge
  master: 37f2821..40b5825.
- 2026-07-23: Phase 1 (part-driven products, prod-only areas, export decrement).
  Migration `2026-07-21_phase1_export_movements.sql` applied to prod; fresh data
  cutover from old server; domains switched to *.cstgrp.com on 2026-07-24.
