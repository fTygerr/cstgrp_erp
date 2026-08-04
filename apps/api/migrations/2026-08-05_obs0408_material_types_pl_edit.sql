-- Observaciones 04/08 (SIGUIENTE ciclo — NO va en el release nocturno del 04/08)

-- 1. Tercer tipo de material: subproducto (lo que costuran contratistas, no
--    listo para exportar). type es la fuente de verdad; product (boolean) se
--    mantiene sincronizado por el backend para no tocar el código legacy.
ALTER TABLE materials ADD COLUMN IF NOT EXISTS type varchar(20)
  CHECK (type IN ('materiaPrima', 'producto', 'subproducto'));
UPDATE materials SET type = CASE WHEN product THEN 'producto' ELSE 'materiaPrima' END
  WHERE type IS NULL;

-- 2. PL de inventario (materia prima / subproducto directo del inventario,
--    sin jobs/pallets): las líneas usan materialId en lugar de orderId, y el
--    PL recuerda su tipo para el encabezado del PDF (NULL = FINISHED GOODS).
ALTER TABLE order_destiny ADD COLUMN IF NOT EXISTS "materialId" bigint REFERENCES materials(id);
ALTER TABLE order_destiny ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE destinys ADD COLUMN IF NOT EXISTS "plType" varchar(20)
  CHECK ("plType" IN ('materiaPrima', 'subproducto'));

-- 3. Modificar PL: cajas editables por línea (NULL = calculado con perBox) y
--    overrides de totales por PL (NULL = calculado). exported/soldTo ya
--    existen como jsonb en destinys y se editan directo.
ALTER TABLE order_destiny ADD COLUMN IF NOT EXISTS boxes integer;
ALTER TABLE destinys ADD COLUMN IF NOT EXISTS "totalBoxes" integer;
ALTER TABLE destinys ADD COLUMN IF NOT EXISTS "totalPallets" numeric(10,2);
