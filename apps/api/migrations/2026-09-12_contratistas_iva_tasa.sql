-- Contratistas: IVA por tasa (Juan 11-Sep-2026): sin IVA, 8% o 16% según el
-- contratista. Antes era un booleano (iva = true → 16% en el PDF de pagos).
-- Se conserva contractors.iva (true cuando la tasa > 0) para el código viejo.
ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS "ivaRate" smallint NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contractors_ivarate_check') THEN
    ALTER TABLE contractors ADD CONSTRAINT contractors_ivarate_check
      CHECK ("ivaRate" IN (0, 8, 16));
  END IF;
END $$;

-- Backfill: los que hoy tienen IVA habilitado siguen al 16%
UPDATE contractors SET "ivaRate" = 16 WHERE iva = true AND "ivaRate" = 0;
