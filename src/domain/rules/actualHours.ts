/**
 * Rule: a part-timer who regularly works more than their contract may have the right to a
 * position matching their actual hours (AML § 14-4 a).
 *
 * The statute asks for twelve months of regular merarbeid, counted from the day the claim
 * is made. This app can only see the data it has been given, so the flag states how many
 * whole weeks it actually looked at, and never claims the condition is met — it says the
 * worker may have a claim and where to take it.
 */
import { formatHours, formatPercent, roundHours } from '../money';
import type { Flag } from '../schemas';
import { addDays } from '../time';
import { buildFlag, contractRef, ev, isComplete, numberParam } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const actualHoursVsContract: RuleFn = (context: RuleContext): Flag[] => {
  const range = context.dataRange;
  const contracted = context.contractedWeeklyHours;
  if (!range || contracted <= 0) return [];
  // Only part-time positions have this right.
  if (context.contract.stillingsprosent >= 100) return [];

  const minWeeks = numberParam(context.rule, 'min_weeks_observed', 12);
  const tolerancePercent = numberParam(context.rule, 'excess_tolerance_percent', 5);
  const lookbackMonths = numberParam(context.rule, 'lookback_months', 12);

  const cutoff = addDays(range.end, -Math.round(lookbackMonths * 30.44));
  const weeks = context.weeks.filter((week) => isComplete(week, range) && week.start >= cutoff);
  if (weeks.length < minWeeks) return [];

  const worked = weeks.reduce((sum, week) => sum + week.workedHours, 0);
  const average = worked / weeks.length;
  const threshold = contracted * (1 + tolerancePercent / 100);
  if (average <= threshold) return [];

  const suggestedPercent = Math.round((average / context.fullTimeHoursPerWeek) * 1000) / 10;
  const weeksAbove = weeks.filter((week) => week.workedHours > contracted).length;
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;

  return [
    buildFlag(context, {
      key: 'stilling',
      title: `Du har jobbet som ${formatPercent(suggestedPercent)} — kontrakten sier ${formatPercent(context.contract.stillingsprosent)}`,
      periodLabel: `${first.label} – ${last.label}`,
      periodStart: first.start,
      periodEnd: last.end,
      message:
        `Over ${weeks.length} hele uker har du i snitt jobbet ${formatHours(average)} i uka, mot ` +
        `${formatHours(contracted)} avtalt. Det svarer til en stilling på omtrent ` +
        `${formatPercent(suggestedPercent)} av full tid (${formatHours(context.fullTimeHoursPerWeek)}). ` +
        `Har du jobbet jevnlig utover avtalt arbeidstid de siste tolv månedene, kan du ha rett til en stilling ` +
        `som tilsvarer det du faktisk har jobbet. ` +
        (weeks.length < 52
          ? `Vi har bare data for ${weeks.length} uker, så dette er ikke et ferdig krav — men det er verdt å ta opp.`
          : `Du bør ta dette opp skriftlig med arbeidsgiver.`) +
        ` Blir dere ikke enige, kan saken bringes inn for Tvisteløsningsnemnda. Ferie og sykefravær teller ikke med i beregningen.`,
      evidence: [
        ev('Avtalt stilling', `${formatPercent(context.contract.stillingsprosent)} (${formatHours(contracted)} i uka)`),
        ev('Faktisk snitt', formatHours(roundHours(average))),
        ev('Tilsvarer stilling', formatPercent(suggestedPercent)),
        ev('Hele uker vi har sett på', String(weeks.length)),
        ev('Uker over avtalt tid', String(weeksAbove)),
      ],
      amountOre: null,
      documentRefs: contractRef(context),
    }),
  ];
};
