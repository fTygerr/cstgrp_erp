-- Phase 1: part-driven products + export inventory decrement
-- Applied to `testing` on 2026-07-21. Apply to `postgres` (prod) at release time.

-- 1) Backfill: jobs that were registered via the old "Producto" selector have
--    movementId but a NULL part; copy the material code into part so the
--    part-number-driven flow covers them.
UPDATE jobs
SET part = m.code
FROM materialmovements mm
JOIN materials m ON m.id = mm."materialId"
WHERE jobs."movementId" = mm.id
  AND jobs.part IS NULL;

-- 2) Export movements: a packing-list save writes negative materialmovements
--    tied to the order_destiny line it ships.
ALTER TABLE materialmovements ADD COLUMN "orderDestinyId" integer;

ALTER TABLE materialmovements
  ADD CONSTRAINT "materialmovements_orderdestiny_fk"
  FOREIGN KEY ("orderDestinyId") REFERENCES order_destiny(id) ON DELETE CASCADE;

-- 3) Widen the exactly-one-parent check to include the new parent type.
ALTER TABLE materialmovements DROP CONSTRAINT only_one_type;
ALTER TABLE materialmovements ADD CONSTRAINT only_one_type CHECK (
  (
    (("jobId" IS NOT NULL))::integer
    + (("importId" IS NOT NULL))::integer
    + ((type IS NOT NULL))::integer
    + (("reqId" IS NOT NULL))::integer
    + (("purchaseId" IS NOT NULL))::integer
    + (("orderDestinyId" IS NOT NULL))::integer
  ) = 1
);
