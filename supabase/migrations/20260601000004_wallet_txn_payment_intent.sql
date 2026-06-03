-- Prevent double-crediting a wallet from the same Stripe payment. Each
-- confirmed payment intent may credit the wallet at most once.

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_txn_payment_intent_unique
  ON wallet_transactions (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;
