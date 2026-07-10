# Changelog

Version format: `v{major}.{minor}` — bumped once per push. Major increments
(and minor resets to 0) when a push adds new functionality; minor increments
when a push is fixes only.

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
