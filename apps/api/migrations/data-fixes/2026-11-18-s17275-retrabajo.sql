-- S-17275 (ZEN-Z0-5950, PO 1482) estaba registrado dos veces y el feed /zenpet/etapas mandaba dos renglones
-- idénticos en Producción, lo que trabó el reporte de ZenPet. Juan (18-nov): el segundo job es real, son las
-- mismas 120 pz que el cliente regresó para un trabajo especial y vuelven en la siguiente exportación.
-- Autorizado por Hector 18-nov-2026.
--   1. job 1845 (22-oct, ya embarcado en PL 2892): se marca completed (todas sus etapas están completas;
--      quedó abierto por el desfase de updateOrderAmounts).
--   2. job 1967 (13-nov, retrabajo): ref S-17275 -> 'S-17275 R'.
-- Uso: psql ... -v ON_ERROR_STOP=1 -v fin=ROLLBACK|COMMIT -f este.sql

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM jobs WHERE ref = 'S-17275') <> 2 THEN RAISE EXCEPTION 'ya no hay exactamente 2 S-17275'; END IF;
  IF (SELECT ref || '|' || completed || '|' || corte || '|' || "cortesVarios" || '|' || produccion || '|' || calidad
      FROM jobs WHERE id = 1845) IS DISTINCT FROM 'S-17275|false|120|120|120|120' THEN RAISE EXCEPTION 'job 1845 cambió'; END IF;
  IF (SELECT ref FROM jobs WHERE id = 1967) IS DISTINCT FROM 'S-17275' THEN RAISE EXCEPTION 'job 1967 cambió'; END IF;
  IF EXISTS (SELECT 1 FROM jobs WHERE ref = 'S-17275 R') THEN RAISE EXCEPTION 'S-17275 R ya existe'; END IF;
END $$;

UPDATE jobs SET completed = true WHERE id = 1845;
UPDATE jobs SET ref = 'S-17275 R' WHERE id = 1967;

INSERT INTO records (text, "user", module, action) VALUES
  ('Se cerró el job S-17275 de octubre (ya embarcado en PL 2892) y el job S-17275 del 13-nov se renombró a S-17275 R (retrabajo de las 120 pz que regresó el cliente), confirmado por Juan Muñoz',
   'admin', 'production', 'update');

SELECT id, ref, programation, part, amount, completed FROM jobs WHERE id IN (1845, 1967);

:fin;
