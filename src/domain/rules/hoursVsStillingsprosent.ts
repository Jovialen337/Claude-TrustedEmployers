/**
 * Rule: are you getting the hours your stillingsprosent gives you?
 *
 * Weekly flags carry the money, because a week is the finest granularity where both the
 * contracted hours and the scheduled/worked hours are known exactly. The monthly and
 * whole-period flags are roll-ups with no amount of their own, so nothing double counts.
 */
import { contractedHoursPerWeekExplanation, hourlyRateExplanation } from '../derive';
import { formatHours, formatKr, roundHours } from '../money';
import type { Flag } from '../schemas';
import { addDays, isWithin } from '../time';
import {
  buildFlag,
  contractRef,
  contractedHoursForDays,
  ev,
  hoursTimesRateCalculation,
  isComplete,
  numberParam,
  refsFromSegments,
} from './helpers';
import type { RuleContext, RuleFn } from './types';

function segmentsIn(context: RuleContext, start: string, end: string) {
  return context.effective.filter((segment) => isWithin(segment.date, start, end));
}

export const hoursVsStillingsprosent: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const contracted = context.contractedWeeklyHours;
  const rate = context.hourlyRateOre;
  const range = context.dataRange;
  if (contracted <= 0 || !range) return flags;

  const weeklyTolerance = numberParam(context.rule, 'weekly_tolerance_hours', 0.5);
  const monthlyTolerance = numberParam(context.rule, 'monthly_tolerance_hours', 2);
  const minAmountOre = numberParam(context.rule, 'min_amount_ore', 2000);
  const basis = contractedHoursPerWeekExplanation(context.contract);

  /* ------------------------------------------------------------ per uke */
  for (const week of context.weeks) {
    if (!isComplete(week, range)) continue;
    const short = roundHours(contracted - week.workedHours);
    if (short <= weeklyTolerance) continue;

    const calculation = hoursTimesRateCalculation(short, rate);
    if (calculation.resultOre < minAmountOre) continue;

    flags.push(
      buildFlag(context, {
        key: week.key,
        title: 'Færre timer enn stillingsprosenten din',
        periodLabel: week.label,
        periodStart: week.start,
        periodEnd: week.end,
        message:
          `Kontrakten din gir ${formatHours(contracted)} i uka (${basis}). ` +
          `I ${week.label.toLowerCase()} er du satt opp på ${formatHours(week.workedHours)}. ` +
          `Det er ${formatHours(short)} mindre enn avtalt. Hvis du ikke selv har takket nei til vakter, ` +
          `hatt ferie eller vært syk, bør du spørre arbeidsgiver hvorfor.`,
        evidence: [
          ev('Avtalt arbeidstid', `${formatHours(contracted)} (${basis})`),
          ev('Planlagt denne uka', formatHours(week.plannedHours)),
          ev('Timer som gjelder', formatHours(week.workedHours)),
          ev('Differanse', formatHours(short)),
          ev('Timelønn', `${formatKr(rate)} (${hourlyRateExplanation(context.contract)})`),
        ],
        calculation,
        amountOre: calculation.resultOre,
        documentRefs: [...contractRef(context), ...refsFromSegments(segmentsIn(context, week.start, week.end))],
      }),
    );
  }

  /* ---------------------------------------------------------- per måned */
  for (const month of context.months) {
    if (!isComplete(month, range)) continue;
    const days = 1 + (new Date(`${month.end}T00:00:00Z`).getTime() - new Date(`${month.start}T00:00:00Z`).getTime()) / 86_400_000;
    const contractedMonth = roundHours(contractedHoursForDays(contracted, days));
    const short = roundHours(contractedMonth - month.workedHours);
    if (short <= monthlyTolerance) continue;

    const containedSlips = context.summaries.filter(
      (summary) => summary.payslip.periodStart >= month.start && summary.payslip.periodEnd <= month.end,
    );
    const paidHours = containedSlips.length > 0
      ? containedSlips.reduce((sum, summary) => sum + summary.paidWorkHours, 0)
      : null;

    flags.push(
      buildFlag(context, {
        key: month.key,
        severity: 'til_info',
        title: `Oppsummert: ${formatHours(short)} under avtalt arbeidstid`,
        periodLabel: month.label,
        periodStart: month.start,
        periodEnd: month.end,
        message:
          `For hele ${month.label} skulle stillingsprosenten din gitt omtrent ` +
          `${formatHours(contractedMonth)} (${formatHours(contracted)} i uka fordelt på ${days} dager). ` +
          `Du er satt opp på ${formatHours(month.workedHours)}. ` +
          `Dette er en oppsummering av ukene over — beløpet er ikke lagt til på nytt.`,
        evidence: [
          ev('Avtalt denne måneden', formatHours(contractedMonth)),
          ev('Timer som gjelder', formatHours(month.workedHours)),
          ev('Betalte timer', paidHours === null ? 'Ingen lønnsslipp dekker hele måneden' : formatHours(paidHours)),
          ev('Differanse', formatHours(short)),
          ev('Anslag i kroner', formatKr(hoursTimesRateCalculation(short, rate).resultOre)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* ------------------------------------------ hele perioden (12 mnd rullerende) */
  const cutoff = addDays(range.end, -365);
  const completeWeeks = context.weeks.filter((week) => isComplete(week, range) && week.start >= cutoff);
  if (completeWeeks.length >= 2) {
    const workedTotal = completeWeeks.reduce((sum, week) => sum + week.workedHours, 0);
    const contractedTotal = contracted * completeWeeks.length;
    const short = roundHours(contractedTotal - workedTotal);
    const first = completeWeeks[0]!;
    const last = completeWeeks[completeWeeks.length - 1]!;

    if (short > monthlyTolerance) {
      flags.push(
        buildFlag(context, {
          key: 'periode',
          severity: 'til_info',
          title: `Til sammen ${formatHours(short)} under avtalt arbeidstid`,
          periodLabel: `${first.label} – ${last.label}`,
          periodStart: first.start,
          periodEnd: last.end,
          message:
            `Over ${completeWeeks.length} hele uker har du i snitt jobbet ` +
            `${formatHours(workedTotal / completeWeeks.length)} i uka, mot ${formatHours(contracted)} avtalt. ` +
            `Dette er summen av ukene over, ikke et nytt krav.`,
          evidence: [
            ev('Hele uker med data', String(completeWeeks.length)),
            ev('Avtalt til sammen', formatHours(contractedTotal)),
            ev('Timer som gjelder', formatHours(workedTotal)),
            ev('Snitt per uke', formatHours(workedTotal / completeWeeks.length)),
            ev('Differanse', formatHours(short)),
          ],
          amountOre: null,
          documentRefs: contractRef(context),
        }),
      );
    }
  }

  return flags;
};
