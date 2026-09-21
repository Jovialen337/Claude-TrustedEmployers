/**
 * Rule: breaks on long days (AML § 10-9).
 *
 * Measured per arbeidsdøgn, so two shifts on the same day are one working day. A missing
 * break is reported as "bør sjekkes" rather than an error, because very often the break was
 * taken but never registered in the shift system.
 */
import { effectiveShifts } from '../aggregate';
import { formatHours } from '../money';
import type { Flag } from '../schemas';
import { doegnGroups, formatDateLong } from '../time';
import { buildFlag, ev, numberParam, refsFromShifts } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const breaks: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const requiredAfter = numberParam(context.rule, 'break_required_after_hours', 5.5);
  const longDay = numberParam(context.rule, 'long_day_hours', 8);
  const minLongDayBreak = numberParam(context.rule, 'min_total_break_minutes_long_day', 30);

  for (const group of doegnGroups(effectiveShifts(context.shifts))) {
    const workedHours = group.workedMinutes / 60;
    const breakMinutes = group.shifts.reduce((sum, shift) => sum + shift.breakMinutes, 0);
    const times = group.shifts.map((shift) => `${shift.start}–${shift.end}`).join(', ');

    const noBreakAtAll = workedHours > requiredAfter && breakMinutes === 0;
    const tooShort = workedHours >= longDay && breakMinutes > 0 && breakMinutes < minLongDayBreak;
    if (!noBreakAtAll && !tooShort) continue;

    flags.push(
      buildFlag(context, {
        key: `${group.date}:${group.startInstant}`,
        title: noBreakAtAll
          ? `Ingen pause registrert på en vakt på ${formatHours(workedHours)}`
          : `Bare ${breakMinutes} minutter pause på en vakt på ${formatHours(workedHours)}`,
        periodLabel: formatDateLong(group.date),
        periodStart: group.date,
        periodEnd: group.date,
        message: noBreakAtAll
          ? `Jobber du mer enn ${formatHours(requiredAfter)}, har du krav på minst én pause. ` +
            `${formatDateLong(group.date)} er du satt opp på ${formatHours(workedHours)} (${times}) uten at ` +
            `det er registrert pause. Ofte er pausen tatt, men ikke ført. Fikk du ikke pause — eller fikk du ` +
            `ikke forlate arbeidsplassen — skal tiden regnes som arbeidstid og betales.`
          : `Er vakta minst ${formatHours(longDay)}, skal pausene til sammen være minst ${minLongDayBreak} minutter. ` +
            `${formatDateLong(group.date)} er det registrert ${breakMinutes} minutter på ${formatHours(workedHours)} (${times}).`,
        evidence: [
          ev('Dato', formatDateLong(group.date)),
          ev('Vakt', times),
          ev('Arbeidstid', formatHours(workedHours)),
          ev('Registrert pause', `${breakMinutes} minutter`),
          ev('Lovens krav', noBreakAtAll
            ? `Minst én pause når dagen er over ${formatHours(requiredAfter)}`
            : `Minst ${minLongDayBreak} minutter når dagen er minst ${formatHours(longDay)}`),
        ],
        amountOre: null,
        documentRefs: refsFromShifts(group.shifts),
      }),
    );
  }

  return flags;
};
