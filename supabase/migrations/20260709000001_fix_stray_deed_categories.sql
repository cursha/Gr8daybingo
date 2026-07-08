-- Cleanup found while double-checking the old (pre-6-category) deed data for
-- GitHub-auto-deploy safety: these 4 deeds were never part of the 2024 seed
-- data the 20260616000004 remap covers — they were added later (admin
-- import/testing) with no category, or a category outside the real taxonomy
-- (NOTICE/CONNECT/CELEBRATE/ENCOURAGE/HELP/DELIGHT/CARE).

-- Retire a literal test/placeholder deed that was live and approved in
-- production — eligible to be randomly assigned to a real player's card.
UPDATE good_deeds SET is_active = false
  WHERE id = 251 AND deed_text = 'This is a test deed to see if this is working.';

-- Recategorize the remaining legitimate deeds into the current taxonomy.
UPDATE good_deeds SET category = 'CARE'
  WHERE id = 252 AND deed_text = 'Set aside time for yourself';
UPDATE good_deeds SET category = 'ENCOURAGE'
  WHERE id = 59 AND deed_text = 'Offer a friendly word of encouragement to a stranger.';
UPDATE good_deeds SET category = 'CELEBRATE'
  WHERE id = 57 AND deed_text = 'Send an appreciation card';
