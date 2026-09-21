# PROGRESS — Lønnssjekk

Checklist. Tick off each step when it is finished and committed.
If a session is interrupted: read this file, then DECISIONS.md, then `git log`, and continue
from the first unticked box. Do not start over.

## Steps

- [x] 1. Scaffold: Next.js + TypeScript + vitest, .gitignore, .env.example, npm scripts
- [x] 2. Domain foundations: schemas.ts (zod), money.ts, time.ts, holidays.ts, derive.ts + tests
- [x] 3. Ruleset file `rules/no_default.json` with sources and plain-language explanations
- [x] 4. Aggregation (per week / month / payslip period) + tests
- [x] 5. Rules engine + all 8 rules + unit tests incl. the 6 required edge cases
- [ ] 6. Local JSON storage + API routes (workspace, check, demo, slett alt)
- [ ] 7. Manual entry UI (kontrakt, vakter, lønnsslipper) — works with no AI
- [ ] 8. Result UI: oversikt + tidslinje + flag details with evidence
- [ ] 9. AI extraction: PDF text + masking + Claude structured output + confirm/edit screens
- [ ] 10. Report: PDF export + draft message to employer
- [ ] 11. Demo data: fake worker, 3 months, deliberate errors + end-to-end check
- [ ] 12. Norwegian README + final verification (tests, real app start, hand-checked kroner)

## Log

(newest last)

- 2026-09-21 — Step 1 done: Next.js 16 + React 19 + TypeScript strict + vitest, .env.example, .gitignore.
- 2026-09-21 — Step 2 done: schemas.ts (zod, single source of truth), money.ts (øre), time.ts
  (ISO weeks, midnight-crossing segments, arbeidsdøgn), holidays.ts (computed Easter), derive.ts.
  29 unit tests pass. A test caught a real float bug in oreFromKr; the function was fixed.
- 2026-09-21 — Step 3 done: rules/no_default.json with all 8 rules, each with plain-language
  explanation, params and paragraph citations. lovdata.no is egress-blocked, so rules are
  marked `sekundaerkilde` (see DECISIONS.md). 34 tests pass.
- 2026-09-21 — Step 4 done: aggregate.ts (effective shifts, ISO-week/month buckets, payslip
  summaries, supplement-window hours) + fixtures. 47 tests pass.
- 2026-09-21 — Step 5 done: all 8 rules + engine + timeline. 95 tests pass, including the six
  required edge cases in tests/edge-cases.test.ts. Two real bugs found by tests: formatPercent
  mangled values like 20,08 %, and weeks with no shifts were not bucketed at all.
