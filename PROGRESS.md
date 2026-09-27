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
- [x] 6. Local JSON storage + API routes (workspace, check, demo, slett alt)
- [x] 7. Manual entry UI (kontrakt, vakter, lønnsslipper) — works with no AI
- [x] 8. Result UI: oversikt + tidslinje + flag details with evidence
- [x] 9. AI extraction: PDF text + masking + Claude structured output + confirm/edit screens
- [x] 10. Report: PDF export + draft message to employer
- [x] 11. Demo data: fake worker, 3 months, deliberate errors + end-to-end check (moved earlier: the UI needed something to show)
- [x] 12. Norwegian README + final verification (tests, real app start, hand-checked kroner)

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
- 2026-09-21 — Step 6 + 11 done: local JSON store (atomic writes, "slett alt"), API routes for
  workspace/check/demo, and the demo worker with three months of data and eight planted errors.
  115 tests pass. Two more real bugs found: the arbeidsdøgn grouping chained a Friday evening
  and Saturday day shift into one 24-hour window and invented overtime (now delimited by the
  daily rest), and a monthly flag coloured every week of that month red in the timeline.
- 2026-09-21 — Steps 7, 8 and 10 done: Norwegian UI (start, kontrakt, vakter, lønnsslipper, sjekk,
  rapport), paste importer for shift-system exports, PDF report and editable draft message.
  138 tests pass; `npm run build` succeeds. Importer bugs found by tests: the comma separator
  split Norwegian decimals ("0,5 t"), and 32.13.2026 passed as a date.
- 2026-09-21 — Step 9 done: PII masking at the API boundary, PDF text extraction, prompts that
  forbid guessing and judging, validate-and-re-ask, the /les confirm-and-edit screen, and the
  settings page with rule toggles and "Slett alt". 155 tests pass; build is clean.
- 2026-09-21 — Step 12 done: Norwegian README (how to run, what is checked, what is NOT checked,
  the privacy model). Verified for real: 156 tests pass, clean build, server started, every page
  loaded in a browser with no console errors, demo produces the expected flags and amounts, PDF
  and draft message generated. Flag titles no longer repeat the period shown beside them.

## Ideas not built (deliberately out of scope)

- Rasterising a scanned PDF so it can be read as an image (the user is asked for a screenshot).
- "Higher of" logic for overlapping supplements (weekend + public holiday on the same hours).
- Gjennomsnittsberegning of working time (AML § 10-5) beyond storing the flag and letting the
  user override the daily/weekly limits.
- Attributing paid hours to individual weeks — deliberately refused, see DECISIONS.md.

## Follow-up round (requested after the first push)

- [x] 13. Work schedule can be uploaded as a file, parsed locally without an API key, with a
      confirm-before-save preview
- [x] 14. Every rule takes its thresholds from the contract first, with the law as fallback and
      as a floor; each flag shows where its threshold came from
- [x] 15. A contract term weaker than the law is raised to the law and reported as its own finding
- [x] 16. Paid breaks count as working time; extraction reads the agreed terms

- 2026-09-21 — Follow-up done: thresholds.ts (contract-first provenance for all eight rules),
  agreed-terms UI on the contract page, /api/import-schedule for local schedule uploads,
  extraction of agreed terms, paid-break handling. 192 tests pass, clean build, flow driven in a
  real browser (contract with a 50 % tariff supplement + paid break, then a CSV upload).
  Two bugs found by running it: the agreed-terms validation compared form keys with contract
  keys and rejected every blank field, and the feriepenger rule's early return discarded a
  finding it had already collected.

- [x] 17. Every law the data can support: § 10-10 Sunday work, § 10-11 night work, § 14-15 wage
      deductions, § 14-9 temporary employment, § 14-6/§ 14-5/§ 10-7/§ 10-3 contract contents and
      records, ferieloven § 5/§ 7 holiday, allmenngjøringsloven minimum wage, § 10-12 exemption,
      § 10-6 avspasering — 16 rules in total
- [x] 18. README lists what is NOT checked, with a reason per item

- 2026-09-24 — Second follow-up done: eight new rules and two extended ones, all verified against
  secondary sources first (§ 10-12 marked ikke_verifisert, the one search could not confirm).
  225 tests pass. The demo now shows 22 findings with the money totals unchanged.

- [x] 19. Audit: every flow driven against a running app (34 checks), gaps found and fixed
- [x] 20. `npm run smoke` — an end-to-end check a contributor can run

- 2026-09-24 — Audit round: 34 interactive checks, all passing after fixes. Four gaps found and
  fixed: documents were never registered outside the demo, form labels were not associated with
  their controls, the derived hourly rate was shown without its derivation, and five exported
  helpers plus one dead branch were unused. 230 unit tests and 26 smoke checks pass.

- [x] 21. Project skill for running the app, verified by extracting and executing its own driver

- 2026-09-24 — Added .claude/skills/run-app/SKILL.md. Executing it found one defect in the skill
  itself (the demo button only exists on an empty workspace), now fixed and re-verified from
  both states.
