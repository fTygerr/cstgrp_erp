-- Ajuste PO 1483 / ZEN-Z0-5922 (job id 1714) por depuraciones — solicitado por Juan Muñoz, autorizado por Hector 04-nov-2026.
-- Las 1032 pz que salieron bajo el job 1483 en realidad cerraron POs anteriores (ya cerrados en el sistema
-- desde las depuraciones). Se dejan sólo las últimas 408 pz como exportadas del PO 1483.
-- Resultado esperado: liberado 423, paletizado 408, exportado 408, abierto 2472, inventario 6834 sin cambio (15).
-- Uso: psql ... -v ON_ERROR_STOP=1 -v fin=ROLLBACK -f este.sql   (ensayo)
--      psql ... -v ON_ERROR_STOP=1 -v fin=COMMIT   -f este.sql   (real)

BEGIN;

-- Precondiciones: si algo cambió desde la revisión, aborta sin tocar nada.
DO $$
BEGIN
  IF (SELECT calidad FROM ordermovements WHERE id = 6631 AND "progressId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'om 6631 cambió'; END IF;
  IF (SELECT calidad FROM ordermovements WHERE id = 6754 AND "progressId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'om 6754 cambió'; END IF;
  IF (SELECT calidad FROM jobs WHERE id = 1714) IS DISTINCT FROM 1455 THEN RAISE EXCEPTION 'jobs.calidad cambió'; END IF;
  IF (SELECT amount FROM pallet_contents WHERE id = 521 AND "palletId" = 356 AND "jobId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'pc 521 cambió'; END IF;
  IF (SELECT count(*) FROM pallet_contents WHERE "palletId" = 356) <> 1 THEN RAISE EXCEPTION 'pallet 346 tiene otros contenidos'; END IF;
  IF (SELECT amount FROM pallet_contents WHERE id = 577 AND "palletId" = 400 AND "jobId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'pc 577 cambió'; END IF;
  IF (SELECT amount FROM order_destiny WHERE id = 993 AND "destinyId" = 692 AND "orderId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'od 993 cambió'; END IF;
  IF (SELECT amount FROM order_destiny WHERE id = 1088 AND "destinyId" = 717 AND "orderId" = 1714) IS DISTINCT FROM 720 THEN RAISE EXCEPTION 'od 1088 cambió'; END IF;
  IF (SELECT "realAmount" FROM materialmovements WHERE id = 1347526 AND "orderDestinyId" = 1088) IS DISTINCT FROM -720 THEN RAISE EXCEPTION 'mm 1347526 cambió'; END IF;
  IF (SELECT "totalPallets" FROM destinys WHERE id = 692) IS DISTINCT FROM 16 THEN RAISE EXCEPTION 'PL 2884 totalPallets cambió'; END IF;
  IF (SELECT orders[12]->>'ref' || '|' || (orders[12]->>'part') || '|' || (orders[12]->>'amount') FROM destinys WHERE id = 692) IS DISTINCT FROM '1483|ZEN-Z0-5922|720' THEN RAISE EXCEPTION 'snapshot 2884 cambió'; END IF;
  IF (SELECT orders[15]->>'ref' || '|' || (orders[15]->>'part') || '|' || (orders[15]->>'amount') FROM destinys WHERE id = 717) IS DISTINCT FROM '1483|ZEN-Z0-5922|720' THEN RAISE EXCEPTION 'snapshot 2892 cambió'; END IF;
END $$;

-- 1. Liberaciones de calidad: fuera la del 16-oct, la del 26-oct queda en 408.
DELETE FROM ordermovements WHERE id = 6631;
UPDATE ordermovements SET calidad = 408 WHERE id = 6754;
UPDATE jobs SET calidad = (SELECT COALESCE(SUM(calidad), 0) FROM ordermovements WHERE "progressId" = 1714) WHERE id = 1714;
UPDATE materialmovements SET amount = 423, "realAmount" = 423 WHERE id = 1342295;

-- 2. Pallet 346 (id 356) sale del PL 2884 y se borra; su línea y su salida de inventario también.
DELETE FROM pallets WHERE id = 356;                 -- cascade: pallet_contents 521
DELETE FROM order_destiny WHERE id = 993;           -- cascade: materialmovements 1345937 (-720)
UPDATE destinys SET
  orders = orders[1:11] || orders[13:],
  "totalPallets" = 15,
  po = '1475, 1479, 1480, 1482'
WHERE id = 692;

-- 3. Pallet 387 (id 400) / PL 2892: 720 -> 408 pz (34 cajas).
UPDATE pallet_contents SET amount = 408, boxes = 34 WHERE id = 577;
UPDATE order_destiny SET amount = 408 WHERE id = 1088;
UPDATE materialmovements SET amount = -408, "realAmount" = -408 WHERE id = 1347526;
UPDATE destinys SET orders[15] = jsonb_set(orders[15], '{amount}', '408') WHERE id = 717;

-- 4. Inventario de la parte (debe seguir en 15).
UPDATE materials SET
  amount = (SELECT COALESCE(SUM("realAmount"), 0) FROM materialmovements WHERE active AND "materialId" = 6834),
  "leftoverAmount" = (SELECT COALESCE(SUM("realAmount" - amount), 0) FROM materialmovements WHERE active AND "materialId" = 6834)
WHERE id = 6834;

-- 5. Bitácora.
INSERT INTO records (text, "user", module, action) VALUES (
  'Ajuste PO 1483 por depuraciones, solicitado por Juan Muñoz: ZEN-Z0-5922 liberado 1455→423, se eliminó el pallet 346 del PL 2884 (16→15 pallets), pallet 387 del PL 2892 720→408 pz',
  'admin', 'ie', 'update');

-- Postcondiciones.
DO $$
DECLARE r record;
BEGIN
  SELECT j.calidad + j.contractor AS released,
    (SELECT COALESCE(SUM(amount), 0) FROM pallet_contents WHERE "jobId" = 1714) AS palletized,
    (SELECT COALESCE(SUM(od.amount), 0) FROM order_destiny od JOIN destinys d ON d.id = od."destinyId"
      WHERE od."orderId" = 1714 AND d."packSlip" IS NOT NULL AND d.status IN ('embarcado','cruzado','recibido')) AS shipped,
    j.amount
  INTO r FROM jobs j WHERE j.id = 1714;
  IF r.released <> 423 OR r.palletized <> 408 OR r.shipped <> 408 OR r.amount - r.shipped <> 2472 THEN
    RAISE EXCEPTION 'postcondición falló: %', r;
  END IF;
  IF (SELECT amount FROM materials WHERE id = 6834) <> 15 THEN RAISE EXCEPTION 'inventario cambió'; END IF;
  IF (SELECT array_length(orders, 1) FROM destinys WHERE id = 692) <> 11 THEN RAISE EXCEPTION 'snapshot 2884 mal'; END IF;
  RAISE NOTICE 'OK: %', r;
END $$;

SELECT o->>'ref' ref, o->>'part' part, o->>'amount' amount FROM destinys d, unnest(d.orders) o
WHERE d.id IN (692, 717) AND o->>'part' = 'ZEN-Z0-5922';

:fin;
