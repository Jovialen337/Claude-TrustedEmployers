# DECISIONS — Lønnssjekk

Choices made without asking, so the build could keep moving. Each entry: what was unclear,
what was chosen, and why.

Format: `YYYY-MM-DD — topic — decision (why)`

## Stack and tooling

- **2026-09-21 — Frontend framework: Next.js instead of Vite+React.** The spec suggested
  "TypeScript + React (Vite) + a Node or Python backend", but the requester explicitly chose
  *TypeScript + Next.js* when asked. Next.js App Router gives the UI and the local backend
  (route handlers for extraction, PDF and storage) in one process and one `npm run dev`,
  which suits a local-first app with no separate server to start.

## Data model and arithmetic

- **2026-09-21 — Money as integer øre.** All amounts are stored and computed as integer
  øre (`amountOre`), formatted only at the edges. `oreFromKr` additionally normalises
  through `toPrecision(12)` before rounding, because `1.005 * 100` is `100.49999999999999`
  in binary floating point and would otherwise lose an øre. User input is parsed by
  `parseKrInput` as a string ("198,50"), never via `parseFloat`.
- **2026-09-21 — Norwegian formatting written by hand, not via `Intl`.** A number must
  render identically in the browser, in a unit test and in the PDF report; `Intl` output
  varies with the ICU data present. Thousands are separated by a plain space (U+0020) so
  the same string survives into the PDF's WinAnsi encoding.
- **2026-09-21 — Shifts are split into per-calendar-day segments before anything is
  summed.** A shift that crosses midnight or a pay-period boundary must contribute to the
  right day, week and payslip period. The registered break is split proportionally to
  segment length, with leftover whole minutes given to the longest segment, so allocated
  break minutes always sum exactly to the registered break.
- **2026-09-21 — "9 timer per 24 timer" is measured per *arbeidsdøgn*, not per calendar
  day.** AML § 10-4 speaks of a 24-hour period. `doegnGroups` starts a window at the first
  shift's start and closes it 24 hours later, which is the only reading that treats a
  22:00–06:00 night shift as one working day rather than two part-days.
- **2026-09-21 — Sundays are not treated as "helligdag".** Lov om helligdager counts
  Sundays, but for pay purposes Sunday work is compensated as weekend work. Sundays
  therefore produce a `helg` supplement check, not a `helligdag` one, and `holidays.ts`
  lists only the 12 named public holidays.
- **2026-09-21 — Monthly salary converted with 52 weeks.** `timelønn = månedslønn × 12 /
  (avtalt uketimer × 52)`, i.e. ~1950 hours a year at 37,5 t/uke. Other divisors exist
  (1950 fixed, or per-month working days); this one follows the contract's own hours, so a
  part-timer's rate stays consistent with their stillingsprosent.
- **2026-09-21 — Payslip categories split into work-hours vs supplements.** Only
  `ordinaer`, `merarbeid`, `overtid_40`, `overtid_100` and `helligdag_arbeid` count as
  "hours paid". Kveld/natt/helg/helligdag lines are extra money on hours already counted,
  so counting their hours too would double count.

## Legal verification

- **2026-09-21 — lovdata.no is unreachable from this environment, so rules are marked
  `sekundaerkilde`, not `lovdata`.** The network egress proxy blocks lovdata.no
  (`EGRESS_BLOCKED`). Every rule still cites its canonical lovdata paragraph and URL, but
  the wording was verified against secondary sources (LO, Arbeidstilsynet, Virke,
  Juristforbundet, law-firm summaries) rather than the statute text itself. The schema
  therefore has a third value, `sekundaerkilde`, so the report can say honestly how a rule
  was checked. **Anything shown to a user should be re-verified against lovdata before this
  tool is used for real.** What was confirmed this way:
  - AML § 10-4(1): alminnelig arbeidstid 9 t/24 t and 40 t/7 dager.
  - AML § 10-6(11): overtidstillegg **minst 40 %**; § 10-6(4): overtime should not exceed
    10 t/7 dager, 25 t/4 uker, 200 t/52 uker.
  - AML § 10-8(1)(2): 11 t daily rest, 35 t weekly rest, weekly rest to include Sunday as
    far as possible; § 10-8(3): by agreement not below 8 t / 28 t.
  - AML § 10-9(1): a break is required when the day exceeds 5,5 t; breaks total at least
    30 min when the day is at least 8 t; a break counts as working time if the worker
    cannot leave the workplace.
  - AML § 14-4 a: a part-timer who has regularly worked beyond agreed hours over the last
    12 months may claim a position matching actual hours; the 12 months run from when the
    claim is made; holiday and sick leave are excluded.
  - Ferieloven § 10: 10,2 % of feriepengegrunnlaget, 12 % with an agreed fifth week,
    12,5 % for workers over 60.
- **2026-09-21 — Overtime *volume* limits added to the `overtime` rule.** § 10-6(4) sets
  maximum overtime (10 t/7 dager, 25 t/4 uker, 200 t/52 uker). The spec did not ask for it,
  but it falls inside "overtid (AML § 10-6)" and is cheap to check, so the rule also flags
  too *much* overtime (as information, with no kroner amount). Measured in ISO-week buckets
  rather than truly rolling 7-day windows, which is simpler and matches how a worker reads
  their own week.
- **2026-09-21 — Rest-period severity is graded, not fixed.** Less than the 8 t that even
  an agreement cannot go below is reported as `Sannsynlig feil`; between 8 t and 11 t is
  `Bør sjekkes`, since a tariff-based agreement may legitimately allow it.

## Aggregation

- **2026-09-21 — Registered hours beat the plan for the same day.** If any shift on a date
  is marked `jobbet`, the `planlagt` shifts for that date are ignored in the check: you
  were there, so that is the truth. The plan is still kept and still shown in the timeline,
  so "planlagt vs jobbet vs betalt" remains visible.
- **2026-09-21 — Paid hours are never attributed to individual weeks.** A monthly payslip
  states hours per category for the whole month, so splitting them across weeks would be
  invented data. Consequences: `scheduled_vs_paid` compares at the *payslip period* level
  ("Lønn for august 2026: jobbet 78,0 t, betalt 74,0 t …"), while genuinely weekly checks
  (`hours_vs_stillingsprosent`) compare contracted against scheduled/worked hours, both of
  which are known exactly per week. The timeline shows paid hours on a week row only when a
  payslip covers exactly that week (a weekly payslip); otherwise the week row points to the
  payslip period it belongs to. This keeps every number on screen traceable to a document.
- **2026-09-21 — Supplement hours are scaled by the worked share of the shift.** The
  overlap between a shift and a supplement window is measured on the clock span, then
  multiplied by `workedMinutes / grossMinutes`, i.e. the break is assumed spread evenly
  across the shift. Without this a 30-minute unpaid break inside an evening window would
  earn an evening supplement. If a contract says exactly when the break falls, that is more
  precise than this app can currently model.

## Rules engine

- **2026-09-21 — Each money claim is made by exactly one rule.** Overlapping claims were
  the main double-counting risk, so the split is fixed: `scheduled_vs_paid` claims the
  missing **base** pay for unpaid hours, `overtime` claims **only the 40 % supplement**,
  `supplements` claims only the tillegg. A worker who worked 10 unpaid hours of which 1 was
  overtime is owed 10 × rate + 1 × rate × 40 %, and that is what the app reports.
- **2026-09-21 — Two separate headline figures, not one.** `estimatedOwedOre` covers work
  done but not paid (`scheduled_vs_paid`, `overtime`, `supplements`). Hours the worker never
  got, although their stillingsprosent entitled them, are a contract claim that depends on
  circumstances (declined shifts, holiday, illness), so they are reported separately as
  `underScheduledOre` plus `hoursShortVsContract`. Feriepenger amounts are kept out of both
  and reported as something to check.
- **2026-09-21 — Weekly flags carry money; monthly and whole-period flags are roll-ups
  with `amountOre: null`.** A week is the finest granularity where both sides are known
  exactly. The roll-ups still show the kroner figure in their evidence, so the user sees the
  month total without it being added to any sum twice.
- **2026-09-21 — Partial weeks and months at the edges of the data are never flagged.** If
  a week sticks out past the range we have data for, the missing hours are missing data, not
  missing pay. Weeks *inside* the range with no shifts at all are bucketed and flagged,
  because a week where you were given no hours is exactly what a part-timer needs to see.
- **2026-09-21 — Weekly overtime beyond the daily excess is attributed only to pay periods
  that fully contain the week.** Daily overtime is attributable to a date, but "over 40 h in
  a week" is not, so for a week straddling two payslips only its daily excess is compared.
  Documented rather than silently approximated.
- **2026-09-21 — `actual_hours_vs_contract` never asserts the § 14-4 a condition is met.**
  It states how many whole weeks were actually examined, says the right depends on twelve
  months of regular merarbeid counted from when the claim is made, and points to
  Tvisteløsningsnemnda. With fewer than 52 weeks of data it says so explicitly.
- **2026-09-21 — Missing payslips are only reported for complete months.** For the month in
  progress the payslip may simply not have been issued yet, and a false "missing payslip"
  would undermine trust in every other flag.

## Demo — hand calculations

Recalculated by hand, and asserted in `tests/demo.test.ts`. Contract: 60 % of 37,5 t =
**22,5 t/uke**, hourly rate **198,50 kr**.

1. **Kveldstillegg juni 2026 — 1 825,00 kr.** Evening hours after 18:00 in June:
   week 23 (1.–7.) 4 × 4 t = 16 t; week 24 (8.–14.) 16 t; week 25 (15.–21.) 3 × 4 t plus
   Friday 19th 18:00–23:00 = 5 t → 17 t; week 26 (22.–28.) 16 t; Monday 29th and Tuesday 30th
   4 t + 4 t = 8 t. Sum **73,0 t**. The June payslip has no kveldstillegg line at all, so the
   whole contractual rate is missing: 73,0 t × 25,00 kr = **1 825,00 kr**. ✔ matches the app.
2. **Overtidstillegg juli 2026 — 158,80 kr.** Wednesday 15 July 08:00–19:00 with no break is
   11,0 t inside one arbeidsdøgn. The limit is 9 t, so 2,0 t is overtime. The payslip shows no
   overtime hours, so all 2,0 t lack their supplement:
   2,0 t × 198,50 kr × 40 % = 2,0 × 79,40 kr = **158,80 kr**. ✔ matches the app.
   (Only the supplement is claimed here: the hours themselves were paid as ordinary hours.)
3. **Ubetalte timer juli 2026 — 496,25 kr.** Hours worked in July: 17,5 t (2.–4. July, the
   part of week 27 that falls in July) + 15,0 t (week 28) + 33,5 t (week 29) + 28,5 t (week 30)
   = **94,5 t**. The payslip pays 92,0 t. Difference 2,5 t × 198,50 kr = **496,25 kr**.
   ✔ matches the app.
4. **Helligdagstillegg mai 2026 — 1 985,00 kr.** Shifts falling on a public holiday:
   Thursday 14 May (Kristi himmelfartsdag) 17:00–22:00 = 5,0 t and Monday 25 May (2. pinsedag)
   17:00–22:00 = 5,0 t → 10,0 t. Contract rate 100 % of hourly:
   10,0 t × 198,50 kr × 100 % = **1 985,00 kr**. ✔ matches the app.
5. **Feil timesats mai 2026 — 1 485,00 kr.** 110,0 t paid at 185,00 kr instead of 198,50 kr:
   110,0 × (198,50 − 185,00) = 110,0 × 13,50 kr = **1 485,00 kr**. ✔ matches the app.
6. **Uke 28 under stillingsprosenten — 1 488,75 kr.** 22,5 t avtalt − 15,0 t satt opp = 7,5 t;
   7,5 t × 198,50 kr = **1 488,75 kr**. Kept out of the "owed" total (see above). ✔
7. **Feriepenger juli 2026 — 630,00 kr.** 65 000,00 kr × 10,2 % = 6 630,00 kr, but 6 000,00 kr
   is set aside: difference **630,00 kr**, reported as "bør sjekkes". ✔ matches the app.
8. **Overtid juni 2026 — 357,30 kr** (not planted directly, a consequence of error 4).
   Friday 19 June 15:00–23:00 (8,0 t) and Saturday 20 June 07:00–13:00 minus a 30-minute break
   (5,5 t) are only 8 hours apart, so they are one arbeidsdøgn of 13,5 t: 4,5 t over the 9 t
   limit. 4,5 t × 198,50 kr × 40 % = **357,30 kr**. ✔ matches the app.

**Total owed** = 1 985,00 + 1 825,00 + 1 485,00 + 496,25 + 357,30 + 158,80 = **6 307,35 kr**,
plus 1 488,75 kr in hours never given and 630,00 kr of feriepenger to check. ✔

## Storage and demo

- **2026-09-21 — A single JSON file, not SQLite.** `better-sqlite3` is a native module that
  has to be rebuilt per platform, which is a poor fit for an app people are meant to run
  locally with one `npm install`. One `.data/workspace.json`, written atomically (temp file +
  rename), covers the whole data model, is trivially inspectable by the user, and makes
  "Slett alt" a single directory removal.
- **2026-09-21 — Demo payslips are written as literals, not derived from the shifts.** If the
  payslips were computed by the same aggregation code the rules use, a counting bug would
  appear on both sides and cancel out. The literals mean a change in how hours are counted
  breaks `tests/demo.test.ts` instead of passing silently.
- **2026-09-21 — Overlapping supplements are both claimed.** If a contract has both a weekend
  and a public-holiday supplement and a shift falls on a public holiday that is also a Sunday,
  the app claims both. Many agreements pay only the higher one. Not modelled; the demo avoids
  the ambiguity by putting the holiday shifts on weekdays, and the flag always shows which
  contract term it came from so the user can correct it.
