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
import {
  breakRequiredAfterHours as resolveBreakRequiredAfter,
  longDayHours as resolveLongDay,
  minBreakMinutesLongDay as resolveMinBreak,
  withSource,
} from '../thresholds';
import { buildFlag, contractRef, ev, numberParam, refsFromShifts } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const breaks: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const requiredAfterThreshold = resolveBreakRequiredAfter(context.contract, context.rule);
  const longDayThreshold = resolveLongDay(context.contract, context.rule);
  const minBreakThreshold = resolveMinBreak(context.contract, context.rule);
  const requiredAfter = requiredAfterThreshold.value;
  const longDay = longDayThreshold.value;
  const minLongDayBreak = minBreakThreshold.value;
  const newPeriodAfterRestHours = numberParam(context.rule, 'new_period_after_rest_hours', 11);

  /* ------------- kontraktsvilkår som er dårligere enn loven tillater */
  for (const threshold of [requiredAfterThreshold, longDayThreshold, minBreakThreshold]) {
    if (!threshold.belowStatutory || !context.dataRange) continue;
    flags.push(
      buildFlag(context, {
        key: `avtale-darligere-enn-loven:${threshold.belowStatutory.contractValue}:${threshold.belowStatutory.statutory}`,
        severity: 'bor_sjekkes',
        title: 'Kontrakten gir dårligere pauserett enn loven',
        periodLabel: 'Hele perioden',
        periodStart: context.dataRange.start,
        periodEnd: context.dataRange.end,
        message:
          `Kontrakten din setter en pausegrense på ${threshold.belowStatutory.contractValue}, der loven ` +
          `krever ${threshold.belowStatutory.statutory}. Et dårligere vilkår i en arbeidsavtale er ikke ` +
          `gyldig, så vi har regnet med lovens krav.`,
        evidence: [
          ev('Avtalt i kontrakten', String(threshold.belowStatutory.contractValue)),
          ev('Lovens krav', String(threshold.belowStatutory.statutory)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  // Hours come from the paid-break view (a paid break is working time); the registered break
  // itself is read from the original records, so a missing break is still visible.
  const registeredBreakById = new Map(context.shifts.map((shift) => [shift.id, shift.breakMinutes]));

  for (const group of doegnGroups(effectiveShifts(context.workTimeShifts), { newPeriodAfterRestHours })) {
    const workedHours = group.workedMinutes / 60;
    const breakMinutes = group.shifts.reduce(
      (sum, shift) => sum + (registeredBreakById.get(shift.id) ?? shift.breakMinutes),
      0,
    );
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
          ev('Kravet vi måler mot', noBreakAtAll
            ? withSource(`Minst én pause når dagen er over ${formatHours(requiredAfter)}`, requiredAfterThreshold)
            : withSource(`Minst ${minLongDayBreak} minutter når dagen er minst ${formatHours(longDay)}`, minBreakThreshold)),
          ev('Pausen er betalt', context.contract.paidBreak ? 'Ja, den regnes som arbeidstid' : 'Nei'),
        ],
        amountOre: null,
        documentRefs: refsFromShifts(group.shifts),
      }),
    );
  }

  return flags;
};
