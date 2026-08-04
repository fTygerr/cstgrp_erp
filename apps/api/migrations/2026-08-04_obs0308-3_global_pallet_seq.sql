-- Aclaración de Juan (04/08): el número de pallet es UN SOLO consecutivo para
-- toda la empresa — nunca se repite aunque el cliente sea distinto (igual que
-- el pack slip). Sustituye el contador por-cliente clients."palletSeq".
--
-- NOTA PROD: sembrar con el ÚLTIMO número físico de pallet que indique Juan:
--   SELECT setval('pallet_seq', <último usado>, true);   -- el siguiente será +1
-- (en testing se siembra arriba del folio máximo existente para continuar).

CREATE SEQUENCE IF NOT EXISTS pallet_seq START 1;

-- El contador por cliente deja de usarse; se elimina para no dejar columna zombie.
ALTER TABLE clients DROP COLUMN IF EXISTS "palletSeq";
