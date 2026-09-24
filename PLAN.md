# PLAN — Lønnssjekk

A local-first tool that reads a worker's **arbeidskontrakt**, **vaktplan/timer** and
**lønnsslipper**, lines them up week by week, and flags every place where they do not
match — with evidence, a calculation and a source for each flag.

Target user: hourly / part-time workers in Norway. UI language: **Norwegian (bokmål)**.

---

## 1. Core design principle

| Concern | Who does it |
| --- | --- |
| Turning documents (PDF/photo/screenshot) into structured data | Claude API (extraction only) |
| Deciding what is wrong, summing hours, computing kroner | Plain deterministic TypeScript + unit tests |
| Accepting the extracted data | The human, in an editable table |

The AI never decides whether something is a violation. It only proposes field values.
Everything that produces a flag is pure, synchronous, testable code with no network access.

Pipeline:

```
document ──▶ pdf text (or vision fallback) ──▶ mask PII ──▶ Claude ──▶ zod validate
                                                                         │
                                                              ┌──────────┘
                                                              ▼
                                            user confirms/corrects in a table
                                                              │
                                                              ▼
                                   deterministic rules engine ──▶ Flag[] ──▶ UI / PDF / draft message
```

---

## 2. Architecture

```
src/
  domain/          pure, dependency-free business logic (no I/O, no fetch)
    schemas.ts     zod schemas + inferred TS types (single source of truth)
    money.ts       integer øre arithmetic + Norwegian formatting
    time.ts        clock/date helpers: ISO weeks, midnight crossing, day segments, døgn
    holidays.ts    Norwegian public holidays (computed Easter, no hardcoded tables)
    derive.ts      derived contract values (contracted hours, effective hourly rate)
    aggregate.ts   per-week / per-month / per-payslip-period roll-ups
    rules/         one file per rule, each a pure (input, ruleSet) => Flag[]
    engine.ts      runs enabled rules, sorts and totals the flags
    timeline.ts    week-by-week contract vs schedule vs payslip view model
  privacy/mask.ts  personnummer / kontonummer / IBAN masking (used before any API call)
  extraction/      Claude API client, prompts, PDF text extraction, vision fallback
  storage/         local JSON workspace store (.data/, gitignored)
  report/          PDF report (pdfkit) + draft message to employer
  demo/            fake worker, 3 months of fake data with deliberate errors
  app/             Next.js App Router: pages (Norwegian UI) + /api routes
rules/
  no_default.json  the configurable default ruleset (thresholds + sources + explanations)
tests/             vitest unit tests, incl. the required edge cases
```

Dependency rule: `domain/` may not import from `app/`, `extraction/` or `storage/`.
Rules are pure so that every flag in the UI is reproducible in a unit test.

---

## 3. Data model (schemas)

All money is **integer øre** (`amountOre`), never floats. All hours are decimal numbers
rounded to 2 dp only at the edges. All dates are `YYYY-MM-DD`; all clock times `HH:MM`.

### Contract

```ts
Contract {
  id: string
  employer: string
  employeeName: string                  // fake data only
  startDate: DateStr
  endDate: DateStr | null
  stillingsprosent: number              // 0–100
  fullTimeHoursPerWeek: number          // configurable, default 37.5
  contractedHoursPerWeek: number | null // explicit override; else derived
  wage: { kind: 'hourly' | 'monthly', amountOre: number }
  tariffavtale: string | null
  averagingAgreement: boolean           // gjennomsnittsberegning, AML § 10-5
  normalDailyLimitHours: number | null  // agreed override of AML § 10-4 (9 h)
  normalWeeklyLimitHours: number | null // agreed override of AML § 10-4 (40 h)
  feriepengerRatePercent: number        // 10.2 default, 12.0 for 5 weeks
  supplements: Supplement[]             // from contract/tariff ONLY — never hardcoded
  documentRef: DocumentRef | null
}

Supplement {
  id: string
  label: string                         // "Kveldstillegg etter kl. 18"
  kind: 'kveld' | 'natt' | 'helg' | 'helligdag'
  fromTime: TimeStr | null              // window start (null = all day)
  toTime: TimeStr | null                // may wrap past midnight
  weekdays: number[] | null             // 1=Mon … 7=Sun (null = all days)
  rate: { kind: 'per_hour_ore', value: number } | { kind: 'percent', value: number }
  source: string                        // "Arbeidskontrakt pkt. 5" / "Tariffavtale § 4"
}
```

### Shift

```ts
Shift {
  id: string
  date: DateStr                         // the date work STARTS
  start: TimeStr
  end: TimeStr                          // if <= start, the shift crosses midnight
  breakMinutes: number
  kind: 'planlagt' | 'jobbet'           // planned vs actually worked
  source: 'manuell' | 'import' | 'ai'
  note: string | null
  documentRef: DocumentRef | null
}
```

### Payslip

```ts
Payslip {
  id: string
  periodStart: DateStr
  periodEnd: DateStr
  lines: PayslipLine[]
  grossOre: number | null
  feriepengerBasisOre: number | null
  feriepengerAccruedOre: number | null
  documentRef: DocumentRef | null
}

PayslipLine {
  id: string
  category: 'ordinaer' | 'merarbeid' | 'overtid_40' | 'overtid_100' | 'helligdag_arbeid'
          | 'kveldstillegg' | 'nattillegg' | 'helgetillegg' | 'helligdagstillegg'
          | 'fastlonn' | 'feriepenger' | 'annet'
  label: string                         // the raw text from the payslip
  hours: number | null
  rateOre: number | null
  amountOre: number
}
```

Category taxonomy matters for correctness: only **work-hour** categories
(`ordinaer`, `merarbeid`, `overtid_40`, `overtid_100`, `helligdag_arbeid`) count towards
"hours paid". Supplement categories are extra money on hours already counted, so adding
them would double count.

### RuleSet (`rules/no_default.json`)

```ts
RuleSet {
  id: string, version: string, name: string, jurisdiction: 'NO'
  fullTimeHoursPerWeek: number
  rules: Rule[]
}

Rule {
  id: RuleId
  enabled: boolean
  title: string                         // Norwegian, plain language
  explanation: string                   // what it checks and why, in plain Norwegian
  severity: Severity                    // default severity for this rule's flags
  params: Record<string, number|string|boolean>  // thresholds, user-overridable
  sources: RuleSource[]                 // { law, paragraph, url, note }
  verified: 'lovdata' | 'ikke_verifisert'
}
```

The user can override any `params` value from their own contract or tariffavtale;
overrides are stored in the workspace, never written back into the default file.

### Flag

```ts
Flag {
  id: string
  ruleId: RuleId
  severity: 'sannsynlig_feil' | 'bor_sjekkes' | 'til_info'
  title: string
  periodLabel: string                   // "Uke 34 2026" / "August 2026"
  periodStart: DateStr, periodEnd: DateStr
  message: string                       // plain Norwegian, no jargon
  evidence: { label: string, value: string }[]
  calculation: { expression: string, resultOre: number | null } | null
  amountOre: number | null              // estimated money owed, when computable
  sources: RuleSource[]
  documentRefs: DocumentRef[]           // back-links to source doc + page
}

DocumentRef { docId: string, docName: string, page: number | null, kind: 'kontrakt'|'vaktplan'|'lonnsslipp' }
```

### Workspace (the whole local state)

```ts
Workspace {
  version: 1
  contract: Contract | null
  shifts: Shift[]
  payslips: Payslip[]
  documents: StoredDocument[]           // name/kind/page count only, never file bytes
  ruleOverrides: Record<RuleId, { enabled?: boolean, params?: Record<string, unknown> }>
  settings: { fullTimeHoursPerWeek: number }
  createdAt: string, updatedAt: string
}
```

---

## 4. Rules to implement

| id | Checks | Source | Money? |
| --- | --- | --- | --- |
| `hours_vs_stillingsprosent` | contracted hours (stillingsprosent × full-time) vs scheduled and paid, per week / month / rolling 12 mo | contract | yes (shortfall × rate) |
| `overtime` | work beyond AML § 10-4 limits (9 h/døgn, 40 h/week) must get ≥ 40 % extra; **merarbeid** kept separate and explained | AML § 10-4, § 10-6 | yes (the 40 % supplement only) |
| `rest_periods` | < 11 h between shifts, < 35 h continuous weekly rest | AML § 10-8 | no |
| `breaks` | long shift with no/short registered break | AML § 10-9 | no |
| `actual_hours_vs_contract` | part-timer regularly working above contract → may have right to a bigger position | AML § 14-4 a | no |
| `scheduled_vs_paid` | every scheduled/worked hour appears on a payslip, right category, right rate | contract | yes (unpaid hours × rate) |
| `supplements` | kveld/natt/helg/helligdag supplements per the user's own contract windows | contract/tariff | yes (missing supplement) |
| `feriepenger` | basis and 10.2 % / 12 % accrual look right | ferieloven § 10 | flagged as "sjekk dette" |

To avoid double counting: `scheduled_vs_paid` claims the **base** pay for unpaid hours,
`overtime` claims **only the 40 % supplement**, `supplements` claims only the tillegg.

Severities: `Sannsynlig feil`, `Bør sjekkes`, `Til info`.

---

## 5. Outputs

1. **Oversikt** — total estimated kroner owed, hours short vs stillingsprosent, flag counts per severity.
2. **Tidslinje** — week by week: contract / schedule / payslip side by side, mismatches highlighted.
3. **Rapport (PDF)** — sober and factual: every flag with evidence, calculation and source. Good enough to hand to a manager, tillitsvalgt or fagforening.
4. **Utkast til melding** — polite factual Norwegian message to the employer; the user edits it, the tool never sends it.
5. Disclaimer on every report: *"Dette er ikke juridisk rådgivning. Kontakt fagforeningen din eller Arbeidstilsynet for hjelp."*

---

## 6. Privacy model

- Runs locally; data is stored only in `.data/` on the user's machine. No accounts, no cloud DB.
- `privacy/mask.ts` strips personnummer / D-nummer, kontonummer and IBAN **before** any text
  or image leaves the machine for the Claude API. Enforced at the single API boundary and unit tested.
- "Slett alt" button wipes the workspace, stored documents and any cached extractions.
- API key from `.env` only, never committed. `.env.example` provided.
- The app is fully usable **without** an API key: manual entry + demo data. Only extraction needs it.

---

## 7. Build order (mirrors PROGRESS.md)

1. Scaffold + tooling (Next.js + TS + vitest).
2. Data model, money/time/holiday utils + tests.
3. Ruleset file + rules engine + unit tests, including: night shift across midnight, shift across a
   pay-period boundary, a public holiday, merarbeid vs overtime, a missing break, a week at 90 % of contract.
4. Manual entry UI + check → useful with no AI at all.
5. AI extraction (kontrakt → lønnsslipp → vaktplan), each with a confirm/edit screen.
6. Report screen, PDF export, draft message.
7. End-to-end demo: fake worker, 3 months, several deliberate errors.
8. Norwegian README + final verification (tests, app start, hand-checked kroner).
