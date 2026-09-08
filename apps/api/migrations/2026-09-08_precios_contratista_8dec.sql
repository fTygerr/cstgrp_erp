-- Precios de contratistas con hasta 8 decimales (petición Juan 08/09).
-- El precio viaja: contractor_prices (catálogo) → exitpass_jobs (por pase)
-- → jobs."contractorPrice" (vigente). Se amplían las 3 columnas; widening de
-- numeric es seguro e instantáneo (no reescribe la tabla).
ALTER TABLE contractor_prices ALTER COLUMN price TYPE numeric(16,8);
ALTER TABLE exitpass_jobs ALTER COLUMN price TYPE numeric(16,8);
ALTER TABLE jobs ALTER COLUMN "contractorPrice" TYPE numeric(16,8);
