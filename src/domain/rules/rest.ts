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
import { dailyRest, weeklyRest, withSource } from '../thresholds';
import { buildFlag, contractRef, ev, isComplete, numberParam, refsFromShifts } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const restPeriods: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  // The contract governs, down to the floor the law does not let an agreement pass.
  const daily = dailyRest(context.contract, context.rule);
  const weekly = weeklyRest(context.contract, context.rule);
  const minDaily = daily.value;
  const minWeekly = weekly.value;
  const minDailyAgreed = numberParam(context.rule, 'min_daily_rest_hours_by_agreement', 8);
  const minWeeklyAgreed = numberParam(context.rule, 'min_weekly_rest_hours_by_agreement', 28);

  for (const [threshold, what, floor] of [
    [daily, 'daglig', minDailyAgreed],
    [weekly, 'ukentlig', minWeeklyAgreed],
  ] as const) {
    if (!threshold.belowStatutory) continue;
    const span = context.dataRange;
    if (!span) continue;
    flags.push(
      buildFlag(context, {
        key: `avtale-under-lovens-gulv:${what}`,
        severity: 'bor_sjekkes',
        title: `Kontrakten avtaler kortere ${what} arbeidsfri enn loven tillater`,
        periodLabel: 'Hele perioden',
        periodStart: span.start,
        periodEnd: span.end,
        message:
          `Kontrakten din oppgir ${formatHours(threshold.belowStatutory.contractValue)} ${what} arbeidsfri. ` +
          `Selv en skriftlig avtale med tillitsvalgte kan ikke gå under ${formatHours(floor)}, så vi har ` +
          `regnet med ${formatHours(floor)}. Dette bør du ta opp uansett hva vaktene viser.`,
        evidence: [
          ev('Avtalt i kontrakten', formatHours(threshold.belowStatutory.contractValue)),
          ev('Lovens nedre grense ved avtale', formatHours(floor)),
          ev('Brukt i utregningene', formatHours(threshold.value)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

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
          `Du skal ha minst ${formatHours(minDaily)} sammenhengende fri i løpet av 24 timer ` +
          `(${daily.label}). ` +
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
          ev('Kravet vi måler mot', withSource(formatHours(minDaily), daily)),
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

  /**
   * Rest periods that lie between two actual shifts. Used to tell a real breach from a
   * weekly free period that simply straddles the week boundary: § 10-8 asks for 35 hours
   * within seven days, and nothing says the seven days have to be Monday to Sunday.
   * The open-ended stretches before the first and after the last shift are deliberately
   * left out — they are absence of data, not known rest.
   */
  const boundedGaps: { from: number; to: number; hours: number }[] = [];
  for (let i = 1; i < busy.length; i += 1) {
    const from = busy[i - 1]!.to;
    const to = busy[i]!.from;
    if (to > from) boundedGaps.push({ from, to, hours: (to - from) / 60 });
  }

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

    if (inside.length === 0) continue;

    let longestInWeek = 0;
    let cursor = windowFrom;
    for (const interval of inside) {
      longestInWeek = Math.max(longestInWeek, interval.from - cursor);
      cursor = Math.max(cursor, interval.to);
    }
    longestInWeek = Math.max(longestInWeek, windowTo - cursor);

    const gapHours = roundHours(longestInWeek / 60);
    if (gapHours >= minWeekly) continue;

    // Is there a long enough rest that touches this week, even if it sits across the boundary?
    const straddling = boundedGaps
      .filter((gap) => gap.to > windowFrom && gap.from < windowTo)
      .reduce((longest, gap) => Math.max(longest, gap.hours), 0);
    const coveredAcrossBoundary = roundHours(straddling) >= minWeekly;

    flags.push(
      buildFlag(context, {
        key: `ukentlig:${week.key}`,
        severity: coveredAcrossBoundary
          ? 'til_info'
          : gapHours < minWeeklyAgreed
            ? 'sannsynlig_feil'
            : 'bor_sjekkes',
        title: coveredAcrossBoundary
          ? 'Den ukentlige frien ligger over ukeskiftet'
          : `Bare ${formatHours(gapHours)} sammenhengende fri denne uka`,
        periodLabel: week.label,
        periodStart: week.start,
        periodEnd: week.end,
        message: coveredAcrossBoundary
          ? `Inne i ${week.label.toLowerCase()} (mandag til søndag) er den lengste sammenhengende friperioden ` +
            `${formatHours(gapHours)}, altså under ${formatHours(minWeekly)}. Men du hadde ` +
            `${formatHours(roundHours(straddling))} sammenhengende fri rett før eller etter uka, og loven krever ` +
            `${formatHours(minWeekly)} i løpet av sju dager — ikke nødvendigvis innenfor mandag til søndag. ` +
            `Dette er derfor mest til informasjon.`
          : `Du skal ha minst ${formatHours(minWeekly)} sammenhengende fri i løpet av sju dager, og friperioden ` +
            `skal så langt som mulig omfatte en søndag. Den lengste sammenhengende friperioden vi finner i ` +
            `${week.label.toLowerCase()} er ${formatHours(gapHours)}, og vi finner heller ingen lang nok friperiode ` +
            `rett før eller etter uka.`,
        evidence: [
          ev('Lengste friperiode i uka', formatHours(gapHours)),
          ev('Lengste friperiode som berører uka', straddling > 0 ? formatHours(roundHours(straddling)) : 'Ingen funnet'),
          ev('Kravet vi måler mot', withSource(formatHours(minWeekly), weekly)),
          ev('Laveste ved avtale', formatHours(minWeeklyAgreed)),
          ev('Vakter denne uka', String(inside.length)),
        ],
        amountOre: null,
      }),
    );
  }

  return flags;
};
