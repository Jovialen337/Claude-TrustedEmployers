/**
 * Rule: overtime (AML § 10-4 and § 10-6), and the difference between overtime and merarbeid.
 *
 * Three things are checked:
 *  1. hours beyond the normal limits (9 t per arbeidsdøgn, 40 t per week) must be paid with
 *     at least a 40 % supplement;
 *  2. merarbeid — hours above your own contract but inside the normal limits — is explained,
 *     because it is paid at ordinary rate and people often expect overtime pay for it;
 *  3. the volume limits in § 10-6(4) (10 t per week, 25 t per 4 weeks, 200 t per 52 weeks).
 *
 * Money: this rule claims **only the supplement**. If the hours were not paid at all, the
 * base pay is claimed by `scheduled_vs_paid`, so the two never double count.
 */
import { effectiveShifts } from '../aggregate';
import { normalDailyLimitHours, normalWeeklyLimitHours } from '../derive';
import { formatHours, formatKr, formatPercent, roundHours } from '../money';
import type { DateStr, Flag } from '../schemas';
import { doegnGroups, formatDateLong, isWithin, toEpochDay } from '../time';
import {
  buildFlag,
  contractRef,
  ev,
  isComplete,
  numberParam,
  refsFromPayslip,
  refsFromSegments,
  hoursTimesRateCalculation,
} from './helpers';
import type { RuleContext, RuleFn } from './types';

interface DoegnExcess {
  date: DateStr;
  workedHours: number;
  excessHours: number;
}

/** Overtime from working more than the daily limit, per arbeidsdøgn (24 h from work start). */
function dailyExcesses(context: RuleContext, dailyLimit: number, tolerance: number): DoegnExcess[] {
  const newPeriodAfterRestHours = numberParam(context.rule, 'new_period_after_rest_hours', 11);
  return doegnGroups(effectiveShifts(context.shifts), { newPeriodAfterRestHours })
    .map((group) => {
      const workedHours = group.workedMinutes / 60;
      return { date: group.date, workedHours, excessHours: roundHours(workedHours - dailyLimit) };
    })
    .filter((entry) => entry.excessHours > tolerance);
}

export const overtime: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const range = context.dataRange;
  if (!range) return flags;

  const dailyLimit = normalDailyLimitHours(context.contract, context.rule.params);
  const weeklyLimit = normalWeeklyLimitHours(context.contract, context.rule.params);
  const supplementPercent = numberParam(context.rule, 'overtime_supplement_percent', 40);
  const tolerance = numberParam(context.rule, 'tolerance_hours', 0.25);
  const rate = context.hourlyRateOre;

  const excesses = dailyExcesses(context, dailyLimit, tolerance);

  /** Extra overtime that only shows up when the whole week is added together. */
  const extraWeeklyByWeek = new Map<string, number>();
  const overtimeByWeek = new Map<string, number>();
  const merarbeidByWeek = new Map<string, number>();

  for (const week of context.weeks) {
    if (!isComplete(week, range)) continue;
    const dailyInWeek = excesses
      .filter((entry) => isWithin(entry.date, week.start, week.end))
      .reduce((sum, entry) => sum + entry.excessHours, 0);
    const weeklyExcess = Math.max(0, roundHours(week.workedHours - weeklyLimit));
    const total = Math.max(dailyInWeek, weeklyExcess);

    overtimeByWeek.set(week.key, total);
    extraWeeklyByWeek.set(week.key, roundHours(total - dailyInWeek));

    const withinNormal = Math.min(week.workedHours, weeklyLimit);
    const merarbeid = Math.max(0, roundHours(withinNormal - context.contractedWeeklyHours));
    if (merarbeid > tolerance) merarbeidByWeek.set(week.key, merarbeid);
  }

  /* --------------------------------- 1. manglende overtidstillegg per lønnsperiode */
  for (const summary of context.summaries) {
    const { periodStart, periodEnd } = summary.payslip;

    const dailyInPeriod = excesses
      .filter((entry) => isWithin(entry.date, periodStart, periodEnd))
      .reduce((sum, entry) => sum + entry.excessHours, 0);
    const extraWeekly = context.weeks
      .filter((week) => week.start >= periodStart && week.end <= periodEnd)
      .reduce((sum, week) => sum + (extraWeeklyByWeek.get(week.key) ?? 0), 0);

    const computed = roundHours(dailyInPeriod + extraWeekly);
    if (computed <= tolerance) continue;

    const missing = roundHours(computed - summary.paidOvertimeHours);
    if (missing <= tolerance) continue;

    const calculation = hoursTimesRateCalculation(missing, rate, {
      factor: supplementPercent / 100,
      factorLabel: formatPercent(supplementPercent),
    });

    const detail = excesses
      .filter((entry) => isWithin(entry.date, periodStart, periodEnd))
      .map((entry) =>
        ev(
          formatDateLong(entry.date),
          `${formatHours(entry.workedHours)} jobbet, ${formatHours(entry.excessHours)} over grensen på ${formatHours(dailyLimit)}`,
        ),
      );

    flags.push(
      buildFlag(context, {
        key: summary.payslip.id,
        title: `Overtidstillegg mangler for ${summary.label.toLowerCase()}`,
        periodLabel: summary.label,
        periodStart,
        periodEnd,
        message:
          `Vi regner ${formatHours(computed)} som overtid i denne perioden, mens lønnsslippen viser ` +
          `${formatHours(summary.paidOvertimeHours)} overtid. Overtid skal ha minst ` +
          `${formatPercent(supplementPercent)} tillegg på toppen av vanlig timelønn. ` +
          `Her er bare selve tillegget regnet med — er timene heller ikke betalt som vanlige timer, ` +
          `kommer grunnlønna i tillegg (se «Er alle timene du jobbet betalt?»).`,
        evidence: [
          ev('Grense per arbeidsdøgn', formatHours(dailyLimit)),
          ev('Grense per uke', formatHours(weeklyLimit)),
          ev('Overtid vi regner ut', formatHours(computed)),
          ev('Overtid på lønnsslippen', formatHours(summary.paidOvertimeHours)),
          ev('Mangler', formatHours(missing)),
          ev('Timelønn', formatKr(rate)),
          ev('Tillegg', formatPercent(supplementPercent)),
          ...detail,
        ],
        calculation,
        amountOre: calculation.resultOre,
        documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
      }),
    );
  }

  /* ------------------------------------------------- 2. merarbeid, forklart én gang */
  if (merarbeidByWeek.size > 0 && context.contractedWeeklyHours < weeklyLimit) {
    const total = roundHours([...merarbeidByWeek.values()].reduce((a, b) => a + b, 0));
    const weeks = context.weeks.filter((week) => merarbeidByWeek.has(week.key));
    const first = weeks[0]!;
    const last = weeks[weeks.length - 1]!;

    flags.push(
      buildFlag(context, {
        key: 'merarbeid',
        severity: 'til_info',
        title: `${formatHours(total)} merarbeid — ikke det samme som overtid`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Du har jobbet ${formatHours(total)} mer enn kontrakten din på ` +
          `${formatHours(context.contractedWeeklyHours)} i uka, men fortsatt innenfor lovens grenser ` +
          `(${formatHours(dailyLimit)} per døgn og ${formatHours(weeklyLimit)} per uke). ` +
          `Det kalles merarbeid. Merarbeid skal betales som vanlige timer, men gir ikke krav på ` +
          `overtidstillegg etter loven. Har du jobbet jevnlig merarbeid i tolv måneder, kan du ha rett ` +
          `til en større stilling — se den egne flagget om det.`,
        evidence: [
          ev('Avtalt arbeidstid', formatHours(context.contractedWeeklyHours)),
          ev('Merarbeid til sammen', formatHours(total)),
          ev('Uker med merarbeid', String(merarbeidByWeek.size)),
          ...weeks.slice(0, 8).map((week) =>
            ev(week.label, `${formatHours(week.workedHours)} jobbet, ${formatHours(merarbeidByWeek.get(week.key)!)} over avtalt`),
          ),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* --------------------------------------------- 3. grensene for hvor mye overtid */
  const maxPerWeek = numberParam(context.rule, 'max_overtime_hours_per_7_days', 10);
  const maxPer4Weeks = numberParam(context.rule, 'max_overtime_hours_per_4_weeks', 25);
  const maxPer52Weeks = numberParam(context.rule, 'max_overtime_hours_per_52_weeks', 200);

  for (const week of context.weeks) {
    const hours = overtimeByWeek.get(week.key) ?? 0;
    if (hours <= maxPerWeek) continue;
    flags.push(
      buildFlag(context, {
        key: `grense-uke:${week.key}`,
        severity: 'bor_sjekkes',
        title: `Mer overtid enn loven tillater i ${week.label.toLowerCase()}`,
        periodLabel: week.label,
        periodStart: week.start,
        periodEnd: week.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPerWeek)} i løpet av sju dager. ` +
          `I ${week.label.toLowerCase()} regner vi ${formatHours(hours)} overtid. Høyere grenser kan følge av ` +
          `avtale med tillitsvalgte eller tillatelse fra Arbeidstilsynet.`,
        evidence: [ev('Overtid denne uka', formatHours(hours)), ev('Lovens hovedregel', formatHours(maxPerWeek))],
        amountOre: null,
        documentRefs: refsFromSegments(context.effective.filter((s) => isWithin(s.date, week.start, week.end))),
      }),
    );
  }

  const completeWeeks = context.weeks.filter((week) => isComplete(week, range));
  for (let i = 0; i + 3 < completeWeeks.length; i += 1) {
    const window = completeWeeks.slice(i, i + 4);
    const first = window[0]!;
    const last = window[3]!;
    // Only a genuinely consecutive four-week window counts.
    if (toEpochDay(last.start) - toEpochDay(first.start) !== 21) continue;
    const hours = roundHours(window.reduce((sum, week) => sum + (overtimeByWeek.get(week.key) ?? 0), 0));
    if (hours <= maxPer4Weeks) continue;
    flags.push(
      buildFlag(context, {
        key: `grense-4uker:${first.key}`,
        severity: 'bor_sjekkes',
        title: `Mer enn ${formatHours(maxPer4Weeks)} overtid på fire uker`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPer4Weeks)} i fire sammenhengende uker. ` +
          `Fra ${first.label.toLowerCase()} til ${last.label.toLowerCase()} regner vi ${formatHours(hours)}.`,
        evidence: [ev('Overtid i perioden', formatHours(hours)), ev('Lovens hovedregel', formatHours(maxPer4Weeks))],
        amountOre: null,
      }),
    );
    break; // one flag is enough to make the point
  }

  const totalOvertime = roundHours(completeWeeks.reduce((sum, week) => sum + (overtimeByWeek.get(week.key) ?? 0), 0));
  if (totalOvertime > maxPer52Weeks) {
    const first = completeWeeks[0]!;
    const last = completeWeeks[completeWeeks.length - 1]!;
    flags.push(
      buildFlag(context, {
        key: 'grense-52uker',
        severity: 'bor_sjekkes',
        title: `Mer enn ${formatHours(maxPer52Weeks)} overtid i perioden`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPer52Weeks)} i løpet av 52 uker. ` +
          `I dataene dine regner vi ${formatHours(totalOvertime)}.`,
        evidence: [ev('Overtid til sammen', formatHours(totalOvertime)), ev('Lovens hovedregel', formatHours(maxPer52Weeks))],
        amountOre: null,
      }),
    );
  }

  return flags;
};

export { dailyExcesses };
