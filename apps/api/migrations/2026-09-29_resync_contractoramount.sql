-- Resync del caché jobs."contractorAmount" (29-Sep-2026)
--
-- Hasta hoy, jobs.update escribía contractorAmount = 0 en cada edición de
-- orden, y nada lo reconstruía. Como "prodAmount" es columna generada
-- (amount − contractorAmount), las órdenes editadas quedaban con la meta
-- inflada: el pase de salida ofrecía de más (Juan 29-sep: la S-16975 ofrecía
-- 941 cuando debían ser 144) y Producción/Calidad mostraban objetivo mayor.
--
-- Deja el caché igual a la suma real de sus pases de salida y recalcula
-- `completed` con LA MISMA fórmula de updateOrderAmounts() (production.utils.ts)
-- SÓLO en las órdenes que este script tocó. A propósito NO se recalcula el
-- flag en toda la tabla: hay ~1,379 órdenes cuyo flag no cuadra con la fórmula
-- por razones viejas y ajenas a este bug, y no se tocan.
--
-- Los dos UPDATE van en sentencias separadas (no en un CTE) porque "prodAmount"
-- es columna GENERADA: dentro de una sola sentencia el cálculo de `completed`
-- vería el valor viejo.
--
-- Idempotente: si no hay nada fuera de sincronía, no cambia ninguna fila.

BEGIN;

CREATE TEMP TABLE resync_ids ON COMMIT DROP AS
SELECT j.id,
       j."contractorAmount" AS antes,
       COALESCE((SELECT SUM(ej.amount) FROM exitpass_jobs ej WHERE ej."jobId" = j.id), 0) AS despues
FROM jobs j
WHERE j."contractorAmount" <> COALESCE(
      (SELECT SUM(ej.amount) FROM exitpass_jobs ej WHERE ej."jobId" = j.id), 0);

UPDATE jobs j
SET "contractorAmount" = r.despues
FROM resync_ids r
WHERE j.id = r.id;

UPDATE jobs j
SET completed = (
      ((COALESCE(j."produccionTime", 0) > 0 AND j."produccion" = j."prodAmount") OR COALESCE(j."produccionTime", 0) = 0) AND
      ((COALESCE(j."serigrafiaTime", 0) > 0 AND j."serigrafia" = j."amount") OR COALESCE(j."serigrafiaTime", 0) = 0) AND
      ((COALESCE(j."corteTime", 0) > 0 AND j."corte" = j."amount") OR COALESCE(j."corteTime", 0) = 0) AND
      ((COALESCE(j."cortesVariosTime", 0) > 0 AND j."cortesVarios" = j."amount") OR COALESCE(j."cortesVariosTime", 0) = 0) AND
      ((COALESCE(j."calidadTime", 0) > 0 AND j."calidad" = j."prodAmount") OR COALESCE(j."calidadTime", 0) = 0)
    )
WHERE j.id IN (SELECT id FROM resync_ids);

COMMIT;
