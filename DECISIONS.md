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
