# Gr8Day Bingo — Complete Project Overview (V1)

A weekly, community-driven bingo game where players complete real-world **Gr8Day Deeds** (acts of kindness) to mark squares on a 5×5 card, earn rewards, and win prizes.

---

## 🎮 Game Concept

- **Goal:** Complete good deeds in real life to mark squares on your personal weekly bingo card. Be the first to hit the required winning pattern and claim the week's prize.
- **Cadence:** A new game starts every Monday. Each player gets their own deterministic card for the week (same player + same week = same card).
- **Card:** 5×5 grid (25 cells). Center cell (index 12) is always a **REFER A PLAYER**.
- **Deeds:** Each non-free cell shows a "Gr8Day Deed" (e.g. *"Donate to a food bank"*, *"Write a kind note to a coworker"*). Players tap a cell to mark a deed complete.
- **Winning:** The win pattern is set by the admin (One Line, Two Lines, Four Corners, X Pattern, Around the Edges, or Fill the Card).
- **Monetization & Engagement Hooks:**
  - **Purchasable Squares ($0.50 / $1 / $2):** A few random squares per card can be unlocked by spending wallet funds.
  - **Referral Squares:** Some squares are "Refer a Player" — inviting one friend unlocks ALL referral squares on the card.
  - **Secret Square:** One hidden square per card awards a surprise wallet bonus (+$1, $2, or $5) the first time it's marked.
  - **Signup Bonus:** New players receive a wallet top-up after completing their profile.  The amount is set by a user defined field in the setup table. 

---

## ✅ Features Built (Working Today)

### Authentication & User Management
- Custom email + password registration and login (`/login`, `/register`) with JWT-based sessions.
- Logout flow clearing both local state and server session.
- Protected routes — unauthenticated users are redirected to `/login`.
- Admin role gating via `ProtectedAdminRoute` and `get_admin_user` dependency.
- New-user profile completion modal (first name, last name, email) enforced on first visit to the game.

### Bingo Game Core
- Deterministic 5×5 card generation per player per week (same seed ⇒ same card).
- FREE SPACE auto-completed in center of every card.
- Six win conditions: One Line, Two Lines, Four Corners, X Pattern, Around the Edges, Fill the Card.
- Automatic bingo detection on every mark / purchase / referral event.
- Celebration overlay + "Start New Game" flow when a player wins.
- Per-deed short description + longer hover/popover description.
- "Reset card" action to start a fresh game within the same week.

### Wallet & Transactions
- Every player gets an in-app wallet, auto-created on first access.
- Add funds endpoint and a dedicated Wallet page.
- Full transaction history (`deposit`, `purchase`, `secret_reward`, `signup_bonus`).
- Purchasable squares automatically debit the wallet and record a transaction.

### Special Squares
- **Purchasable squares:** 1–3 per card, priced via admin-controlled distribution ($0.50 / $1 / $2).
- **Referral squares:** 0–2 per card. Submitting one valid referral unlocks ALL of them at once.
- **Secret Square:** Exactly one per card, reward ($1 / $2 / $5) drawn from admin-controlled distribution. Credits wallet + records a transaction on reveal.

### Deed Suggestion & Moderation
- Logged-in players can suggest new Gr8Day Deeds from the game board.
- Suggestions land in a `pending_deeds` queue with status (pending / approved / rejected).
- Admin can view the queue, approve (pushing the deed into the active pool), reject, or delete suggestions.
- Players can see the status of their own submitted suggestions.

### Leaderboard
- Per-game (per-week) leaderboard aggregating total deeds completed, active players, and bingo winners.
- Current game highlighted; historical games numbered chronologically.

### Admin Panel
- Password-gated admin verification (in addition to admin role).
- Game config editor (win condition, price distribution, secret-reward distribution, prize image/title, admin password).
- Full CRUD over Gr8Day Deeds (add / edit / activate / deactivate / delete, including long descriptions).
- Pending deed moderation UI.

### Prize Display
- Admin-configurable prize image + title.
- Prize banner shown on the game board and homepage.

### Referrals
- "Invite a Friend" form on the game board.
- Duplicate-email and self-referral guards.
- Optional GetResponse integration (adds referred email to mailing list when `GETRESPONSE_API_KEY` is set).

### Printable Card
- Client-side **Print PDF** button on the game board.
- Generates an 8.5" × 11" US Letter grayscale PDF with GR-8-D-A-Y headers, 5×5 grid, completed/purchased/referral markings, legend, and player name / date.

### Frontend UX
- React + shadcn/ui + Tailwind design with purple/indigo gradient theme.
- Homepage, Game Board, Wallet, Leaderboard, Admin Panel, Login, Register, Auth Callback.
- Mobile-responsive header and game grid.
- Toast notifications (sonner) for every user action.
- Celebration overlay with confetti on bingo.

### Backend (FastAPI)
- Auto-discovered routers under `/api/v1/*`.
- SQLAlchemy async models for: users, good_deeds, pending_deeds, game_configs, player_cards, player_wallets, wallet_transactions, referrals.
- Alembic migrations.
- Config via environment variables with strict allowlists for SQL identifiers.

### Deployment
- Frontend + backend split, configurable API base URL.
- Lambda handler ready for AWS Lambda deployment.
- Local development docs (`RUN_LOCAL.md`).

---

## 🚧 Remaining Work to Reach Playable V1

### P0 — Must-have for V1 launch

| # | Item | Why it blocks V1 |
| --- | --- | --- |
| 1 | **Real payment integration for wallet top-ups** | Today "Add Funds" increments the balance directly. To actually monetize, wire `POST /api/v1/payment/create_payment_session` (Stripe) into the Wallet page and flip the wallet credit to happen on `verify_payment` success. |
| 2 | **Production email delivery** | "Email me my card as PDF" + password reset + signup confirmation all need a real email provider (Resend/SendGrid/SMTP). A `RESEND_API_KEY` (or equivalent) must be configured. |
| 3 | **Prize claim flow** | When a player wins, there is no structured way to collect their shipping/contact info and hand the prize off. Need a "Claim your prize" modal + admin-side prize claim queue. |
| 4 | **Password reset / forgot password** | Required for any real user base. Needs email service (see #2). |
| 5 | **Abuse & integrity guards on mark-cell** | Today any cell can be tapped to mark a deed as done. Need at minimum: rate limit per user, optional photo/note attachment, and admin ability to void a completed cell. |
| 6 | **Terms of Service + Privacy Policy pages** | Legally required before taking real money. |
| 7 | **Production database migration path** | Confirm Alembic migrations run cleanly from empty → current schema on the production DB; add a one-command deploy script. |

### P1 — Strongly recommended for V1

| # | Item | Notes |
| --- | --- | --- |
| 8 | **Referral validation** | Currently self-declared — auto-validated when the email is submitted. Tighten to: referred user must register + log in before the referral counts. |
| 9 | **Rate limiting & basic anti-bot** | Add middleware to cap `/mark-cell`, `/submit-referral`, `/register`, `/login` per IP and per user. |
| 10 | **Email-me-my-card-as-PDF feature** | Server-side reportlab PDF + Resend send. Blocked on #2 (email service key). |
| 11 | **Push/email "You won!" notification** | Trigger on bingo detection. Blocked on #2. |
| 12 | **Weekly auto-reset cron** | Move from "card exists per week_year" logic to an explicit scheduled task that rolls prize + win condition every Monday and closes the prior game. |
| 13 | **Prize history page** | Public page showing past winners and past prizes — helps credibility. |
| 14 | **Accessibility pass** | Keyboard nav on the grid, aria-labels on icon-only buttons, color contrast audit. |
| 15 | **Analytics** | Minimal event tracking (signup, deed-completed, purchase, bingo, referral) so the admin can see engagement. |

### P2 — Nice-to-have, post-V1

| # | Item | Notes |
| --- | --- | --- |
| 16 | Social share card of bingo win | Auto-generated OG image for X / LinkedIn / Instagram. |
| 17 | Player profile page | Avatar, lifetime deeds, games won, referral count. |
| 18 | Photo proof of completed deeds | Image upload to object storage + optional "verified" badge. |
| 19 | Teams / groups | Play with friends, shared leaderboard. |
| 20 | Charity partner integration | A % of wallet spend auto-routed to a selected charity each week. |
| 21 | Mobile app shell (PWA or native) | Installable experience with push notifications. |
| 22 | Multiple concurrent games (daily / monthly) | Today the system is weekly-only. |

---

## 🎯 Minimum Steps to Ship V1

1. **Wire Stripe end-to-end** for wallet top-ups (create_payment_session + verify_payment already scaffolded in the backend skill docs).
2. **Add Resend (or equivalent) email service**, then ship: password reset, email-card-as-PDF, and "you won" notifications.
3. **Build the prize claim flow** (player modal + admin queue).
4. **Add Terms of Service + Privacy Policy** pages and link them in the footer and registration form.
5. **Harden `/mark-cell`** with rate limiting and admin void capability.
6. **Smoke-test end-to-end** on production: register → complete profile → play → purchase → refer → win → claim prize.
7. **Ship.**

With items 1–6 complete, Gr8Day Bingo is a fully playable, monetizable V1.

---

*Document generated for: Gr8Day Bingo V1 Launch Planning*
