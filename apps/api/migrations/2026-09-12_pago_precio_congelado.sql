-- Pagos de contratistas: precio congelado por entrega (Juan 11-Sep-2026)
-- Regla de Juan: el precio se negocia y puede cambiar al momento del pago, sin
-- importar lo surtido. Al GENERAR el pago se toma el precio vigente de la lista
-- del contratista para ese número de parte y se guarda en la entrega; a partir
-- de ahí ese reporte ya no se mueve aunque la lista cambie.
ALTER TABLE contractormovements
  ADD COLUMN IF NOT EXISTS price numeric(16,8);

-- Backfill: las entregas que YA están en un pago se congelan con el precio que
-- hoy muestra el reporte (precio del pase de salida de su contratista, fix del
-- 11-Sep), para que los pagos ya generados no cambien con esta migración.
UPDATE contractormovements cm
SET price = COALESCE(
  (SELECT ej.price FROM exitpass_jobs ej
     JOIN "exitPass" e ON e.id = ej."exitId"
    WHERE ej."jobId" = cm."orderId" AND e."contractorId" = cm."contractorId"
    ORDER BY (e.date <= cm.date) DESC, e.date DESC, ej.id DESC LIMIT 1),
  (SELECT j."contractorPrice" FROM jobs j WHERE j.id = cm."orderId"))
WHERE cm."paymentId" IS NOT NULL AND cm.price IS NULL;
