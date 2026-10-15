# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Układacz dyżurów — a browser app for building monthly on-call (dyżur) schedules. Vanilla JS ES modules, no build step, no dependencies. UI text, code comments and commit messages are in Polish.

## Commands

- `npm start` — local static server at http://127.0.0.1:3000 (bound to localhost only)
- `npm test` — runs `scheduler.test.js` with the built-in `node:test` runner
- Single test: `node --test --test-name-pattern="<fragment of test name>"`

Needs Node ≥ 20.11 (`server.js` uses `import.meta.dirname`).

## Architecture

- `scheduler.js` — pure functions, no DOM or localStorage. `generateMonth(y, m, shifts, people, locked, avail, limits)` is the whole scheduling algorithm (greedy, day by day) and returns `{ 'YYYY-MM-DD': { shiftId: personId } }`. Its header comment lists the hard rules (no two shifts per day, no consecutive days, "Nie mogę" is a hard block, per-shift and total `'*'` monthly limits, max one Rezydent and max `MAX_BOSS` = 2 Kierownik per day, sum of `prestige` per day ≥ `MIN_PRESTIGE` = 3 on days with enough slots) and the pick order (availability level, then fewest shifts). It is meant to be swappable for a stronger solver behind the same signature. `generateVariants` runs it ~200× with random tie-breaks (`rand`), every other try with `mrv` (hardest days first instead of day 1…D; occupancy is tracked per day, so adjacency rules work in any order), scores each month with `scoreMonth` lexicographically (unfilled first, then the user's `order` of `PRIORITIES`, stored as `state.priority`) and then improves the top 3 structurally different starts (hill climbing with moves pre-checked by `model.can` + tallies, so `scoreMonth` runs only for hard-valid moves; soft annealing with 3-person cycles; group repair via `searchMonth`) and returns exact ties, or near-ties when there are none; the UI lets the user pick one. `anneal` computes cost deltas incrementally (only the terms a move touches). When neither greedy nor variants satisfy every minimum, `solveOrExplain` first runs `conflicts` (exact per-person check + sums of minima, with a minimal set of conflicting settings in Polish), then `anneal` (simulated annealing over the whole month), then tries dropping one person's minima at a time to name the likely blockers. All logic changes belong here, with a test in `scheduler.test.js`.
- `app.js` — UI and state. A single `state` object is persisted to localStorage under `dyzury-v1`; every mutation goes through `update(fn)` → save → full re-render. Months are 0-based (`m: 0-11`), weekdays 0 = Monday.
- `server.js` — minimal static file server for local use.
- `cloud.js` + `config.js` — optional cloud mode (Vercel static hosting + Supabase, plain `fetch`, no client library). With `SUPABASE_URL` set in `config.js`, the app asks for a PIN (remembered in localStorage) and loads/saves the whole `state` through the `load_state(p)` / `save_state(p, d)` RPC functions, which check the PIN in the database; the tables themselves are closed to clients (`supabase.sql`). Empty config = local mode, localStorage only. `.vercelignore` keeps `*.docx` (real names) out of deployments.

### State and migrations

- Month boundary: `app.js` adds `state.schedule` entries for the 2 days before and after the month to `locked`; the scheduler uses them only to block adjacent days (day after day, rest after weekend OITN, sandwiches), never in tallies/limits/minima/score. `dateKey` normalizes out-of-range days (`dateKey(y, m, 0)` = last day of previous month).
- `state.manual` holds hand-made assignments. They are passed to `generateMonth` as `locked`, kept on regeneration and count toward balances/limits. `state.schedule` holds the full result.
- Person role comes from `person.prestige` (points: 0 = Rezydent, 1–2 = Starszy asystent) plus `person.boss` (Kierownik 1/2, prestige 1/2); `roleOf(p)` gives the index into `ROLES`.
- Availability levels 0–3 (`LEVELS`); a missing entry defaults to 2 ("Mogę") via `availOf`.
- Users already have saved data in localStorage, so new fields are added with `??=` defaults right after `load()`, and one-off data changes use a flag like `state.miejscaV2`. Follow the same pattern; don't bump the storage key.

## Conventions

- Code follows a "ponytail" (minimal-code) style: deliberate shortcuts are marked with `// ponytail:` comments naming the limit and upgrade path.
