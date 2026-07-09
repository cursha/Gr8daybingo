-- Human-written short labels for the deeds that were already
-- quick_tap_eligible before quick_tap_label existed (20260714000000).
-- Provided by Curt — see Quick Tap Label spec, "this needs a human pass."
UPDATE good_deeds SET quick_tap_label = 'Buy a beverage for a stranger'
  WHERE id = 1 AND deed_text = 'Buy a beverage for a stranger';
UPDATE good_deeds SET quick_tap_label = 'Write a heartfelt thank-you note'
  WHERE id = 3 AND deed_text = 'Write a heartfelt thank-you note or a card to a friend or mentor';
UPDATE good_deeds SET quick_tap_label = 'Leave better than average tip'
  WHERE id = 5 AND deed_text = 'Leave a better than average tip with a note for your server';
UPDATE good_deeds SET quick_tap_label = 'Donate clothes to job search program'
  WHERE id = 13 AND deed_text = 'Donate professional clothes to a job-readiness program';

-- Now that every quick_tap_eligible=true row has a label, the requires-label
-- CHECK from 20260714000000 (added NOT VALID) can be validated for real —
-- confirms no further exceptions were missed and it's fully enforced going
-- forward, not just for future writes.
ALTER TABLE good_deeds VALIDATE CONSTRAINT quick_tap_requires_label;
