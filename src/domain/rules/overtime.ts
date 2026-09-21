/**
 * Rule: overtime (AML § 10-4 and § 10-6), and the difference between overtime and merarbeid.
 *
 * Three things are checked:
 *  1. hours beyond the normal limits (9 t per arbeidsdøgn, 40 t per week) must be paid with
 *     at least a 40 % supplement;
 *  2. merarbeid — hours above your own contract but inside the normal limits — is explained,
 *     because it is paid at ordinary rate and people often expect overtime pay for it;
 *  3. the volume limits in § 10-6(4) (10 t per week, 25 t per 4 weeks, 200 t per 52 weeks).
 *
 * Money: this rule claims **only the supplement**. If the hours were not paid at all, the
 * base pay is claimed by `scheduled_vs_paid`, so the two never double count.
 */
import { effectiveShifts } from '../aggregate';
import { formatHours, formatKr, formatPercent, hoursTimesRate, roundHours } from '../money';
import {
  dailyLimit as resolveDailyLimit,
  maxOvertimePer4Weeks,
  maxOvertimePer52Weeks,
  maxOvertimePer7Days,
  overtimeSupplementPercent as resolveSupplementPercent,
  weeklyLimit as resolveWeeklyLimit,
  withSource,
} from '../thresholds';
import { OVERTIME_CATEGORIES, type DateStr, type Flag } from '../schemas';
import { doegnGroups, formatDateLong, isWithin, toEpochDay } from '../time';
import {
  buildFlag,
  contractRef,
  ev,
  isComplete,
  numberParam,
  refsFromPayslip,
  refsFromSegments,
  hoursTimesRateCalculation,
} from './helpers';
import type { RuleContext, RuleFn } from './types';

interface DoegnExcess {
  date: DateStr;
  workedHours: number;
  excessHours: number;
}

/** Overtime from working more than the daily limit, per arbeidsdøgn (24 h from work start). */
function dailyExcesses(context: RuleContext, dailyLimit: number, tolerance: number): DoegnExcess[] {
  const newPeriodAfterRestHours = numberParam(context.rule, 'new_period_after_rest_hours', 11);
  return doegnGroups(effectiveShifts(context.workTimeShifts), { newPeriodAfterRestHours })
    .map((group) => {
      const workedHours = group.workedMinutes / 60;
      return { date: group.date, workedHours, excessHours: roundHours(workedHours - dailyLimit) };
    })
    .filter((entry) => entry.excessHours > tolerance);
}

export const overtime: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const range = context.dataRange;
  if (!range) return flags;

  // The contract governs; the law is the fallback and, for the supplement, the floor.
  const daily = resolveDailyLimit(context.contract, context.rule);
  const weekly = resolveWeeklyLimit(context.contract, context.rule);
  const supplement = resolveSupplementPercent(context.contract, context.rule);
  const dailyLimit = daily.value;
  const weeklyLimit = weekly.value;
  const supplementPercent = supplement.value;
  const tolerance = numberParam(context.rule, 'tolerance_hours', 0.25);
  const rate = context.hourlyRateOre;

  const excesses = dailyExcesses(context, dailyLimit, tolerance);

  /* ----------------- kontraktsvilkår som er svakere enn loven tillater */
  if (supplement.belowStatutory) {
    flags.push(
      buildFlag(context, {
        key: 'tillegg-under-lovens-minimum',
        severity: 'bor_sjekkes',
        title: 'Kontrakten lover mindre overtidstillegg enn loven krever',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Kontrakten din oppgir ${formatPercent(supplement.belowStatutory.contractValue)} i overtidstillegg. ` +
          `Loven krever minst ${formatPercent(supplement.belowStatutory.statutory)}, og et dårligere vilkår i ` +
          `en arbeidsavtale er ikke gyldig. Vi har derfor regnet med ` +
          `${formatPercent(supplement.belowStatutory.statutory)}. Dette er verdt å ta opp uansett hva ` +
          `lønnsslippene viser.`,
        evidence: [
          ev('Tillegg i kontrakten', formatPercent(supplement.belowStatutory.contractValue)),
          ev('Lovens minimum', formatPercent(supplement.belowStatutory.statutory)),
          ev('Brukt i utregningene', formatPercent(supplementPercent)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* --------- høyere arbeidstidsgrense enn loven, uten gjennomsnittsberegning */
  const statutoryDaily = numberParam(context.rule, 'normal_daily_limit_hours', 9);
  const statutoryWeekly = numberParam(context.rule, 'normal_weekly_limit_hours', 40);
  if (
    !context.contract.averagingAgreement &&
    ((daily.source === 'kontrakt' && daily.value > statutoryDaily) ||
      (weekly.source === 'kontrakt' && weekly.value > statutoryWeekly))
  ) {
    flags.push(
      buildFlag(context, {
        key: 'hoyere-grense-uten-avtale',
        severity: 'bor_sjekkes',
        title: 'Kontrakten har høyere arbeidstidsgrense enn lovens hovedregel',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Vi regner med ${formatHours(dailyLimit)} per døgn og ${formatHours(weeklyLimit)} per uke, fordi det ` +
          `er det kontrakten din sier. Lovens hovedregel er ${formatHours(statutoryDaily)} og ` +
          `${formatHours(statutoryWeekly)}. Høyere grenser krever som regel skriftlig avtale om ` +
          `gjennomsnittsberegning, og du har ikke krysset av for at kontrakten har en slik avtale. ` +
          `Sjekk om det står noe om gjennomsnittsberegning i avtalen din — det avgjør hvor mye som er overtid.`,
        evidence: [
          ev('Grense per døgn', withSource(formatHours(dailyLimit), daily)),
          ev('Grense per uke', withSource(formatHours(weeklyLimit), weekly)),
          ev('Lovens hovedregel', `${formatHours(statutoryDaily)} per døgn, ${formatHours(statutoryWeekly)} per uke`),
          ev('Gjennomsnittsberegning avtalt', 'Nei'),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /** Extra overtime that only shows up when the whole week is added together. */
  const extraWeeklyByWeek = new Map<string, number>();
  const overtimeByWeek = new Map<string, number>();
  const merarbeidByWeek = new Map<string, number>();

  for (const week of context.weeks) {
    if (!isComplete(week, range)) continue;
    const dailyInWeek = excesses
      .filter((entry) => isWithin(entry.date, week.start, week.end))
      .reduce((sum, entry) => sum + entry.excessHours, 0);
    const weeklyExcess = Math.max(0, roundHours(week.workedHours - weeklyLimit));
    const total = Math.max(dailyInWeek, weeklyExcess);

    overtimeByWeek.set(week.key, total);
    extraWeeklyByWeek.set(week.key, roundHours(total - dailyInWeek));

    const withinNormal = Math.min(week.workedHours, weeklyLimit);
    const merarbeid = Math.max(0, roundHours(withinNormal - context.contractedWeeklyHours));
    if (merarbeid > tolerance) merarbeidByWeek.set(week.key, merarbeid);
  }

  /* --------------------------------- 1. manglende overtidstillegg per lønnsperiode */
  for (const summary of context.summaries) {
    const { periodStart, periodEnd } = summary.payslip;

    const dailyInPeriod = excesses
      .filter((entry) => isWithin(entry.date, periodStart, periodEnd))
      .reduce((sum, entry) => sum + entry.excessHours, 0);
    const extraWeekly = context.weeks
      .filter((week) => week.start >= periodStart && week.end <= periodEnd)
      .reduce((sum, week) => sum + (extraWeeklyByWeek.get(week.key) ?? 0), 0);

    const computed = roundHours(dailyInPeriod + extraWeekly);
    if (computed <= tolerance) continue;

    const missing = roundHours(computed - summary.paidOvertimeHours);
    if (missing <= tolerance) continue;

    const calculation = hoursTimesRateCalculation(missing, rate, {
      factor: supplementPercent / 100,
      factorLabel: formatPercent(supplementPercent),
    });

    const detail = excesses
      .filter((entry) => isWithin(entry.date, periodStart, periodEnd))
      .map((entry) =>
        ev(
          formatDateLong(entry.date),
          `${formatHours(entry.workedHours)} jobbet, ${formatHours(entry.excessHours)} over grensen på ${formatHours(dailyLimit)}`,
        ),
      );

    flags.push(
      buildFlag(context, {
        key: summary.payslip.id,
        title: 'Overtidstillegg mangler',
        periodLabel: summary.label,
        periodStart,
        periodEnd,
        message:
          `Vi regner ${formatHours(computed)} som overtid i denne perioden, mens lønnsslippen viser ` +
          `${formatHours(summary.paidOvertimeHours)} overtid. Overtid skal ha ` +
          `${formatPercent(supplementPercent)} tillegg på toppen av vanlig timelønn ` +
          `(${supplement.label}). ` +
          `Her er bare selve tillegget regnet med — er timene heller ikke betalt som vanlige timer, ` +
          `kommer grunnlønna i tillegg (se «Er alle timene du jobbet betalt?»).`,
        evidence: [
          ev('Grense per arbeidsdøgn', withSource(formatHours(dailyLimit), daily)),
          ev('Grense per uke', withSource(formatHours(weeklyLimit), weekly)),
          ev('Overtid vi regner ut', formatHours(computed)),
          ev('Overtid på lønnsslippen', formatHours(summary.paidOvertimeHours)),
          ev('Mangler', formatHours(missing)),
          ev('Timelønn', formatKr(rate)),
          ev('Tillegg', withSource(formatPercent(supplementPercent), supplement)),
          ...detail,
        ],
        calculation,
        amountOre: calculation.resultOre,
        documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
      }),
    );
  }

  /* ------------------------- 1b. overtidstimer betalt med for lav sats */
  const requiredOvertimeRate = Math.round(rate * (1 + supplementPercent / 100));
  const rateTolerance = numberParam(context.rule, 'rate_tolerance_ore', 50);

  for (const summary of context.summaries) {
    for (const line of summary.payslip.lines) {
      if (!OVERTIME_CATEGORIES.includes(line.category as (typeof OVERTIME_CATEGORIES)[number])) continue;
      if (line.rateOre === null || line.hours === null || line.hours <= 0) continue;
      const shortfallPerHour = requiredOvertimeRate - line.rateOre;
      if (shortfallPerHour <= rateTolerance) continue;

      const amountOre = hoursTimesRate(line.hours, shortfallPerHour);
      flags.push(
        buildFlag(context, {
          key: `sats:${summary.payslip.id}:${line.id}`,
          title: 'Overtiden er betalt med for lav sats',
          periodLabel: summary.label,
          periodStart: summary.payslip.periodStart,
          periodEnd: summary.payslip.periodEnd,
          message:
            `Med timelønn ${formatKr(rate)} og ${formatPercent(supplementPercent)} tillegg ` +
            `(${supplement.label}) skal overtidstimene betales med ${formatKr(requiredOvertimeRate)}. ` +
            `Linja «${line.label}» er betalt med ${formatKr(line.rateOre)}. Differansen er ` +
            `${formatKr(shortfallPerHour)} per time for ${formatHours(line.hours)}.`,
          evidence: [
            ev('Timelønn', formatKr(rate)),
            ev('Tillegg', withSource(formatPercent(supplementPercent), supplement)),
            ev('Sats overtiden skal ha', formatKr(requiredOvertimeRate)),
            ev('Sats på lønnsslippen', formatKr(line.rateOre)),
            ev('Timer på linja', formatHours(line.hours)),
          ],
          calculation: {
            expression: `${formatHours(line.hours)} × (${formatKr(requiredOvertimeRate)} − ${formatKr(line.rateOre)}) = ${formatKr(amountOre)}`,
            resultOre: amountOre,
          },
          amountOre,
          documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
        }),
      );
    }
  }

  /* ------------------------------------------------- 2. merarbeid, forklart én gang */
  if (merarbeidByWeek.size > 0 && context.contractedWeeklyHours < weeklyLimit) {
    const total = roundHours([...merarbeidByWeek.values()].reduce((a, b) => a + b, 0));
    const weeks = context.weeks.filter((week) => merarbeidByWeek.has(week.key));
    const first = weeks[0]!;
    const last = weeks[weeks.length - 1]!;

    flags.push(
      buildFlag(context, {
        key: 'merarbeid',
        severity: 'til_info',
        title: `${formatHours(total)} merarbeid — ikke det samme som overtid`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Du har jobbet ${formatHours(total)} mer enn kontrakten din på ` +
          `${formatHours(context.contractedWeeklyHours)} i uka, men fortsatt innenfor lovens grenser ` +
          `(${formatHours(dailyLimit)} per døgn og ${formatHours(weeklyLimit)} per uke). ` +
          `Det kalles merarbeid. Merarbeid skal betales som vanlige timer, men gir ikke krav på ` +
          `overtidstillegg etter loven. Har du jobbet jevnlig merarbeid i tolv måneder, kan du ha rett ` +
          `til en større stilling — se den egne flagget om det.`,
        evidence: [
          ev('Avtalt arbeidstid', formatHours(context.contractedWeeklyHours)),
          ev('Grense per døgn', withSource(formatHours(dailyLimit), daily)),
          ev('Grense per uke', withSource(formatHours(weeklyLimit), weekly)),
          ev('Merarbeid til sammen', formatHours(total)),
          ev('Uker med merarbeid', String(merarbeidByWeek.size)),
          ...weeks.slice(0, 8).map((week) =>
            ev(week.label, `${formatHours(week.workedHours)} jobbet, ${formatHours(merarbeidByWeek.get(week.key)!)} over avtalt`),
          ),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* --------------------------------------------- 3. grensene for hvor mye overtid */
  const per7Days = maxOvertimePer7Days(context.contract, context.rule);
  const per4Weeks = maxOvertimePer4Weeks(context.contract, context.rule);
  const per52Weeks = maxOvertimePer52Weeks(context.contract, context.rule);
  const maxPerWeek = per7Days.value;
  const maxPer4Weeks = per4Weeks.value;
  const maxPer52Weeks = per52Weeks.value;

  for (const week of context.weeks) {
    const hours = overtimeByWeek.get(week.key) ?? 0;
    if (hours <= maxPerWeek) continue;
    flags.push(
      buildFlag(context, {
        key: `grense-uke:${week.key}`,
        severity: 'bor_sjekkes',
        title: 'Mer overtid enn loven tillater i løpet av sju dager',
        periodLabel: week.label,
        periodStart: week.start,
        periodEnd: week.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPerWeek)} i løpet av sju dager. ` +
          `I ${week.label.toLowerCase()} regner vi ${formatHours(hours)} overtid. Høyere grenser kan følge av ` +
          `avtale med tillitsvalgte eller tillatelse fra Arbeidstilsynet.`,
        evidence: [
          ev('Overtid denne uka', formatHours(hours)),
          ev('Grensen vi måler mot', withSource(formatHours(maxPerWeek), per7Days)),
        ],
        amountOre: null,
        documentRefs: refsFromSegments(context.effective.filter((s) => isWithin(s.date, week.start, week.end))),
      }),
    );
  }

  const completeWeeks = context.weeks.filter((week) => isComplete(week, range));
  for (let i = 0; i + 3 < completeWeeks.length; i += 1) {
    const window = completeWeeks.slice(i, i + 4);
    const first = window[0]!;
    const last = window[3]!;
    // Only a genuinely consecutive four-week window counts.
    if (toEpochDay(last.start) - toEpochDay(first.start) !== 21) continue;
    const hours = roundHours(window.reduce((sum, week) => sum + (overtimeByWeek.get(week.key) ?? 0), 0));
    if (hours <= maxPer4Weeks) continue;
    flags.push(
      buildFlag(context, {
        key: `grense-4uker:${first.key}`,
        severity: 'bor_sjekkes',
        title: `Mer enn ${formatHours(maxPer4Weeks)} overtid på fire uker`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPer4Weeks)} i fire sammenhengende uker. ` +
          `Fra ${first.label.toLowerCase()} til ${last.label.toLowerCase()} regner vi ${formatHours(hours)}.`,
        evidence: [
          ev('Overtid i perioden', formatHours(hours)),
          ev('Grensen vi måler mot', withSource(formatHours(maxPer4Weeks), per4Weeks)),
        ],
        amountOre: null,
      }),
    );
    break; // one flag is enough to make the point
  }

  const totalOvertime = roundHours(completeWeeks.reduce((sum, week) => sum + (overtimeByWeek.get(week.key) ?? 0), 0));
  if (totalOvertime > maxPer52Weeks) {
    const first = completeWeeks[0]!;
    const last = completeWeeks[completeWeeks.length - 1]!;
    flags.push(
      buildFlag(context, {
        key: 'grense-52uker',
        severity: 'bor_sjekkes',
        title: `Mer enn ${formatHours(maxPer52Weeks)} overtid i perioden`,
        periodLabel: `${first.label} – ${last.label}`,
        periodStart: first.start,
        periodEnd: last.end,
        message:
          `Overtid skal som hovedregel ikke overstige ${formatHours(maxPer52Weeks)} i løpet av 52 uker. ` +
          `I dataene dine regner vi ${formatHours(totalOvertime)}.`,
        evidence: [
          ev('Overtid til sammen', formatHours(totalOvertime)),
          ev('Grensen vi måler mot', withSource(formatHours(maxPer52Weeks), per52Weeks)),
        ],
        amountOre: null,
      }),
    );
  }

  return flags;
};

export { dailyExcesses };
