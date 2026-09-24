/**
 * Rule: Sunday and public-holiday work (AML § 10-10, § 10-8 fjerde ledd).
 *
 * Work on a Sunday or public holiday is not permitted unless the nature of the work makes it
 * necessary — which it often is in a café or a shop — so the flag is about the *pattern*: you
 * are entitled to time off every other Sunday, and a written agreement is needed for anything
 * denser than that.
 */
import { effectiveShifts, segmentsOf } from '../aggregate';
import { holidayName, isHoliday } from '../holidays';
import { formatHours, roundHours } from '../money';
import type { DateStr, Flag } from '../schemas';
import { formatDateLong, weekdayIso } from '../time';
import { buildFlag, contractRef, ev, numberParam, refsFromSegments } from './helpers';
import type { RuleContext, RuleFn } from './types';

interface SundayWorked {
  date: DateStr;
  hours: number;
  holiday: string | null;
}

export const sundayWork: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const range = context.dataRange;
  if (!range) return flags;

  const minFreeShare = numberParam(context.rule, 'free_share_of_sundays', 0.5);
  const toleranceHours = numberParam(context.rule, 'tolerance_hours', 0.25);

  const segments = segmentsOf(effectiveShifts(context.workTimeShifts));
  const byDate = new Map<DateStr, number>();
  for (const segment of segments) {
    if (weekdayIso(segment.date) !== 7 && !isHoliday(segment.date)) continue;
    byDate.set(segment.date, (byDate.get(segment.date) ?? 0) + segment.workedMinutes / 60);
  }

  const worked: SundayWorked[] = [...byDate.entries()]
    .filter(([, hours]) => hours > toleranceHours)
    .map(([date, hours]) => ({ date, hours: roundHours(hours), holiday: holidayName(date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (worked.length === 0) return flags;

  /* --------------- hvor mange av søn- og helgedagene i perioden ble jobbet? */
  const allSundaysAndHolidays: DateStr[] = [];
  for (let day = range.start; day <= range.end; ) {
    if (weekdayIso(day) === 7 || isHoliday(day)) allSundaysAndHolidays.push(day);
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }

  const total = allSundaysAndHolidays.length;
  const free = total - worked.length;
  const workedTooMany = total > 1 && free < Math.floor(total * minFreeShare);

  // Two Sundays in a row is the clearest breach of "every other Sunday off".
  const consecutive: { first: DateStr; second: DateStr }[] = [];
  for (let i = 1; i < worked.length; i += 1) {
    const previous = worked[i - 1]!;
    const current = worked[i]!;
    const days = (new Date(`${current.date}T00:00:00Z`).getTime() - new Date(`${previous.date}T00:00:00Z`).getTime()) / 86_400_000;
    if (weekdayIso(previous.date) === 7 && weekdayIso(current.date) === 7 && days === 7) {
      consecutive.push({ first: previous.date, second: current.date });
    }
  }

  if (consecutive.length === 0 && !workedTooMany) {
    return [
      buildFlag(context, {
        key: 'sondagsarbeid',
        severity: 'til_info',
        title: `Du har jobbet ${worked.length} søn- eller helgedager`,
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Arbeid på søn- og helgedager er bare tillatt når arbeidets art gjør det nødvendig — i ` +
          `servering, butikk og omsorg er det ofte tilfelle. Du har krav på fri annenhver søn- og ` +
          `helgedag, og det ser ut til å være oppfylt her. Har du jobbet på en søndag, skal du ha fri ` +
          `den følgende søn- eller helgedagen.`,
        evidence: [
          ev('Søn- og helgedager i perioden', String(total)),
          ev('Jobbet', String(worked.length)),
          ev('Fri', String(free)),
          ...worked
            .slice(0, 8)
            .map((entry) =>
              ev(formatDateLong(entry.date), `${formatHours(entry.hours)}${entry.holiday ? ` (${entry.holiday})` : ''}`),
            ),
        ],
        amountOre: null,
        documentRefs: refsFromSegments(segments.filter((s) => byDate.has(s.date))),
      }),
    ];
  }

  const agreed = context.contract.sundayWorkAgreement;
  flags.push(
    buildFlag(context, {
      key: 'annenhver-sondag',
      severity: agreed ? 'til_info' : 'bor_sjekkes',
      title:
        consecutive.length > 0
          ? 'Du har jobbet flere søndager på rad'
          : 'Du har jobbet mer enn annenhver søn- og helgedag',
      periodLabel: 'Hele perioden',
      periodStart: range.start,
      periodEnd: range.end,
      message:
        `Du skal ha arbeidsfri annenhver søn- og helgedag. Vi finner ${worked.length} av ${total} ` +
        `søn- og helgedager jobbet i perioden` +
        (consecutive.length > 0
          ? `, blant annet ${formatDateLong(consecutive[0]!.first)} og ${formatDateLong(consecutive[0]!.second)} rett etter hverandre.`
          : '.') +
        ` Arbeidsgiver og arbeidstaker kan avtale skriftlig en ordning som i gjennomsnitt gir fri ` +
        `annenhver søn- og helgedag over 26 uker, forutsatt at den ukentlige friperioden faller på en ` +
        `søn- eller helgedag minst hver fjerde uke. ` +
        (agreed
          ? `Du har oppgitt at det finnes en slik skriftlig avtale, så dette er til informasjon.`
          : `Du har ikke oppgitt en slik avtale — sjekk om den finnes, og hva den sier.`),
      evidence: [
        ev('Søn- og helgedager i perioden', String(total)),
        ev('Jobbet', String(worked.length)),
        ev('Fri', String(free)),
        ev('Søndager på rad', String(consecutive.length)),
        ev('Skriftlig avtale oppgitt', agreed ? 'Ja' : 'Nei'),
        ...worked
          .slice(0, 8)
          .map((entry) =>
            ev(formatDateLong(entry.date), `${formatHours(entry.hours)}${entry.holiday ? ` (${entry.holiday})` : ''}`),
          ),
      ],
      amountOre: null,
      documentRefs: [...contractRef(context), ...refsFromSegments(segments.filter((s) => byDate.has(s.date)))],
    }),
  );

  return flags;
};
