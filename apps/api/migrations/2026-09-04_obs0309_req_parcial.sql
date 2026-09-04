-- Obs 3-Sept puntos 1-2: requisiciones parciales.
-- (1) Un movimiento de job ahora puede llevar también "reqId" (la liga explícita
--     movimiento↔requisición); el CHECK only_one_type se relaja SOLO para esa
--     combinación — todo lo demás sigue siendo exclusivo.
ALTER TABLE materialmovements DROP CONSTRAINT IF EXISTS only_one_type;
ALTER TABLE materialmovements ADD CONSTRAINT only_one_type CHECK (
  (
    "jobId" IS NOT NULL
    AND ("importId" IS NOT NULL)::integer + (type IS NOT NULL)::integer
      + ("purchaseId" IS NOT NULL)::integer + ("orderDestinyId" IS NOT NULL)::integer = 0
  )
  OR (
    "jobId" IS NULL
    AND ("importId" IS NOT NULL)::integer + (type IS NOT NULL)::integer
      + ("reqId" IS NOT NULL)::integer + ("purchaseId" IS NOT NULL)::integer
      + ("orderDestinyId" IS NOT NULL)::integer = 1
  )
);

-- (2) Backfill: las requisiciones existentes se ligaban por texto
--     (requisitions.jobs LIKE ',ref,'); se materializa esa liga en reqId para
--     que el remanente de un parcial futuro quede requisitionable.
UPDATE materialmovements mm
SET "reqId" = (
  SELECT max(r.id) FROM requisitions r
  WHERE r."materialId" = mm."materialId"
    AND r.jobs LIKE '%,' || j.ref || ',%'
)
FROM jobs j
WHERE j.id = mm."jobId" AND mm."reqId" IS NULL AND NOT mm.extra
  AND EXISTS (
    SELECT 1 FROM requisitions r2
    WHERE r2."materialId" = mm."materialId"
      AND r2.jobs LIKE '%,' || j.ref || ',%'
  );
