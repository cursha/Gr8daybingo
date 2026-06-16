# CLAUDE.md — Havagr8day Bingo

This file governs how Claude Code operates on this project. Every rule here is mandatory.

---

## 1. The People

| Person | Role | How to refer |
|---|---|---|
| **Curt** (John Curtis Skene) | Project owner and founder | Curt or John — both are fine. Never "client" |
| **Michael** (Michael Ojiemeke) | Developer / AI engineer managing this repo | Michael |

Either Curt OR Michael must explicitly confirm before anything goes live or is pushed to GitHub. Confirmation from one is sufficient to proceed.

---

## 2. Non-Negotiable Operating Rules

These rules override everything else. No exceptions.

### 2.1 Never push to live or GitHub without confirmation

- **Do not push to GitHub** until the task is fully complete, working correctly, and either Curt or Michael has confirmed nothing is broken.
- **Do not deploy to the live site** (havagr8day.com) under any circumstance without explicit approval from either Curt or Michael in that conversation.
- "Looks good to me" is not enough. The actual feature must be tested end-to-end first.
- A previous AI session caused serious unintended damage to the live server by pushing without proper confirmation. This rule exists because of that incident.

### 2.2 Never change what you were not asked to change

- Work only on the specific file, function, or feature that was explicitly requested.
- Before editing ANY file, ask: "Was I explicitly asked to change this file?" If no — do not touch it.
- If you notice something else that needs fixing while working, **flag it as a suggestion — do not fix it**. Use this format:

```
💡 SUGGESTION (out of scope — not touching it)
While working on [task], I noticed: [issue]
Impact: [what could go wrong]
Suggested fix: [brief description]
→ Let me know if you want me to address this separately.
```

- This applies to: formatting, variable names, file structure, comments, styles, imports, `.htaccess`, deployment scripts, unrelated components — **everything not named in the task**.
- **A previous session accidentally overwrote `fallengators.ca`** (a completely separate website) by deploying to the wrong cPanel directory. This happened because files outside the task scope were modified. That mistake required a full site restore from the Wayback Machine. This rule exists to prevent that from ever happening again.

### 2.3 Never implement until all information is clear

- If a task is ambiguous, ask before writing a single line of code.
- If you need information from Curt (e.g. a config value, a design decision, a password, a preference), **write the exact message Michael should send to Curt** rather than guessing or making assumptions.
- Format it clearly so Michael can copy-paste it.
- Do not proceed on assumptions. Curt knows the system better than anyone.

### 2.4 Be proactive about risks

- If you see something that could break the site, compromise data, cause a billing issue, or confuse users — say so immediately, even if it was not part of the task.
- Use plain language. Do not bury important warnings in technical jargon.
- Rate these as: 🔴 Urgent (blocks launch), 🟡 Important (should fix soon), 🟢 Optional (nice to have).

### 2.5 Verify before closing a task

Before declaring a task complete, confirm:
- [ ] The specific feature works as described
- [ ] Nothing else broke (smoke test the pages that touch the changed code)
- [ ] No unintended files were modified
- [ ] GitHub diff is clean and contains only what was requested

---

## 3. WAT Framework (Workflows, Agents, Tools)

This project operates under the WAT architecture. This is how work gets done reliably.

### Layer 1 — Workflows (`workflows/`)
Markdown SOPs that define what to do and how. Each workflow covers: objective, required inputs, which tools to use, expected outputs, and edge case handling. Do not overwrite workflows without asking. They are living instructions, not throwaway notes.

### Layer 2 — Agent (You)
Your role is intelligent coordination. Read the relevant workflow, run tools in the correct sequence, handle failures gracefully, and ask clarifying questions when needed. Do not try to do everything yourself directly.

- If you need to pull data from a website, read `workflows/scrape_website.md`, confirm the required inputs, then execute `tools/scrape_single_site.py`.
- If no workflow exists for the task yet, flag this and propose creating one before proceeding.

### Layer 3 — Tools (`tools/`)
Python scripts that do the actual deterministic work: API calls, data transforms, file operations, database queries. Credentials and API keys live in `.env` — never anywhere else.

### Why this matters
When AI handles every step directly, accuracy compounds downward. 90% accuracy across 5 steps = 59% success rate. Offloading execution to deterministic scripts keeps Claude focused on orchestration and decision-making — where it actually excels.

### Self-Improvement Loop
Every failure is a chance to make the system stronger:
1. Identify what broke
2. Fix the tool
3. Verify the fix works
4. Update the workflow with the new approach
5. Move on with a more robust system

---

## 4. Project Overview

**Havagr8day Bingo** is a weekly community-driven bingo game where players complete real-world acts of kindness (called Gr8Day Deeds) to mark squares on a 5×5 bingo card. The game is designed to encourage intentional positive behaviour, not just entertainment.

### Core Vision (Curt's words)
> "I am a big fan of doing good things. This is a bingo game people can play that encourages them to do good things."

The platform is a **configurable kindness-gamification engine**. Nothing is hardwired. Everything runs off tables so the game can evolve without rebuilding from scratch.

### Key Design Principles (from Curt directly)
- All ratios, prices, and configs are in editable fields — nothing hardcoded
- Winner rotation logic is **secret and table-driven** to reduce cheating. If someone is the only winner, they win. If others haven't won yet, the system favours them. This must never be publicly disclosed.
- Centre square is always **REFER A PLAYER** — on every card, every game, no exceptions. No other referral square elsewhere on the card.
- Nothing is mandatory for the player. They can ignore the centre square, skip purchases, play casually — it's their choice.
- Players can buy 1–3 squares (random), but don't have to.
- Deed quantity: some deeds require multiple completions (e.g. "Buy 3 coffees"). Progress shows as `1 · 2 · 3 · 4`. Tapping cycles through. Most deeds default to quantity 1.
- Cell selection flow: **Click → "Sure?" confirmation → confirm or cancel**. If multi-quantity: click cycles through steps, completion triggers confirmation.

---

## 5. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Package manager | pnpm |
| Backend | FastAPI (Python), SQLAlchemy async, Alembic migrations |
| Database | Supabase (PostgreSQL) |
| Auth | JWT-based custom auth |
| Edge Functions | Supabase Edge Functions (TypeScript/Deno) |
| Payments | Stripe (scaffolded, not yet live) |
| Hosting | cPanel (live site: havagr8day.com) |
| Email | To be configured (Resend or SendGrid) |
| Version control | GitHub — `https://github.com/cursha/havagr8daybingo` |

---

## 6. Directory Structure

```
havagr8daybingo/
├── CLAUDE.md                  ← This file
├── README.md                  ← Project mission and philosophy
├── RUN_LOCAL.md               ← Local dev setup instructions
├── todo.md                    ← Active development backlog
├── start_app_v2.sh            ← Script to start local dev environment
├── .mgx/                      ← Framework config (do not edit manually)
├── docs/
│   └── gr8day-bingo-v1-overview.md   ← Full V1 feature spec and roadmap
├── frontend/
│   ├── src/
│   │   ├── pages/             ← Route-level page components
│   │   ├── components/        ← Reusable UI components
│   │   ├── lib/               ← Utilities, API clients, game logic
│   │   ├── contexts/          ← React context providers
│   │   └── hooks/             ← Custom React hooks
│   ├── public/                ← Static assets
│   ├── dist/                  ← Built output (do not edit directly)
│   ├── .env.example           ← Required env vars template
│   └── vite.config.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/            ← Database schema migrations
│   └── functions/             ← Edge functions
│       ├── _shared/           ← Shared utilities (auth, cors, db)
│       ├── game/              ← Game logic endpoints
│       ├── payment/           ← Stripe integration
│       ├── registration/      ← User registration
│       ├── users/             ← User management
│       ├── admin-settings/    ← Admin config
│       └── aihub/             ← AI feature integration point
├── tools/                     ← (WAT) Deterministic Python scripts
└── workflows/                 ← (WAT) Markdown SOPs
```

**What goes where:**
- `.tmp/` — Temporary processing files. Regenerated as needed. Do not commit.
- `tools/` — Python scripts for deterministic execution
- `workflows/` — Markdown SOPs defining what to do and how
- `.env` / `.env.local` — API keys and secrets. **Never commit these. Never store secrets anywhere else.**

---

## 7. Credentials & Access

Credentials are **never stored in this file**. They live in `.env` / `.env.local` files (gitignored).

Access details for this project are held by Michael. If you need a credential value during a task, ask Michael. Do not hardcode any key, password, or token into source files.

**Services this project connects to:**
- Supabase (database + edge functions)
- GitHub (`cursha/havagr8daybingo`)
- cPanel hosting (live site management)
- Stripe (payments — not yet live)
- Google reCAPTCHA v2 (comment forms on fallengators.com — separate site)
- GetResponse (optional mailing list integration)

---

## 8. Hosting Architecture — CRITICAL, READ BEFORE DEPLOYING

The cPanel account `falleng1` on `173.209.32.66` hosts **multiple separate websites**. Deploying to the wrong directory will overwrite a different site. This has happened once and caused real damage.

### Website → Document Root mapping

| Website | Type | Real document root | FTP absolute path |
|---|---|---|---|
| `fallengators.ca` | Primary domain | `/home/falleng1/public_html` | `/public_html` |
| `fallengators.com` | Addon domain | `/home/falleng1/public_html` | `/public_html` |
| **`havagr8day.com`** | **Addon domain** | `/home/falleng1/havagr8day.com` | **`/havagr8day.com`** |

### Deployment rules

1. **Always use FTP** — the cPanel Fileman API (`/execute/Fileman/upload_files` and `save_file_content`) writes to a **virtual staging filesystem** that the web server never reads. It looks like it works (returns "OK") but nothing actually reaches the live site. FTP on port 21 is the only reliable method.

2. **Use `tools/deploy_to_cpanel.py`** — this script uses FTP and targets `/havagr8day.com` correctly. Run it after every production build.

3. **Never deploy to `/public_html`** — that is `fallengators.ca`, a completely separate memorial website (Fallen Gators Registry). Deploying havagr8day content there overwrites it.

4. **Use absolute FTP paths** — FTP home is `/home/falleng1/`. Always use `/havagr8day.com` (with leading slash), not the relative `havagr8day.com`.

5. **LiteSpeed file cache** — LiteSpeed caches files aggressively. New files (never served before) are available immediately. Overwriting an existing file that LiteSpeed has cached may show stale content until LiteSpeed restarts. If the live site looks stale after deployment, ask the hosting provider to restart LiteSpeed.

### Deployment sequence

```
1. pnpm build                         (in frontend/)
2. Supabase edge functions deploy      (if game/index.ts changed)
3. supabase db push                    (if new migrations)
4. git commit + push to GitHub         (after Curt + Michael confirm)
5. python tools/deploy_to_cpanel.py    (FTP upload to havagr8day.com)
```

---

## 9. GitHub Workflow

1. Work is done locally and verified working
2. Smoke test all affected features
3. Confirm with Michael and Curt that the task is complete and nothing broke
4. Only then: stage, commit, and push to GitHub
5. Commit messages must be clear and specific (e.g. `fix: enforce centre square as REFER A PLAYER only`)
6. Never force-push to main
7. If a feature is incomplete, do not push — partial pushes cause confusion

---

## 9. Current Development Priorities

### P0 — Must have before V1 launch
1. **Stripe payment integration** for wallet top-ups
2. **Production email delivery** (Resend/SendGrid) — needed for password reset, PDF card email, win notifications
3. **Prize claim flow** — modal for winner to submit contact info + admin prize queue
4. **Password reset / forgot password** (requires email service)
5. **Abuse guards on mark-cell** — rate limiting, optional photo/note, admin void capability
6. **Terms of Service + Privacy Policy** pages
7. **Production database migration** — verify Alembic runs clean on prod DB

### P1 — Strongly recommended for V1
- Referral validation (referred user must register before referral counts)
- Rate limiting and anti-bot middleware
- Weekly auto-reset cron job
- Prize history page
- Accessibility audit
- Basic analytics

### P2 — Post-V1
- Social share on bingo win
- Player profile pages
- Photo proof of completed deeds
- Teams/groups
- Charity partner integration
- PWA / mobile app shell

---

## 10. Comprehensive Game Review Framework

When asked to review this project, act as a **senior game developer, UX designer, product strategist, and code reviewer** and cover all of the following areas in full detail.

### 10.1 Code Quality & Architecture
- Identify bugs, logic flaws, performance issues, scalability concerns, and security risks
- Suggest cleaner architecture patterns and refactoring opportunities
- Point out duplicate logic, poor naming, unnecessary complexity, and technical debt
- Recommend best practices for maintainability and future expansion
- Explain WHY each improvement matters
- Reference specific files/functions/components and suggest actual code rewrites where useful

### 10.2 Gameplay & Engagement
- Evaluate whether the gameplay loop is fun, rewarding, motivating, and healthy
- Suggest ways to increase player retention and replayability
- Recommend mechanics that reinforce positive behaviour and kindness
- Suggest progression systems, streaks, achievements, challenges, seasonal events
- Identify anything that could become repetitive or boring

### 10.3 Psychology & Motivation
- Analyze the emotional experience of the game
- Suggest ways to make players feel encouraged, inspired, socially connected, and proud
- Recommend intrinsic motivation systems — not manipulative mechanics
- Suggest behavioural psychology ideas that promote real-world kindness without being preachy

### 10.4 User Experience (UX/UI)
- Review flow, menus, onboarding, clarity, and accessibility
- Identify improvements for: simplicity, readability, mobile responsiveness, animations, visual feedback, reward presentation
- Point out confusing interactions or friction points

### 10.5 Game Design Improvements
- Suggest new features, mechanics, and innovative ideas
- Suggest social features that encourage positivity (not toxicity)
- Recommend cooperative/community systems
- Propose "wow factor" ideas that make the game stand out emotionally

### 10.6 Monetization (Ethical Only)
- Suggest ethical monetization that does not undermine the positive mission
- No pay-to-win mechanics
- Optional cosmetics, charity tie-ins, sponsorship, community-support models only

### 10.7 Technical Suggestions
- Recommend frameworks, libraries, APIs, backend improvements, database optimizations
- Suggest analytics, notifications, moderation systems, cloud architecture improvements
- Suggest testing strategies and deployment improvements
- Identify missing edge case handling

### 10.8 Safety & Abuse Prevention
- Identify ways users might exploit, fake, spam, or abuse the deed system
- Suggest moderation, verification, anti-cheat, and trust systems
- Recommend safeguards against toxic behaviour

### 10.9 Detailed Improvement Roadmap
- Quick wins (easy, high-impact)
- Medium-term improvements
- Long-term visionary ideas
- Priority ranking of issues and features
- What to build first vs later

### 10.10 Brutally Honest Feedback
Do not only praise the project. State clearly:
- What feels weak
- What feels confusing
- What could fail
- What users may dislike
- What features are unnecessary
- What is genuinely exciting and promising

**End every full review with:**
- Overall score out of 10
- Biggest strengths
- Biggest weaknesses
- Most important next steps

---

## 11. Communication Protocol

### When you need information from Curt
If a task requires a decision or data that only Curt can provide, write a message in this format:

```
--- MESSAGE FOR CURT ---
Hi Curt,

[One sentence context about what we're working on]

I need to know: [specific question]

Options are:
A. [Option A — brief description]
B. [Option B — brief description]

This affects: [what will be built differently depending on the answer]
--- END ---
```

Do not proceed until the answer comes back.

### When flagging an issue not in scope
```
⚠️ OUT OF SCOPE NOTICE
While working on [task], I noticed: [issue]
Severity: 🔴 / 🟡 / 🟢
Impact: [what could go wrong if ignored]
Suggested fix: [brief description]
Action needed: Let me know if you want me to address this separately.
```

---

## 12. Deeds Reference

The game is built around performing real acts of kindness. The full deeds list lives in the database (`good_deeds` table). Categories include:

- Simple daily acts (holding doors, smiling, complimenting effort)
- Community acts (volunteering, donating, helping neighbours)
- Relationship acts (checking in on friends, writing thank-you notes)
- Random generosity (paying for someone's coffee, leaving coins, giving books)
- Advocacy acts (speaking up for someone being ignored, encouraging the discouraged)

Some deeds have a **quantity counter** (e.g. "Buy 3 coffees for strangers"). These show progress as `1 · 2 · 3` and require all steps completed before the square is marked.

The centre square is always **REFER A PLAYER** — no exceptions, on every card.

---

*Last updated: May 2026 — Maintained by Michael Ojiemeke for Curt Skene*
