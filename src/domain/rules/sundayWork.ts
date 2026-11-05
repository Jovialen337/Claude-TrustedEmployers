/**
 * Rule: Sunday and public-holiday work (AML § 10-10, § 10-8 fjerde ledd).
 *
 * Work on a Sunday or public holiday is not permitted unless the nature of the work makes it
 * necessary — which it often is in a café or a shop — so the flag is about the *pattern*: you
 * are entitled to time off every other Sunday, and a written agreement is needed for anything
 * denser than that.
 *
 * What counts as søn- og helgedagsarbeid is § 10-10 første ledd's own definition, not the
 * calendar day: from 18:00 the day before until 22:00 the day before the next virkedag, and
 * from 15:00 on julaften, påskeaften and pinseaften. `sundayWorkWindows` builds those windows;
 * this rule only asks how much of each shift falls inside one. Reading it as "the date is a
 * Sunday" missed every Saturday evening from 18:00, which in a café or a shop is most of them.
 */
import { effectiveShifts, segmentsOf } from '../aggregate';
import { holidayName, sundayWorkMinutes, sundayWorkWindows } from '../holidays';
import { formatHours, roundHours } from '../money';
import type { DateStr, Flag } from '../schemas';
import { formatDateLong, toEpochDay } from '../time';
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

  const windows = sundayWorkWindows(range.start, range.end);
  const segments = segmentsOf(effectiveShifts(context.workTimeShifts));
  const byDate = new Map<DateStr, number>();
  for (const segment of segments) {
    const protectedMinutes = sundayWorkMinutes(
      segment.date,
      segment.startMin,
      segment.endMin,
      windows,
    );
    if (protectedMinutes === 0) continue;
    // Breaks are spread across the shift, so scale them by the share that falls in the window.
    const share = segment.grossMinutes === 0 ? 0 : protectedMinutes / segment.grossMinutes;
    const worked = protectedMinutes - segment.breakMinutes * share;
    byDate.set(segment.date, (byDate.get(segment.date) ?? 0) + Math.max(0, worked) / 60);
  }

  const worked: SundayWorked[] = [...byDate.entries()]
    .filter(([, hours]) => hours > toleranceHours)
    .map(([date, hours]) => ({ date, hours: roundHours(hours), holiday: holidayName(date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (worked.length === 0) return flags;

  /*
   * Telt i vinduer, ikke i datoer.
   *
   * § 10-10 første ledd verner en *periode* — lørdag 18:00 til søndag 22:00, eller julaften
   * 15:00 gjennom hele julehelga — så vinduet er enheten loven bruker, og den eneste enheten
   * de to sidene av sammenligningen kan dele. Å telle jobbede *datoer* mot kalendersøndager
   * blandet de to: en lørdagskveld og søndagen etter ble to jobbede dager mot én søndag, og
   * det ga «8 av 4 søn- og helgedager» og «Fri: −4». Det skjulte også søndager på rad, fordi
   * lørdagene lå imellom i lista.
   */
  const workedDates = new Set(worked.map((entry) => entry.date));
  const workedWindows = windows.filter((window) =>
    [...workedDates].some((date) => date >= window.fromDate && date <= window.toDate),
  );

  const total = windows.length;
  const free = total - workedWindows.length;
  const workedTooMany = total > 1 && free < Math.floor(total * minFreeShare);

  /*
   * To vernede perioder på rad er det tydeligste bruddet på «fri annenhver søn- og helgedag».
   * Sammenlignet vindu mot vindu: forrige versjon sammenlignet nabooppføringer i en liste som
   * også holdt lørdagskvelder, så fire søndager på rad gikk upåaktet hen i det øyeblikket
   * arbeidstakeren også hadde jobbet lørdagskveldene — strengt tatt mer § 10-10-arbeid
   * rapportert som mindre.
   */
  const consecutive: { first: DateStr; second: DateStr }[] = [];
  for (let i = 1; i < workedWindows.length; i += 1) {
    const previous = workedWindows[i - 1]!;
    const current = workedWindows[i]!;
    const gap = toEpochDay(current.toDate) - toEpochDay(previous.toDate);
    // Helger på rad: neste vernede periode, omtrent en uke etter.
    if (gap >= 5 && gap <= 9) {
      consecutive.push({ first: previous.toDate, second: current.toDate });
    }
  }

  if (consecutive.length === 0 && !workedTooMany) {
    return [
      buildFlag(context, {
        key: 'sondagsarbeid',
        severity: 'til_info',
        title: `Du har jobbet ${workedWindows.length} søn- eller helgedager`,
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
          ev('Jobbet', String(workedWindows.length)),
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
        `Du skal ha arbeidsfri annenhver søn- og helgedag. Vi finner ${workedWindows.length} av ${total} ` +
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
        ev('Jobbet', String(workedWindows.length)),
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
