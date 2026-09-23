-- Obs 23-Sep (Juan) punto 6: en el Packing List de ZenPet la columna PO debe
-- traer el número de la PROGRAMACIÓN con la que se dio de alta la orden.
-- Para otros clientes el PO NO va en programación, así que se hace por cliente
-- en vez de quemar "ZENPET" en el código.
--
-- NOTA: esto NO es el rediseño de 3 campos (Programación / Job / PO) que Juan
-- propone en el mismo documento — eso queda pendiente de decisión de Hector.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS "poFromProgramation" boolean NOT NULL DEFAULT false;

UPDATE clients SET "poFromProgramation" = true WHERE name = 'ZENPET';
