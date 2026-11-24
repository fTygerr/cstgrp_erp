-- Obs 20-Nov (Juan) punto 2: al quitar el check de un movimiento ya surtido y
-- volver a ponerlo, se conserva la fecha ORIGINAL en vez de la del día.
-- Mientras el movimiento está sin check, su fecha se guarda aquí y
-- "activeDate" queda vacío (como hasta hoy); al volver a darle check se recupera.
-- Idempotente.
ALTER TABLE materialmovements ADD COLUMN IF NOT EXISTS "prevActiveDate" date;
