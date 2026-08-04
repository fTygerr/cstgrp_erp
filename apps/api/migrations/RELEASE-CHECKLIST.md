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

## PENDING for next release (as of 2026-08-04 — release planeado esta noche con visto bueno de Juan)

### 1. Migrations to run on prod, in order (already applied to testing)
- [ ] `2026-07-28_phase2_pallets.sql` — pallets/exportorders/pallet_contents tables + clients.palletSeq
- [ ] `2026-07-30_phase2b_pl_exportorders.sql` — exportorders.destinyId + order_destiny.exportOrderId
- [ ] `2026-07-31_obs_packing_list.sql` — pallets.destinyId + packslip_seq (Pack Slip folio)
- [ ] `2026-08-04_obs0308-2_export_comment.sql` — exportorders.comment (cuadro Comentarios en el PDF de la Orden de Exportación, obs 03/08-02)
- [ ] `2026-08-04_obs0308-3_global_pallet_seq.sql` — secuencia global `pallet_seq` (folio de pallet único para toda la empresa) + drop de clients.palletSeq

(`2026-07-21_phase1_export_movements.sql` was already applied to prod on 2026-07-23 — do NOT re-run.)

### 2. Seed the pallet folio (BLOCKER — needs Juan's number)
El folio de pallet es UN SOLO consecutivo para toda la empresa (aclaración de
Juan 04/08 — nunca se repite entre clientes). Pedirle el ÚLTIMO número físico
de pallet usado:
```sql
SELECT setval('pallet_seq', <último número de pallet usado>, true);  -- el siguiente será +1
```

### 3. Grant the new `zenpet` permission (ZenPet Datos section)
```sql
UPDATE users SET permissions = permissions || '{"zenpet": 3}'::jsonb
WHERE username IN ('JUAN MUÑOZ');  -- add others if Juan wants
```
(Existing users without the key simply don't see the section — no backfill needed.)

### 4. Seed the Pack Slip folio (BLOCKER — needs Juan's number)
The new PL generator assigns consecutive Pack Slip #s from `packslip_seq`
(created at 1000 in testing). Pedirle a Juan el ÚLTIMO pack slip usado
(mismo formato que el de pallets, para no confundir siguiente vs último):
```sql
SELECT setval('packslip_seq', <último pack slip usado>, true);  -- el siguiente será +1
```

### 5. Grant the new `ie_packing_list` permission (Packing List submodule)
```sql
UPDATE users SET permissions = permissions || '{"ie_packing_list": 3}'::jsonb
WHERE username IN ('JUAN MUÑOZ');  -- LEER/MODIFICAR (1/2) for other Imp-Exp users
```

### 6. Level-3 ("EDITAR Y ELIMINAR") grants per Juan's Observaciones 31/07
Juan said only he should hold the delete privilege:
```sql
UPDATE users SET permissions = permissions ||
  '{"quality": 3, "exports": 3, "contractors_orders": 3, "contractors_deliveries": 3}'::jsonb
WHERE username IN ('JUAN MUÑOZ');
```

### 7. Explicitly NOT replicated to prod (testing-only changes)
- `test` user elevated permissions / all prod_areas — testing convenience only.
- Any pallets/export orders created during testing — demo data, stays in testing.

---

## SIGUIENTE ciclo — obs 04/08 (ya en dev/app2, NO va en el release nocturno del 04/08)
**IMPORTANTE para el release de esta noche: fusionar a master SOLO hasta el
commit `2006dbf` (lo validado por Juan), NO la punta de dev:**
```sh
git checkout master && git merge 2006dbf && git push --no-verify origin master
```
Las obs 04/08 (commit `a3084e0`) se quedan en dev/app2 para validación de Juan
y saldrán en el siguiente release, junto con su migración:
- [ ] `2026-08-05_obs0408_material_types_pl_edit.sql` — materials.type (subproducto),
  order_destiny.materialId/boxes (PL de inventario), destinys.plType/totalBoxes/totalPallets
  (Modificar PL). Ya aplicada a testing. Sin seeds ni permisos nuevos.

---

## Done in previous releases
- 2026-07-23: Phase 1 (part-driven products, prod-only areas, export decrement).
  Migration `2026-07-21_phase1_export_movements.sql` applied to prod; fresh data
  cutover from old server; domains switched to *.cstgrp.com on 2026-07-24.
