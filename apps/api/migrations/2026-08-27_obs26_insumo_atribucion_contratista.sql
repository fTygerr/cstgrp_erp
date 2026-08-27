-- Obs 26-Ago puntos 1-3 + fix de atribución por contratista (PENDIENTE PROD)

-- Punto 2: cuarto tipo de material 'insumo' (consumibles; se requieren por la
-- opción "insumos" de Requisiciones). Juan reclasificará manualmente.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_type_check;
ALTER TABLE materials ADD CONSTRAINT materials_type_check
  CHECK (type IN ('materiaPrima', 'producto', 'subproducto', 'insumo'));

-- Fix contratistas: cada entrega registra DE QUÉ contratista viene, para que
-- resumen/pagos separen orden×contratista (antes: todo al último pase).
ALTER TABLE contractormovements ADD COLUMN IF NOT EXISTS "contractorId" integer REFERENCES contractors(id);
-- backfill: contratista del pase vigente de la orden
UPDATE contractormovements cm SET "contractorId" = e."contractorId"
FROM jobs j
JOIN "exitPass" e ON e.id = j."exitId"
WHERE cm."orderId" = j.id AND cm."contractorId" IS NULL;
