# PROGRESS — Lønnssjekk

Checklist. Tick off each step when it is finished and committed.
If a session is interrupted: read this file, then DECISIONS.md, then `git log`, and continue
from the first unticked box. Do not start over.

## Steps

- [ ] 1. Scaffold: Next.js + TypeScript + vitest, .gitignore, .env.example, npm scripts
- [ ] 2. Domain foundations: schemas.ts (zod), money.ts, time.ts, holidays.ts, derive.ts + tests
- [ ] 3. Ruleset file `rules/no_default.json` with sources and plain-language explanations
- [ ] 4. Aggregation (per week / month / payslip period) + tests
- [ ] 5. Rules engine + all 8 rules + unit tests incl. the 6 required edge cases
- [ ] 6. Local JSON storage + API routes (workspace, check, demo, slett alt)
- [ ] 7. Manual entry UI (kontrakt, vakter, lønnsslipper) — works with no AI
- [ ] 8. Result UI: oversikt + tidslinje + flag details with evidence
- [ ] 9. AI extraction: PDF text + masking + Claude structured output + confirm/edit screens
- [ ] 10. Report: PDF export + draft message to employer
- [ ] 11. Demo data: fake worker, 3 months, deliberate errors + end-to-end check
- [ ] 12. Norwegian README + final verification (tests, real app start, hand-checked kroner)

## Log

(newest last)
