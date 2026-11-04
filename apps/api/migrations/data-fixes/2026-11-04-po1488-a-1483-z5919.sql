-- Las 72 pz de ZEN-Z0-5919 del pallet 389 (PL 2892) son del PO 1483, no del 1488 — solicitado por Juan Muñoz,
-- autorizado por Hector 04-nov-2026. Se mueve todo lo de esas 72 pz del job 1860 (1488) al job 1713 (1483):
-- liberación de calidad, contenido del pallet, línea del PL y su snapshot. Mismo material: inventario sin cambio (996).
-- Uso: psql ... -v ON_ERROR_STOP=1 -v fin=ROLLBACK -f este.sql   (ensayo)
--      psql ... -v ON_ERROR_STOP=1 -v fin=COMMIT   -f este.sql   (real)

BEGIN;

DO $$
BEGIN
  IF (SELECT calidad FROM ordermovements WHERE id = 6759 AND "progressId" = 1860) IS DISTINCT FROM 72 THEN RAISE EXCEPTION 'om 6759 cambió'; END IF;
  IF (SELECT count(*) FROM ordermovements WHERE "progressId" = 1860) <> 1 THEN RAISE EXCEPTION 'job 1860 tiene otras capturas'; END IF;
  IF (SELECT calidad FROM jobs WHERE id = 1713) IS DISTINCT FROM 996 THEN RAISE EXCEPTION 'jobs 1713 calidad cambió'; END IF;
  IF (SELECT amount FROM pallet_contents WHERE id = 581 AND "palletId" = 402 AND "jobId" = 1860) IS DISTINCT FROM 72 THEN RAISE EXCEPTION 'pc 581 cambió'; END IF;
  IF (SELECT count(*) FROM pallet_contents WHERE "jobId" IN (1713, 1860)) <> 1 THEN RAISE EXCEPTION 'hay otros pallets de estos jobs'; END IF;
  IF (SELECT amount || '|' || po FROM order_destiny WHERE id = 1095 AND "destinyId" = 717 AND "orderId" = 1860) IS DISTINCT FROM '72|1488' THEN RAISE EXCEPTION 'od 1095 cambió'; END IF;
  IF (SELECT orders[22]->>'ref' || '|' || (orders[22]->>'po') || '|' || (orders[22]->>'part') || '|' || (orders[22]->>'amount') FROM destinys WHERE id = 717) IS DISTINCT FROM '1488|1488|ZEN-Z0-5919|72' THEN RAISE EXCEPTION 'snapshot 2892 cambió'; END IF;
  IF (SELECT po FROM destinys WHERE id = 717) IS DISTINCT FROM '1480, 1483, 1482, 1487, 1488' THEN RAISE EXCEPTION 'header PO 2892 cambió'; END IF;
  IF (SELECT amount FROM materialmovements WHERE id = 1342291) IS DISTINCT FROM 996 THEN RAISE EXCEPTION 'mm 1342291 cambió'; END IF;
  IF (SELECT amount FROM materialmovements WHERE id = 1346848) IS DISTINCT FROM 72 THEN RAISE EXCEPTION 'mm 1346848 cambió'; END IF;
END $$;

-- 1. Liberación del 26-oct pasa al job 1483; se recalculan los dos jobs y sus entradas a inventario.
UPDATE ordermovements SET "progressId" = 1713 WHERE id = 6759;
UPDATE jobs SET calidad = (SELECT COALESCE(SUM(calidad), 0) FROM ordermovements WHERE "progressId" = jobs.id) WHERE id IN (1713, 1860);
UPDATE materialmovements SET amount = 1068, "realAmount" = 1068 WHERE id = 1342291;
UPDATE materialmovements SET amount = 0, "realAmount" = 0 WHERE id = 1346848;

-- 2. Pallet 389 y línea del PL 2892.
UPDATE pallet_contents SET "jobId" = 1713 WHERE id = 581;
UPDATE order_destiny SET "orderId" = 1713, po = '1483' WHERE id = 1095;
UPDATE destinys SET
  orders[22] = orders[22] || '{"ref": "1483", "po": "1483"}'::jsonb,
  po = '1480, 1483, 1482, 1487'
WHERE id = 717;

-- 3. Inventario (debe seguir en 996).
UPDATE materials SET
  amount = (SELECT COALESCE(SUM("realAmount"), 0) FROM materialmovements WHERE active AND "materialId" = 6833),
  "leftoverAmount" = (SELECT COALESCE(SUM("realAmount" - amount), 0) FROM materialmovements WHERE active AND "materialId" = 6833)
WHERE id = 6833;

INSERT INTO records (text, "user", module, action) VALUES (
  'Corrección solicitada por Juan Muñoz: 72 pz de ZEN-Z0-5919 (pallet 389, PL 2892) pasan del PO 1488 al PO 1483, incluida su liberación del 26-oct',
  'admin', 'ie', 'update');

DO $$
DECLARE a record; b record;
BEGIN
  SELECT j.calidad AS rel, (SELECT COALESCE(SUM(amount),0) FROM pallet_contents WHERE "jobId" = j.id) AS pal,
    (SELECT COALESCE(SUM(od.amount),0) FROM order_destiny od JOIN destinys d ON d.id = od."destinyId"
      WHERE od."orderId" = j.id AND d."packSlip" IS NOT NULL AND d.status IN ('embarcado','cruzado','recibido')) AS shp
  INTO a FROM jobs j WHERE j.id = 1713;
  SELECT j.calidad AS rel, (SELECT COALESCE(SUM(amount),0) FROM pallet_contents WHERE "jobId" = j.id) AS pal,
    (SELECT COALESCE(SUM(od.amount),0) FROM order_destiny od JOIN destinys d ON d.id = od."destinyId"
      WHERE od."orderId" = j.id AND d."packSlip" IS NOT NULL AND d.status IN ('embarcado','cruzado','recibido')) AS shp
  INTO b FROM jobs j WHERE j.id = 1860;
  IF a.rel <> 1068 OR a.pal <> 72 OR a.shp <> 72 THEN RAISE EXCEPTION '1483 mal: %', a; END IF;
  IF b.rel <> 0 OR b.pal <> 0 OR b.shp <> 0 THEN RAISE EXCEPTION '1488 mal: %', b; END IF;
  IF (SELECT amount FROM materials WHERE id = 6833) <> 996 THEN RAISE EXCEPTION 'inventario cambió'; END IF;
  RAISE NOTICE 'OK 1483: %  1488: %', a, b;
END $$;

SELECT o->>'ref' ref, o->>'po' po, o->>'part' part, o->>'amount' amount FROM destinys d, unnest(d.orders) o
WHERE d.id = 717 AND o->>'part' = 'ZEN-Z0-5919';

:fin;
