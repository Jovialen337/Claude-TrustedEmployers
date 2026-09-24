/**
 * Rule: the holiday itself (ferieloven § 5, § 7) — not the money, which the feriepenger rule
 * covers.
 *
 * You are entitled to 25 working days of holiday a year, and to take 18 of them (three weeks)
 * without interruption between 1 June and 30 September. This rule looks for a gap in the
 * shift data long enough to be that holiday, and says so when it cannot find one — carefully,
 * because a gap in the data is not proof of a holiday, and no gap is not proof of none.
 */
import { effectiveShifts, segmentsOf } from '../aggregate';
import type { DateStr, Flag } from '../schemas';
import { addDays, daysBetween, formatDateShort } from '../time';
import { buildFlag, ev, numberParam } from './helpers';
import type { RuleContext, RuleFn } from './types';

/** The longest run of consecutive days with no work inside a range. */
function longestGap(
  workDays: readonly DateStr[],
  start: DateStr,
  end: DateStr,
): { days: number; from: DateStr; to: DateStr } | null {
  const inside = workDays.filter((date) => date >= start && date <= end).sort();
  let best: { days: number; from: DateStr; to: DateStr } | null = null;

  const consider = (from: DateStr, to: DateStr) => {
    const days = daysBetween(from, to) + 1;
    if (days > 0 && (best === null || days > best.days)) best = { days, from, to };
  };

  if (inside.length === 0) {
    consider(start, end);
    return best;
  }

  consider(start, addDays(inside[0]!, -1));
  for (let i = 1; i < inside.length; i += 1) {
    consider(addDays(inside[i - 1]!, 1), addDays(inside[i]!, -1));
  }
  consider(addDays(inside[inside.length - 1]!, 1), end);
  return best;
}

export const holiday: RuleFn = (context: RuleContext): Flag[] => {
  const range = context.dataRange;
  if (!range) return [];

  const mainHolidayDays = numberParam(context.rule, 'main_holiday_days', 21);
  const minWeeksObserved = numberParam(context.rule, 'min_weeks_observed', 8);
  if (context.totalWeeksObserved < minWeeksObserved) return [];

  const workDays = [...new Set(segmentsOf(effectiveShifts(context.workTimeShifts)).map((s) => s.date))];

  /* ------------------- hovedferien: tre uker mellom 1. juni og 30. september */
  const year = Number(range.end.slice(0, 4));
  const mainStart = `${year}-06-01` as DateStr;
  const mainEnd = `${year}-09-30` as DateStr;
  const overlapStart = range.start > mainStart ? range.start : mainStart;
  const overlapEnd = range.end < mainEnd ? range.end : mainEnd;

  // Only worth saying anything if we actually cover most of the main holiday period.
  if (overlapStart >= overlapEnd || daysBetween(overlapStart, overlapEnd) < mainHolidayDays + 14) {
    return [];
  }

  const gap = longestGap(workDays, overlapStart, overlapEnd);
  const longest = gap?.days ?? 0;
  if (longest >= mainHolidayDays) return [];

  return [
    buildFlag(context, {
      key: 'hovedferie',
      severity: 'til_info',
      title: 'Vi finner ingen sammenhengende hovedferie i dataene',
      periodLabel: `1. juni – 30. september ${year}`,
      periodStart: overlapStart,
      periodEnd: overlapEnd,
      message:
        `Du har rett til 25 virkedager ferie i året — fire uker og én dag — og du kan kreve at 18 av dem ` +
        `(tre uker) gis sammenhengende mellom 1. juni og 30. september. I vaktene vi har for den perioden ` +
        `er den lengste sammenhengende friperioden ${longest} dager. ` +
        `Dette er bare et signal: en luke i vaktplanen er ikke bevis på at du hadde ferie, og at vi ikke ` +
        `finner en luke er ikke bevis på at du ikke hadde det. Har du ikke fått tatt ferien din, ta det ` +
        `opp — ferie skal avvikles, og feriepenger er ikke det samme som fri.`,
      evidence: [
        ev('Perioden vi har data for', `${formatDateShort(overlapStart)} – ${formatDateShort(overlapEnd)}`),
        ev('Lengste friperiode vi finner', `${longest} dager`),
        ev('Sammenhengende hovedferie du kan kreve', `${mainHolidayDays} dager (18 virkedager)`),
        ev('Ferie i året til sammen', '25 virkedager'),
        ...(gap ? [ev('Friperioden vi fant', `${formatDateShort(gap.from)} – ${formatDateShort(gap.to)}`)] : []),
      ],
      amountOre: null,
    }),
  ];
};
