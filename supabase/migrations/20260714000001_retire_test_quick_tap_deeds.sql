-- Confirmed with Curt: ids 253/254 are leftover test/placeholder deeds, same
-- class of stray data as id 251 in 20260709000001. They were live and
-- quick_tap_eligible, so retire them the same way — is_active = false takes
-- them out of every read path (card generation, Quick Tap eligibility, etc.)
-- — plus turn off quick_tap_eligible since a retired deed has no business
-- staying selectable for Quick Tap.
UPDATE good_deeds SET is_active = false, quick_tap_eligible = false
  WHERE id = 253 AND deed_text = 'This is test short';
UPDATE good_deeds SET is_active = false, quick_tap_eligible = false
  WHERE id = 254 AND deed_text = 'Test Deed Short';
