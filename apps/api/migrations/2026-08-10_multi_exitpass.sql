-- Varios pases de salida por job y saldo pendiente (petición Juan 10/08):
-- la relación pase↔job pasa a tabla propia con cantidad/precio POR PASE.
-- jobs conserva los agregados sincronizados ("contractorAmount" = suma de
-- pases, "exitId"/"contractorPrice" = último pase) para no tocar
-- entregas/pagos/progress.
CREATE TABLE IF NOT EXISTS exitpass_jobs (
  id serial PRIMARY KEY,
  created_at timestamp NOT NULL DEFAULT now(),
  "exitId" integer NOT NULL REFERENCES "exitPass"(id) ON DELETE CASCADE,
  "jobId" bigint NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  price numeric(10,2)
);
CREATE INDEX IF NOT EXISTS exitpass_jobs_exit_idx ON exitpass_jobs("exitId");
CREATE INDEX IF NOT EXISTS exitpass_jobs_job_idx ON exitpass_jobs("jobId");

-- backfill del modelo viejo (un pase por job)
INSERT INTO exitpass_jobs ("exitId", "jobId", amount, price)
SELECT "exitId", id, "contractorAmount", "contractorPrice"
FROM jobs
WHERE "exitId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM exitpass_jobs ej
    WHERE ej."jobId" = jobs.id AND ej."exitId" = jobs."exitId");
