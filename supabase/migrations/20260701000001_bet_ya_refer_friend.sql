-- I Bet Ya "refer_friend" outcome: tracks whether a validated referral has
-- already been paid out via the instant center-square cash-match flow, so the
-- same referrer/friend pair can never be credited twice through that flow
-- (independent of the pre-existing is_referral_free square-unlock mechanic).
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS bet_ya_credited_at TIMESTAMPTZ;
