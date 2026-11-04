/**
 * Rule: is every hour you worked actually paid — in the right category, at the right rate?
 *
 * Compared per payslip period, because a monthly payslip states hours for the whole month
 * and splitting them across weeks would be invented data. The weeks inside the period are
 * still listed as evidence, since the scheduled side *is* known per week.
 *
 * A shift that crosses a period boundary keeps its hours on their own calendar days, but a
 * shortfall can be explained by hours the payslip before it paid for without being able to
 * account for them itself — see `carryInHours`. Without that, a night worker was told six
 * hours were unpaid every single month, when the earlier payslip had paid the whole shift.
 *
 * Money: this rule claims the missing **base** pay. The 40 % overtime supplement is claimed
 * by the overtime rule, and tillegg by the supplements rule, so nothing double counts.
 */
import { carryInHours, explainedByPreviousPeriod, hoursInRange } from '../aggregate';
import { hourlyRateExplanation } from '../derive';
import { formatHours, formatKr, hoursTimesRate, roundHours } from '../money';
import { CATEGORY_LABELS, type Flag, type PayslipCategory } from '../schemas';
import { isWithin } from '../time';
import {
  buildFlag,
  contractRef,
  ev,
  hoursTimesRateCalculation,
  isComplete,
  numberParam,
  refsFromPayslip,
  refsFromSegments,
} from './helpers';
import type { RuleContext, RuleFn } from './types';

const RATE_CHECKED_CATEGORIES: PayslipCategory[] = ['ordinaer', 'merarbeid'];

export const scheduledVsPaid: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const tolerance = numberParam(context.rule, 'tolerance_hours', 0.25);
  const minAmountOre = numberParam(context.rule, 'min_amount_ore', 2000);
  const rateTolerance = numberParam(context.rule, 'rate_tolerance_ore', 50);
  const rate = context.hourlyRateOre;

  /* ------------------------------------------- timer jobbet vs timer betalt */
  /**
   * Hours the previous payslip paid for but has no shifts to account for. They are what a
   * shortfall right after a period boundary is measured against; `context.summaries` is
   * sorted by period start, so the previous iteration is the previous period.
   */
  let unexplainedPaidBefore = 0;

  for (const summary of context.summaries) {
    const { periodStart, periodEnd } = summary.payslip;
    const worked = roundHours(hoursInRange(context.effective, periodStart, periodEnd));
    const paid = roundHours(summary.paidWorkHours);
    const crossing = roundHours(carryInHours(context.effective, periodStart, periodEnd));
    const carriedIn = roundHours(
      explainedByPreviousPeriod(worked - paid, crossing, unexplainedPaidBefore),
    );
    // Set for the next period before anything below can skip the rest of this iteration.
    unexplainedPaidBefore = Math.max(0, roundHours(paid - worked));
    const missing = roundHours(worked - paid - carriedIn);

    /*
     * A fixed monthly salary pays for the month, not for a count of hours, so there are no
     * paid hours on the payslip to compare against. Reading that as "nothing was paid"
     * claimed the worker's entire month back: 30 000 kr paid in full produced a 22 153,80 kr
     * claim marked "sannsynlig feil". For a fastlønn period the hours comparison is simply
     * not available, and saying so is the honest answer.
     */
    const fixedSalary = summary.byCategory.get('fastlonn');
    if (fixedSalary !== undefined && fixedSalary.amountOre > 0) {
      if (worked > tolerance) {
        flags.push(
          buildFlag(context, {
            key: `fastlonn:${summary.payslip.id}`,
            severity: 'til_info',
            title: 'Timene kan ikke sjekkes mot en fast månedslønn',
            periodLabel: summary.label,
            periodStart,
            periodEnd,
            message:
              `Lønnsslippen betaler en fast månedslønn på ${formatKr(fixedSalary.amountOre)}, ikke ` +
              `et antall timer, så vi kan ikke sammenligne time for time. Vaktene dine viser ` +
              `${formatHours(worked)} i perioden. Regnet mot timelønna vi har utledet ` +
              `(${formatKr(rate)}) svarer det til ` +
              `${formatKr(hoursTimesRateCalculation(worked, rate).resultOre)}. Ligger månedslønna ` +
              `under det, er det verdt å se nærmere på — men en fast lønn kan dekke flere eller ` +
              `færre timer fra måned til måned, så dette er ikke et krav.`,
            evidence: [
              ev('Fast månedslønn', formatKr(fixedSalary.amountOre)),
              ev('Jobbet i perioden', formatHours(worked)),
              ev('Timelønn lagt til grunn', `${formatKr(rate)} (${hourlyRateExplanation(context.contract)})`),
              ev('Timene regnet om', formatKr(hoursTimesRateCalculation(worked, rate).resultOre)),
            ],
            amountOre: null,
            documentRefs: refsFromPayslip(summary.payslip),
          }),
        );
      }
      continue;
    }

    if (missing > tolerance) {
      const calculation = hoursTimesRateCalculation(missing, rate);
      if (calculation.resultOre >= minAmountOre) {
        const weekRows = context.weeks
          .filter((week) => week.start >= periodStart && week.end <= periodEnd)
          .map((week) => ev(week.label, `${formatHours(week.workedHours)} jobbet`));
        const paidRows = [...summary.byCategory.entries()]
          .filter(([, total]) => total.hours > 0)
          .map(([category, total]) => ev(CATEGORY_LABELS[category], formatHours(total.hours)));

        flags.push(
          buildFlag(context, {
            key: `timer:${summary.payslip.id}`,
            title: `${formatHours(missing)} jobbet, men ikke betalt`,
            periodLabel: summary.label,
            periodStart,
            periodEnd,
            message:
              `I perioden ${periodStart} – ${periodEnd} viser vaktene dine ${formatHours(worked)}, mens ` +
              `lønnsslippen betaler for ${formatHours(paid)}. Det er ${formatHours(missing)} som ikke ser ut ` +
              `til å være betalt. Her er bare vanlig timelønn regnet med — eventuelt overtidstillegg eller ` +
              `kvelds-/helgetillegg kommer i tillegg og står som egne punkter.`,
            evidence: [
              ev('Jobbet i perioden', formatHours(worked)),
              ev('Betalt i perioden', formatHours(paid)),
              ...(carriedIn > 0
                ? [
                    ev(
                      'Betalt på forrige lønnsslipp',
                      `${formatHours(carriedIn)} fra vakt som startet før perioden`,
                    ),
                  ]
                : []),
              ev('Differanse', formatHours(missing)),
              ev('Timelønn', `${formatKr(rate)} (${hourlyRateExplanation(context.contract)})`),
              ...(context.contract.paidBreak
                ? [ev('Pauser', 'Kontrakten sier at pausene er betalt, så de er regnet som arbeidstid.')]
                : []),
              ...weekRows,
              ...paidRows,
            ],
            calculation,
            amountOre: calculation.resultOre,
            documentRefs: [
              ...refsFromPayslip(summary.payslip),
              ...refsFromSegments(context.effective.filter((s) => isWithin(s.date, periodStart, periodEnd))),
            ],
          }),
        );
      }
    }

    /* ---------------------------------------------------------- feil timesats */
    for (const line of summary.payslip.lines) {
      if (!RATE_CHECKED_CATEGORIES.includes(line.category)) continue;
      if (line.rateOre === null || line.hours === null || line.hours <= 0) continue;
      const shortfallPerHour = rate - line.rateOre;
      if (shortfallPerHour <= rateTolerance) continue;

      const amountOre = hoursTimesRate(line.hours, shortfallPerHour);
      if (amountOre < minAmountOre) continue;

      flags.push(
        buildFlag(context, {
          key: `sats:${summary.payslip.id}:${line.id}`,
          title: 'Lavere timesats enn kontrakten',
          periodLabel: summary.label,
          periodStart,
          periodEnd,
          message:
            `Kontrakten din sier ${formatKr(rate)} i timen, men linja «${line.label}» på lønnsslippen er ` +
            `betalt med ${formatKr(line.rateOre)}. For ${formatHours(line.hours)} blir differansen ` +
            `${formatKr(amountOre)}. Har du fått lønnsøkning eller endret sats, kan kontraktsatsen i appen ` +
            `være utdatert — sjekk hva som er riktig.`,
          evidence: [
            ev('Sats i kontrakten', formatKr(rate)),
            ev('Sats på lønnsslippen', formatKr(line.rateOre)),
            ev('Differanse per time', formatKr(shortfallPerHour)),
            ev('Timer på linja', formatHours(line.hours)),
            ev('Linje på lønnsslippen', line.label),
          ],
          calculation: {
            expression: `${formatHours(line.hours)} × (${formatKr(rate)} − ${formatKr(line.rateOre)}) = ${formatKr(amountOre)}`,
            resultOre: amountOre,
          },
          amountOre,
          documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
        }),
      );
    }
  }

  /* ------------------------------------------------ måneder uten lønnsslipp */
  for (const month of context.months) {
    if (!isComplete(month, context.dataRange)) continue;
    if (month.workedHours <= 0) continue;
    const overlapping = context.summaries.filter(
      (summary) => summary.payslip.periodStart <= month.end && summary.payslip.periodEnd >= month.start,
    );
    if (overlapping.length > 0) continue;

    flags.push(
      buildFlag(context, {
        key: `mangler-lonnsslipp:${month.key}`,
        severity: 'til_info',
        title: 'Vi mangler lønnsslipp for denne måneden',
        periodLabel: month.label,
        periodStart: month.start,
        periodEnd: month.end,
        message:
          `Du har ${formatHours(month.workedHours)} registrert i ${month.label}, men vi har ingen lønnsslipp ` +
          `for perioden. Legg den inn for å få sjekket om timene er betalt. Anslag hvis alt skulle vært betalt ` +
          `som vanlige timer: ${formatKr(hoursTimesRate(month.workedHours, rate))}.`,
        evidence: [
          ev('Timer registrert', formatHours(month.workedHours)),
          ev('Lønnsslipper for perioden', '0'),
        ],
        amountOre: null,
      }),
    );
  }

  return flags;
};
