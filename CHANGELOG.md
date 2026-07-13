# Changelog

Version format: `v{major}.{minor}` — bumped once per push. Major increments
(and minor resets to 0) when a push adds new functionality; minor increments
when a push is fixes only.

## v9.1 — 2026-07-13
### Fixed
- Renamed "I Bet Ya" back to "I Dare Ya" throughout — table (`bet_ya_outcomes`
  → `dare_ya_outcomes`), endpoints, all internal identifiers, visible labels,
  and CLAUDE.md. Reverses the 2026-07-05 fix that went the other direction.
  Backward-compatible: outcome data is persisted as JSON keys inside existing
  `player_cards.card_data`, not just DB columns, so a hard rename would have
  broken the centre square on every card already in play — new cards write
  `dare_ya_*` only, reads fall back to legacy `bet_ya_*` for pre-rename cards.

## v9.0 — 2026-07-13
### Added
- Player profile pages (`/players/:username`) — viewable by any registered
  player, not just the profile owner. Shows username (never real name),
  badge, career deed total, current/longest streak, country, and team.
  Player rows on the Leaderboard's Players tab are now clickable through
  to this. "My Profile" added to GameBoard's toolbar dropdown, linking to
  `/players/me` — a self-referencing alias the backend resolves to the
  authenticated player without the frontend needing to know its own
  username; the page swaps the URL to the real username once loaded.
### Fixed
- Weekly Member Update reconciled against the formal written spec: the AI
  prompt is now a fixed base (in code) + a short admin-authored style/tone
  snippet (`game_configs.weekly_update_prompt`, renamed from
  `weekly_update_prompt_template`) rather than a fully replaceable prompt.
  Stat pool expanded — new players this week, cities (not just countries),
  bingos achieved this week, week-over-week % change — all computed once
  and handed to Claude uncurated. Admin Panel field renamed "AI Prompt
  Template" → "Weekly Update Writing Style" to match.

## v8.2 — 2026-07-11
### Fixed
- Extended the AI-prompt pattern to the "Announce New Game to All Players"
  email (`POST /admin/announce-game`): if the admin leaves "Additional
  Message" blank, Claude writes a short warm note from that week's Prize/
  Game Type/Theme, using a new admin-editable `game_announcement_prompt_template`
  config. Purely additive — typing your own message still works exactly as
  before, and a missing key or failed call just sends with no extra message
  rather than blocking the announcement.

## v8.1 — 2026-07-11
### Fixed
- Weekly Member Update's AI prompt was hardcoded in the edge function,
  against this app's own "nothing is hardwired, everything runs off
  tables" convention. Moved to an admin-editable `weekly_update_prompt_template`
  config (Admin Panel → Weekly Member Update), with the previous hardcoded
  text now just the fallback default when left blank.

## v8.0 — 2026-07-11
### Added
- Weekly Member Update: new `weekly-member-update` edge function, cron'd for
  Wednesdays 15:00 UTC, emails a rotating slice of active members (least-
  recently-contacted first, % controlled by the new `weekly_update_percentage`
  admin config) a short Claude-written note covering this week's community
  stats and the Admin Spotlight Deed. Falls back to alerting admins and
  skipping the send entirely if the Claude call fails or returns unusable
  output, rather than sending a broken email. New `weekly_update_log` table
  and `users.last_sent_at` column. Requires an `ANTHROPIC_API_KEY` secret to
  actually send — safely no-ops (and alerts admins) until one is set.

## v7.1 — 2026-07-11
### Fixed
- Landing page header had no way for an already-logged-in visitor to reach
  their bingo card without logging out first (Wallet/Admin/Log Out were
  there, but no Play link). Added a "Play" button to the header that goes
  straight to `/game`.

## v7.0 — 2026-07-11
### Added
- Prize voucher email now shows the current prize image (`prize_image_url`
  from `game_configs`, the same image shown on the site's prize showcase)
  above the voucher code, when one is set.

## v6.0 — 2026-07-10
### Added
- Kindness Dashboard: `Leaderboard.tsx` rebuilt with the game's real visual
  identity (indigo-950, GR8DAY gradients, glass panels) for both the demo
  and live views, plus two new real sections:
  - "Happening Right Now" — a live ticker of real recent deeds (no player
    identity exposed).
  - "Community Voices" — real card-pickup reflection answers, shown with
    username, gated behind a new Admin Panel approval queue.
### Fixed (same push)
- PostgREST FK-embed bug: `completed_deeds`/`player_prompt_responses` have
  no foreign-key constraints (existing convention), so nested-select embeds
  silently returned empty results instead of erroring. Caught via real local
  Supabase testing (Docker) rather than static type-checking — this had
  already broken v5.0's "feature one deed" option since it shipped. Fixed
  across all four affected endpoints.

## v5.0 — 2026-07-10
### Added
- Share My Impact is now customizable by time frame (week/month/quarter/
  year/all) and can feature one specific deed ("Bought a stranger's coffee
  — 12 times this month") instead of just a total. New `/my-impact-stats`
  endpoint.

## v4.3 — 2026-07-10
### Fixed
- Share My Impact: only attempt the Web Share API on mobile. Desktop Chrome
  was opening the OS Share flyout (an unhelpful built-in "edit" preview)
  instead of just downloading the image.

## v4.2 — 2026-07-10
### Fixed
- Share My Impact: image generation made synchronous (`canvas.toDataURL`
  instead of the async `canvas.toBlob`), so `navigator.share()` fires close
  enough to the tap to avoid browsers silently revoking it.

## v4.1 — 2026-07-10
### Changed
- Toolbar: Leaderboard, My Wins, and Share My Impact consolidated into a
  single "Impact" dropdown menu instead of three separate buttons.

## v4.0 — 2026-07-10
### Added
- Share My Impact: a shareable branded image summarizing a player's real
  Gr8Day Deeds this week. Uses username only, never a real name.

## v3.0 — 2026-07-10
### Added
- Card-pickup reflection prompts: a short, optional self-reflection question
  (drawn from an admin-editable pool) shown at the Regular/Blackout mode
  picker before a new card is generated. Never blocks card generation.

## v2.0 — 2026-07-10
### Added
- Referral bonus: referrer's wallet is credited (admin-editable amount,
  default $5) when a friend they invited verifies their email.

## v1.4 — 2026-07-10
### Fixed
- Player-facing "Spotlight" quick tap badge renamed to "Gr8Day".

## v1.3 — 2026-07-10
### Fixed
- Blackout mode's hidden/passed squares recolored (royal blue background,
  yellow text) instead of near-black/rose.
