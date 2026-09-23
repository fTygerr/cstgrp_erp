-- Imp-Exp: estatus del Packing List + liga Proforma↔PL (Hector/Juan 11-Sep-2026)
-- Antes: "existe el PL" se interpretaba como "ya se embarcó" y la fecha se
-- tecleaba a mano. Ahora el PL tiene ciclo: generado → embarcado → cruzado →
-- recibido, con fecha automática en cada paso. Aditiva y segura con el código
-- desplegado (defaults + columnas nullables).

ALTER TABLE destinys
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'generado',
  ADD COLUMN IF NOT EXISTS "shippedAt" timestamp,          -- botón "Salió" (hora real)
  ADD COLUMN IF NOT EXISTS "crossedAt" date,               -- fecha del pedimento (vía Proforma)
  ADD COLUMN IF NOT EXISTS "receivedAt" date,              -- confirmación de recibo del cliente
  ADD COLUMN IF NOT EXISTS "receivedPallets" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "receivedComplete" boolean,
  ADD COLUMN IF NOT EXISTS "receivedNotes" text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destinys_status_check') THEN
    ALTER TABLE destinys ADD CONSTRAINT destinys_status_check
      CHECK (status IN ('generado', 'embarcado', 'cruzado', 'recibido'));
  END IF;
END $$;

-- Proforma (pedimento) ligada al packing list que amparó
ALTER TABLE preforms
  ADD COLUMN IF NOT EXISTS "destinyId" integer REFERENCES destinys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS preforms_destinyid_idx ON preforms ("destinyId");

-- Backfill: todo PL ya generado con fecha de embarque pasada o de hoy se
-- considera embarcado (Juan: todos los PL existentes son embarques reales).
-- Se usa la fecha tecleada como hora de salida para no perder la historia.
UPDATE destinys
SET status = 'embarcado', "shippedAt" = "shipDate"::timestamp
WHERE status = 'generado'
  AND (so LIKE 'PS-%' OR exported IS NOT NULL)
  AND "shipDate" IS NOT NULL
  AND "shipDate" <= (now() AT TIME ZONE 'America/Tijuana')::date;
