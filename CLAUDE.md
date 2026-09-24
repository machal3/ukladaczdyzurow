# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Układacz dyżurów — a browser app for building monthly on-call (dyżur) schedules. Vanilla JS ES modules, no build step, no dependencies. UI text, code comments and commit messages are in Polish.

## Commands

- `npm start` — local static server at http://127.0.0.1:3000 (bound to localhost only)
- `npm test` — runs `scheduler.test.js` with the built-in `node:test` runner
- Single test: `node --test --test-name-pattern="<fragment of test name>"`

Needs Node ≥ 20.11 (`server.js` uses `import.meta.dirname`).

## Architecture

- `scheduler.js` — pure functions, no DOM or localStorage. `generateMonth(y, m, shifts, people, locked, avail, limits)` is the whole scheduling algorithm (greedy, day by day) and returns `{ 'YYYY-MM-DD': { shiftId: personId } }`. Its header comment lists the hard rules (no two shifts per day, no consecutive days, "Nie mogę" is a hard block, per-shift and total `'*'` monthly limits, max one Rezydent per day) and the pick order (availability level, then fewest shifts). It is meant to be swappable for a stronger solver behind the same signature. `generateVariants` runs it ~200× with random tie-breaks (`rand`), scores each month with `scoreMonth` lexicographically (unfilled first, then the user's `order` of `PRIORITIES`, stored as `state.priority`) and returns the best distinct variants; the UI lets the user pick one. All logic changes belong here, with a test in `scheduler.test.js`.
- `app.js` — UI and state. A single `state` object is persisted to localStorage under `dyzury-v1`; every mutation goes through `update(fn)` → save → full re-render. Months are 0-based (`m: 0-11`), weekdays 0 = Monday.
- `server.js` — minimal static file server for local use.
- `cloud.js` + `config.js` — optional cloud mode (Vercel static hosting + Supabase, plain `fetch`, no client library). With `SUPABASE_URL` set in `config.js`, the app asks for a PIN (remembered in localStorage) and loads/saves the whole `state` through the `load_state(p)` / `save_state(p, d)` RPC functions, which check the PIN in the database; the tables themselves are closed to clients (`supabase.sql`). Empty config = local mode, localStorage only. `.vercelignore` keeps `*.docx` (real names) out of deployments.

### State and migrations

- `state.manual` holds hand-made assignments. They are passed to `generateMonth` as `locked`, kept on regeneration and count toward balances/limits. `state.schedule` holds the full result.
- Person role comes from `person.prestige` (index into `ROLES`): 0 = Rezydent, 1–2 = Starszy asystent.
- Availability levels 0–3 (`LEVELS`); a missing entry defaults to 2 ("Mogę") via `availOf`.
- Users already have saved data in localStorage, so new fields are added with `??=` defaults right after `load()`, and one-off data changes use a flag like `state.miejscaV2`. Follow the same pattern; don't bump the storage key.

## Conventions

- Code follows a "ponytail" (minimal-code) style: deliberate shortcuts are marked with `// ponytail:` comments naming the limit and upgrade path.
