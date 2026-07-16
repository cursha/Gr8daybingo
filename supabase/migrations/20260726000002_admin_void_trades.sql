-- Admin trade voiding — same audit pattern as admin/void-cell + cell_mark_log:
-- an admin can reverse a trade (pending or already-accepted), with who/why
-- recorded on the row itself rather than a separate log table, since a trade
-- is already a single self-contained record (unlike a cell, which can be
-- marked/voided many times).
ALTER TABLE square_trades DROP CONSTRAINT square_trades_status_check;
ALTER TABLE square_trades ADD CONSTRAINT square_trades_status_check
  CHECK (status IN ('pending','accepted','rejected','cancelled','expired','voided'));

ALTER TABLE square_trades ADD COLUMN IF NOT EXISTS voided_by TEXT REFERENCES users(id);
ALTER TABLE square_trades ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE square_trades ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
