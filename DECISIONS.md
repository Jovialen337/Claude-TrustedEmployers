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
