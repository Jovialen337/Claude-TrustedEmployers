/**
 * Rule: night work (AML § 10-11).
 *
 * Night is 21:00–06:00. Night work is not permitted unless the nature of the work makes it
 * necessary, and someone who regularly works more than three hours at night is a
 * "nattarbeidstaker", whose normal working hours must average at most 8 hours per 24 hours
 * measured over four weeks.
 */
import { effectiveShifts, segmentsOf } from '../aggregate';
import { formatHours, roundHours } from '../money';
import type { DateStr, Flag } from '../schemas';
import { doegnGroups, formatDateLong, windowOverlapMinutes, parseTime } from '../time';
import { buildFlag, contractRef, ev, numberParam, refsFromSegments } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const nightWork: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const range = context.dataRange;
  if (!range) return flags;

  const fromMin = parseTime(
    typeof context.rule.params.night_from === 'string' ? context.rule.params.night_from : '21:00',
  );
  const toMin = parseTime(
    typeof context.rule.params.night_to === 'string' ? context.rule.params.night_to : '06:00',
  );
  const nightWorkerThreshold = numberParam(context.rule, 'night_worker_hours_per_shift', 3);
  const maxAverage = numberParam(context.rule, 'max_average_hours_per_24h', 8);
  const averagingWeeks = numberParam(context.rule, 'averaging_weeks', 4);

  const segments = segmentsOf(effectiveShifts(context.workTimeShifts));
  const nightByDate = new Map<DateStr, number>();
  let nightMinutes = 0;

  for (const segment of segments) {
    const overlap = windowOverlapMinutes(segment, fromMin, toMin);
    if (overlap <= 0) continue;
    const workedShare = segment.grossMinutes > 0 ? segment.workedMinutes / segment.grossMinutes : 0;
    const minutes = overlap * workedShare;
    nightMinutes += minutes;
    nightByDate.set(segment.date, (nightByDate.get(segment.date) ?? 0) + minutes);
  }

  if (nightMinutes <= 0) return flags;

  const nightHours = roundHours(nightMinutes / 60);
  const nightDocs = refsFromSegments(segments.filter((segment) => nightByDate.has(segment.date)));

  /* ------------------------------ er du nattarbeidstaker etter loven? */
  const groups = doegnGroups(effectiveShifts(context.workTimeShifts), {
    newPeriodAfterRestHours: numberParam(context.rule, 'new_period_after_rest_hours', 11),
  });
  const nightShifts = groups.filter((group) => {
    const minutes = group.shifts
      .flatMap((shift) => segments.filter((segment) => segment.shift.id === shift.id))
      .reduce((sum, segment) => {
        const overlap = windowOverlapMinutes(segment, fromMin, toMin);
        const workedShare = segment.grossMinutes > 0 ? segment.workedMinutes / segment.grossMinutes : 0;
        return sum + overlap * workedShare;
      }, 0);
    return minutes / 60 > nightWorkerThreshold;
  });

  const isNightWorker = nightShifts.length >= numberParam(context.rule, 'regular_night_shifts', 3);

  flags.push(
    buildFlag(context, {
      key: 'nattarbeid',
      // A late-evening shift that runs an hour past 21:00 is night work by the letter of
      // § 10-11, but flagging every café closing shift as something to check would bury the
      // findings that matter. Only a night worker under the statute gets more than a note.
      severity: isNightWorker && !context.contract.nightWorkAgreement ? 'bor_sjekkes' : 'til_info',
      title: `${formatHours(nightHours)} nattarbeid i perioden`,
      periodLabel: 'Hele perioden',
      periodStart: range.start,
      periodEnd: range.end,
      message:
        `Arbeid mellom kl. ${context.rule.params.night_from ?? '21:00'} og kl. ` +
        `${context.rule.params.night_to ?? '06:00'} er nattarbeid. Nattarbeid er ikke tillatt med mindre ` +
        `arbeidets art gjør det nødvendig, og arbeidsgiver skal drøfte behovet med tillitsvalgte før det ` +
        `settes i gang. ` +
        (isNightWorker
          ? `Du har ${nightShifts.length} vakter med mer enn ${formatHours(nightWorkerThreshold)} nattarbeid, ` +
            `og regnes da som nattarbeidstaker. Da skal den alminnelige arbeidstiden din i gjennomsnitt ikke ` +
            `overstige ${formatHours(maxAverage)} i løpet av 24 timer, målt over ${averagingWeeks} uker.`
          : `Du har ikke nok nattvakter til å regnes som nattarbeidstaker etter loven.`) +
        ` Tillegg for nattarbeid følger av kontrakt eller tariffavtale, ikke av loven — legg inn nattillegget ` +
        `ditt hvis du har et, så regner vi på det.`,
      evidence: [
        ev('Nattarbeid til sammen', formatHours(nightHours)),
        ev('Netter med arbeid', String(nightByDate.size)),
        ev('Vakter med mer enn 3 t natt', String(nightShifts.length)),
        ev('Regnes som nattarbeidstaker', isNightWorker ? 'Ja' : 'Nei'),
        ev('Avtale om nattarbeid oppgitt', context.contract.nightWorkAgreement ? 'Ja' : 'Nei'),
        ...[...nightByDate.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([date, minutes]) => ev(formatDateLong(date), formatHours(roundHours(minutes / 60)))),
      ],
      amountOre: null,
      documentRefs: [...nightDocs, ...contractRef(context)],
    }),
  );

  /* ------------------- 8 timer i snitt per 24 timer over fire uker */
  if (isNightWorker) {
    const windows = context.weeks.filter(
      (week) => context.dataRange !== null && week.start >= context.dataRange.start && week.end <= context.dataRange.end,
    );
    for (let i = 0; i + averagingWeeks - 1 < windows.length; i += 1) {
      const window = windows.slice(i, i + averagingWeeks);
      const first = window[0]!;
      const last = window[window.length - 1]!;
      const workedHours = window.reduce((sum, week) => sum + week.workedHours, 0);
      const workDays = new Set(
        segments
          .filter((segment) => segment.date >= first.start && segment.date <= last.end)
          .map((segment) => segment.date),
      ).size;
      if (workDays === 0) continue;
      const averagePerDay = roundHours(workedHours / workDays);
      if (averagePerDay <= maxAverage) continue;

      flags.push(
        buildFlag(context, {
          key: `natt-snitt:${first.key}`,
          severity: 'bor_sjekkes',
          title: `Mer enn ${formatHours(maxAverage)} i snitt per arbeidsdag som nattarbeidstaker`,
          periodLabel: `${first.label} – ${last.label}`,
          periodStart: first.start,
          periodEnd: last.end,
          message:
            `Som nattarbeidstaker skal den alminnelige arbeidstiden din i gjennomsnitt ikke overstige ` +
            `${formatHours(maxAverage)} i løpet av 24 timer, målt over ${averagingWeeks} uker. Fra ` +
            `${first.label.toLowerCase()} til ${last.label.toLowerCase()} er snittet ` +
            `${formatHours(averagePerDay)} per dag du var på jobb. Vi måler per arbeidsdag, ikke per ` +
            `kalenderdøgn, så dette er et signal om å se nærmere på turnusen — ikke en ferdig konklusjon.`,
          evidence: [
            ev('Timer i perioden', formatHours(roundHours(workedHours))),
            ev('Dager på jobb', String(workDays)),
            ev('Snitt per arbeidsdag', formatHours(averagePerDay)),
            ev('Lovens grense', formatHours(maxAverage)),
          ],
          amountOre: null,
        }),
      );
      break;
    }
  }

  return flags;
};
