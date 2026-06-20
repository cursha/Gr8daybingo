# Automated tests

This is the home for automated tests that **battle-test features before they go
live**. Every non-trivial bug fix or feature should land here with a test that
pins the behaviour we care about, so it can never silently regress.

## Running

From the `frontend/` folder:

```bash
pnpm test          # run all tests once
pnpm test:watch    # re-run on change while developing
```

(If `pnpm test` ever fails before running over a pnpm deps gate, run the binary
directly: `node ./node_modules/vitest/vitest.mjs run`.)

## Stack

- **Vitest 2** — chosen to match this project's Vite 5. Do **not** upgrade to
  Vitest 4: it requires Vite 6 and will fail to start here.
- Pure-logic tests run in the `node` environment (see `../vitest.config.ts`).
  When we add component tests later, switch those files to a `jsdom` environment.

## Conventions

- File names: `*.test.ts` / `*.test.tsx`, mirroring the source path under `tests/`
  (e.g. `src/lib/auth.ts` is tested by `tests/lib/auth.getCurrentUser.test.ts`).
- Mock the network/IO boundary (e.g. `@/lib/apiClient`) and assert on behaviour,
  not implementation detail.
- Each test file should start with a comment saying which bug/feature it guards
  and why, so the intent survives even if the code moves.

## What's covered so far

- `lib/auth.getCurrentUser.test.ts` — Bug #11 ("loses credentials during play").
  Proves a single transient 401 keeps the player logged in, a persistent 401
  logs them out exactly once, and 500s / network drops never wipe the session.
