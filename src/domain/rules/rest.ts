/**
 * Rule: rest between shifts (AML § 10-8).
 *
 * 11 hours of continuous rest per 24 hours and 35 hours per 7 days. A written agreement in
 * a tariff-bound business can go down to 8 / 28 hours, so anything in between is reported
 * as "bør sjekkes" and only a breach of the absolute floor as "sannsynlig feil".
 */
import { effectiveShifts } from '../aggregate';
import { formatHours, roundHours } from '../money';
import type { Flag, Shift } from '../schemas';
import {
  MINUTES_PER_DAY,
  formatDateLong,
  formatTime,
  shiftEndInstant,
  shiftStartInstant,
  toEpochDay,
} from '../time';
import { buildFlag, ev, isComplete, numberParam, refsFromShifts } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const restPeriods: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const minDaily = numberParam(context.rule, 'min_daily_rest_hours', 11);
  const minDailyAgreed = numberParam(context.rule, 'min_daily_rest_hours_by_agreement', 8);
  const minWeekly = numberParam(context.rule, 'min_weekly_rest_hours', 35);
  const minWeeklyAgreed = numberParam(context.rule, 'min_weekly_rest_hours_by_agreement', 28);

  const shifts: Shift[] = [...effectiveShifts(context.shifts)].sort(
    (a, b) => shiftStartInstant(a) - shiftStartInstant(b),
  );

  /* ------------------------------------------------- daglig arbeidsfri (11 timer) */
  for (let i = 1; i < shifts.length; i += 1) {
    const previous = shifts[i - 1]!;
    const next = shifts[i]!;
    const restHours = roundHours((shiftStartInstant(next) - shiftEndInstant(previous)) / 60);
    if (restHours >= minDaily) continue;
    // Overlapping or back-to-back shifts on the same day are one work period, not a rest breach.
    if (restHours <= 0) continue;

    flags.push(
      buildFlag(context, {
        key: `daglig:${previous.id}:${next.id}`,
        severity: restHours < minDailyAgreed ? 'sannsynlig_feil' : 'bor_sjekkes',
        title: `Bare ${formatHours(restHours)} fri mellom to vakter`,
        periodLabel: formatDateLong(next.date),
        periodStart: previous.date,
        periodEnd: next.date,
        message:
          `Du skal ha minst ${formatHours(minDaily)} sammenhengende fri i løpet av 24 timer. ` +
          `Mellom vakta som slutter ${formatTime(shiftEndInstant(previous) % MINUTES_PER_DAY)} og vakta som ` +
          `starter ${next.start} er det ${formatHours(restHours)}. ` +
          (restHours < minDailyAgreed
            ? `Dette er under 8 timer, som er det laveste selv en avtale med tillitsvalgte kan sette.`
            : `Med skriftlig avtale i tariffbundet virksomhet kan hvilen settes ned til ${formatHours(minDailyAgreed)}, ` +
              `men da har du krav på kompenserende hvile.`),
        evidence: [
          ev('Vakt før', `${formatDateLong(previous.date)} ${previous.start}–${previous.end}`),
          ev('Vakt etter', `${formatDateLong(next.date)} ${next.start}–${next.end}`),
          ev('Fri mellom vaktene', formatHours(restHours)),
          ev('Lovens krav', formatHours(minDaily)),
        ],
        amountOre: null,
        documentRefs: refsFromShifts([previous, next]),
      }),
    );
  }

  /* ------------------------------------------------ ukentlig arbeidsfri (35 timer) */
  const busy = shifts.map((shift) => ({
    from: shiftStartInstant(shift),
    to: shiftEndInstant(shift),
  }));

  for (const week of context.weeks) {
    if (!isComplete(week, context.dataRange)) continue;
    const windowFrom = toEpochDay(week.start) * MINUTES_PER_DAY;
    const windowTo = (toEpochDay(week.end) + 1) * MINUTES_PER_DAY;

    const inside = busy
      .filter((interval) => interval.to > windowFrom && interval.from < windowTo)
      .map((interval) => ({
        from: Math.max(interval.from, windowFrom),
        to: Math.min(interval.to, windowTo),
      }))
      .sort((a, b) => a.from - b.from);

    let longestGap = 0;
    let cursor = windowFrom;
    for (const interval of inside) {
      longestGap = Math.max(longestGap, interval.from - cursor);
      cursor = Math.max(cursor, interval.to);
    }
    longestGap = Math.max(longestGap, windowTo - cursor);

    const gapHours = roundHours(longestGap / 60);
    if (inside.length === 0 || gapHours >= minWeekly) continue;

    flags.push(
      buildFlag(context, {
        key: `ukentlig:${week.key}`,
        severity: gapHours < minWeeklyAgreed ? 'sannsynlig_feil' : 'bor_sjekkes',
        title: `Bare ${formatHours(gapHours)} sammenhengende fri i ${week.label.toLowerCase()}`,
        periodLabel: week.label,
        periodStart: week.start,
        periodEnd: week.end,
        message:
          `Du skal ha minst ${formatHours(minWeekly)} sammenhengende fri i løpet av sju dager, og friperioden ` +
          `skal så langt som mulig omfatte en søndag. Den lengste sammenhengende friperioden vi finner i ` +
          `${week.label.toLowerCase()} er ${formatHours(gapHours)}.`,
        evidence: [
          ev('Lengste friperiode', formatHours(gapHours)),
          ev('Lovens krav', formatHours(minWeekly)),
          ev('Laveste ved avtale', formatHours(minWeeklyAgreed)),
          ev('Vakter denne uka', String(inside.length)),
        ],
        amountOre: null,
      }),
    );
  }

  return flags;
};
