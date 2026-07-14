-- Public winner announcement: snapshot the display name and the prize that
-- was live at the moment a winner was selected, so the record stays showable
-- even if the user is later deleted, and stays historically accurate even
-- after the admin changes game_configs.prize_title/prize_image_url for the
-- next week. Snapshots only populate going forward (from runWeeklyDraw) —
-- there is no historical prize data to backfill for past draws.

ALTER TABLE draw_winners ADD COLUMN IF NOT EXISTS winner_display_name TEXT;
ALTER TABLE draw_winners ADD COLUMN IF NOT EXISTS prize_title_snapshot TEXT;
ALTER TABLE draw_winners ADD COLUMN IF NOT EXISTS prize_image_url_snapshot TEXT;

-- Allow the row to survive a user deletion so the public announcement /
-- past-winners list doesn't lose history — it renders from the snapshot
-- columns above, not a live join, once user_id is null.
ALTER TABLE draw_winners ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE draw_winners DROP CONSTRAINT IF EXISTS draw_winners_user_id_fkey;
ALTER TABLE draw_winners
  ADD CONSTRAINT draw_winners_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
