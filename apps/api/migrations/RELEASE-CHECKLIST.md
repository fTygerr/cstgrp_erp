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

## PENDING for next release (as of 2026-07-31)

### 1. Migrations to run on prod, in order (already applied to testing)
- [ ] `2026-07-28_phase2_pallets.sql` — pallets/exportorders/pallet_contents tables + clients.palletSeq
- [ ] `2026-07-30_phase2b_pl_exportorders.sql` — exportorders.destinyId + order_destiny.exportOrderId
- [ ] `2026-07-31_obs_packing_list.sql` — pallets.destinyId + packslip_seq (Pack Slip folio)
- [ ] `2026-08-04_obs0308-2_export_comment.sql` — exportorders.comment (cuadro Comentarios en el PDF de la Orden de Exportación, obs 03/08-02)

(`2026-07-21_phase1_export_movements.sql` was already applied to prod on 2026-07-23 — do NOT re-run.)

### 2. Seed pallet folio counters (BLOCKER — needs Juan's numbers)
Per-client current physical pallet number, so folios continue instead of starting at 1:
```sql
-- fill in Juan's numbers:
UPDATE clients SET "palletSeq" = <n> WHERE name = 'CSI';
UPDATE clients SET "palletSeq" = <n> WHERE name = 'ZENPET';
UPDATE clients SET "palletSeq" = <n> WHERE name = 'OSCAR V';
UPDATE clients SET "palletSeq" = <n> WHERE name = 'HEADREST';
UPDATE clients SET "palletSeq" = <n> WHERE name = 'CST GROUP';
```

### 3. Grant the new `zenpet` permission (ZenPet Datos section)
```sql
UPDATE users SET permissions = permissions || '{"zenpet": 3}'::jsonb
WHERE username IN ('JUAN MUÑOZ');  -- add others if Juan wants
```
(Existing users without the key simply don't see the section — no backfill needed.)

### 4. Seed the Pack Slip folio (BLOCKER — needs Juan's number)
The new PL generator assigns consecutive Pack Slip #s from `packslip_seq`
(created at 1000 in testing). Ask Juan for the NEXT real pack slip number and:
```sql
SELECT setval('packslip_seq', <next número de pack slip>, false);
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

## Done in previous releases
- 2026-07-23: Phase 1 (part-driven products, prod-only areas, export decrement).
  Migration `2026-07-21_phase1_export_movements.sql` applied to prod; fresh data
  cutover from old server; domains switched to *.cstgrp.com on 2026-07-24.
