-- Observaciones 31/07 — rediseño de Packing List (Imp-Exp)
-- Pallets pueden quedar ligados directamente a un packing list (destinys)
ALTER TABLE pallets
  ADD COLUMN IF NOT EXISTS "destinyId" integer REFERENCES destinys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pallets_destiny_idx ON pallets ("destinyId");

-- Folio consecutivo automático para el Pack Slip #
-- NOTA PROD: ajustar el START al número que indique Juan (continuación de su
-- numeración real de pack slips) con: SELECT setval('packslip_seq', <n>, false);
CREATE SEQUENCE IF NOT EXISTS packslip_seq START 1000;
