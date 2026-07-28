-- Phase 2: pallet tracking + export orders (Calidad module)
-- Applied to `testing` on 2026-07-28. Apply to `postgres` (prod) at release time.

-- Export orders: a client-scoped pick list of pallets (Orden de Exportación PDF).
CREATE TABLE exportorders (
  id serial PRIMARY KEY,
  created_at timestamp NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT (now())::date,
  "clientId" bigint NOT NULL REFERENCES clients(id)
);

-- Pallets: folio is a per-client sequence (displayed as "<client name>-<folio>").
-- Seed per-client starting numbers at go-live by updating clients."palletSeq".
CREATE TABLE pallets (
  id serial PRIMARY KEY,
  created_at timestamp NOT NULL DEFAULT now(),
  folio integer NOT NULL,
  "clientId" bigint NOT NULL REFERENCES clients(id),
  "exportOrderId" integer REFERENCES exportorders(id) ON DELETE SET NULL,
  CONSTRAINT pallets_client_folio_unique UNIQUE ("clientId", folio)
);

-- Contents: one row per job on the pallet (combined pallets have several, max
-- enforced in the service, same client only).
CREATE TABLE pallet_contents (
  id serial PRIMARY KEY,
  "palletId" integer NOT NULL REFERENCES pallets(id) ON DELETE CASCADE,
  "jobId" bigint NOT NULL REFERENCES jobs(id),
  amount integer NOT NULL CHECK (amount > 0),
  boxes integer NOT NULL CHECK (boxes >= 0)
);

-- Per-client folio counter (next pallet gets palletSeq + 1, transactionally).
ALTER TABLE clients ADD COLUMN "palletSeq" integer NOT NULL DEFAULT 0;
