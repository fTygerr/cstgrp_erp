-- Phase 2B: connect packing lists (destinys) to Calidad's export orders
-- Applied to `testing` on 2026-07-30. Apply to `postgres` (prod) at release time.

-- An export order gets consumed by (at most) one packing list.
ALTER TABLE exportorders
  ADD COLUMN "destinyId" integer REFERENCES destinys(id) ON DELETE SET NULL;

-- Track which order_destiny lines were generated from an export order so
-- un-applying removes exactly those lines (manual lines keep NULL).
ALTER TABLE order_destiny
  ADD COLUMN "exportOrderId" integer REFERENCES exportorders(id) ON DELETE SET NULL;
