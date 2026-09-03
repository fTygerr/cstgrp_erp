-- Obs 2-Sept (Juan):
-- (2) IVA 16% opcional por contratista (aparece solo en el PDF de pagos)
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS iva boolean NOT NULL DEFAULT false;

-- (4) permitir Job/PO repetido (el backend ahora avisa y pide confirmación;
--     se conserva un índice normal para las búsquedas por ref)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_ref_unique;
CREATE INDEX IF NOT EXISTS jobs_ref_idx ON jobs (ref);
