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
- [ ] `2026-09-02_obs0209_iva_jobs_ref.sql` — (1) `contractors.iva` boolean
  (IVA 16% opcional en PDF de pagos); (2) quita el UNIQUE de `jobs.ref`
  (Job/PO repetido permitido con confirmación) y deja índice normal.

### Notas del batch obs 2-Sept (en dev/app2, pendiente visto bueno de Juan)
- P1: "liberado" = calidad interna + entregas de contratista aceptadas, en:
  Calidad→Liberación (total a liberar = cantidad de la orden), Calidad→Pallets
  (listado y tope al crear pallet) y ZenPet etapa 11. El inventario ya se
  incrementaba con lo aceptado (calidad+contractor) — sin cambio ahí. Sin backfill:
  es cambio de lectura, los datos ya estaban.
- P1-PD: filtro Job en Contratistas→Liberación no funcionaba (mandaba `jobpo`).
- P2: IVA 16% por contratista (check en Estructura→Contratistas; en el PDF de
  pagos: TOTAL, IVA (16%), GRAN TOTAL solo para quien lo tenga).
- P3: Calidad→Pallets excluye subproductos (solo producto terminado).
- P4: Job/PO repetido permitido con alerta de confirmación (409 + force).
- P5/P6: ZenPet — partes ZEN-Z4-% fuera de Corte de componentes y de Kits.
- P7 (pregunta): Empaque/PT se depura solo al exportar — confirmado, sin cambio.
- ZenPet drop-down materia prima (batch anterior) ya está en prod; `/zenpet/etapas`
  sin cambios para la app de ZenPet.

### Notas del batch (en dev/app2, pendiente visto bueno de Juan)
- Requisición de insumos: el backend ahora rechaza materiales no marcados como
  insumo (obs Juan 31-Ago, commit `75f9559`). Sin migración ni seeds. Recordar a
  Juan que debe reclasificar sus insumos en Almacén→Inventario para poder usarla.

---

## Done in previous releases
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
