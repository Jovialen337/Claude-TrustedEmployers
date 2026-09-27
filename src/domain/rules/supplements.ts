/**
 * Rule: kvelds-, natt-, helge- og helligdagstillegg.
 *
 * Supplements do not follow from arbeidsmiljøloven. They follow from the contract or the
 * tariff agreement, so this rule uses only the windows and rates the user has entered from
 * their own papers. With nothing entered, it says so instead of guessing a rate.
 */
import { categoryAmountOre, supplementHours } from '../aggregate';
import { formatHours, formatKr, formatPercent, hoursTimesRate, mulOre, roundHours } from '../money';
import {
  CATEGORY_LABELS,
  SUPPLEMENT_CATEGORY_BY_KIND,
  type Flag,
  type PayslipCategory,
  type Supplement,
} from '../schemas';
import { buildFlag, contractRef, ev, numberParam, refsFromPayslip } from './helpers';
import type { RuleContext, RuleFn } from './types';

function expectedOre(supplement: Supplement, hours: number, hourlyRateOre: number): number {
  return supplement.rate.kind === 'per_hour_ore'
    ? hoursTimesRate(hours, supplement.rate.value)
    : mulOre(hoursTimesRate(hours, hourlyRateOre), supplement.rate.value / 100);
}

function rateText(supplement: Supplement): string {
  return supplement.rate.kind === 'per_hour_ore'
    ? `${formatKr(supplement.rate.value)} per time`
    : `${formatPercent(supplement.rate.value)} av timelønn`;
}

function windowText(supplement: Supplement): string {
  const time =
    supplement.fromTime !== null && supplement.toTime !== null
      ? `${supplement.fromTime}–${supplement.toTime}`
      : 'hele dagen';
  if (supplement.weekdays !== null) return `${time}, ukedag ${supplement.weekdays.join(', ')}`;
  if (supplement.kind === 'helg') return `${time}, lørdag og søndag`;
  if (supplement.kind === 'helligdag') return `${time}, helligdager`;
  return time;
}

export const supplements: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const tolerance = numberParam(context.rule, 'tolerance_ore', 500);
  const configured = context.contract.supplements;
  const range = context.dataRange;

  /* ------------------------------------------------- ingen tillegg registrert */
  if (configured.length === 0) {
    if (!range) return flags;
    return [
      buildFlag(context, {
        key: 'ingen-tillegg',
        severity: 'til_info',
        title: 'Vi har ingen avtalte tillegg å sjekke mot',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Kvelds-, natt-, helge- og helligdagstillegg følger av kontrakten eller tariffavtalen din, ikke av ` +
          `arbeidsmiljøloven. Vi har ikke fått lagt inn noen slike tillegg, så de er ikke sjekket. ` +
          `Står det tillegg i kontrakten eller tariffavtalen din, legg dem inn under Innstillinger — da regner ` +
          `vi ut hva du skulle hatt.`,
        evidence: [
          ev('Tillegg lagt inn', '0'),
          ev('Tariffavtale i kontrakten', context.contract.tariffavtale ?? 'Ingen oppgitt'),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    ];
  }

  /* ------------------------- per lønnsperiode, gruppert per lønnsslippkategori */
  const byCategory = new Map<PayslipCategory, Supplement[]>();
  for (const supplement of configured) {
    const category = SUPPLEMENT_CATEGORY_BY_KIND[supplement.kind];
    byCategory.set(category, [...(byCategory.get(category) ?? []), supplement]);
  }

  for (const summary of context.summaries) {
    const { periodStart, periodEnd } = summary.payslip;

    for (const [category, group] of byCategory) {
      let expected = 0;
      const rows = [];
      /** How the expected amount was arrived at, kept for the calculation line. */
      const workings: string[] = [];

      for (const supplement of group) {
        const hours = roundHours(supplementHours(context.effective, supplement, periodStart, periodEnd));
        if (hours <= 0) continue;
        const ore = expectedOre(supplement, hours, context.hourlyRateOre);
        expected += ore;
        rows.push(
          ev(
            supplement.label,
            `${formatHours(hours)} × ${rateText(supplement)} = ${formatKr(ore)} (${windowText(supplement)})`,
          ),
        );
        workings.push(
          supplement.rate.kind === 'per_hour_ore'
            ? `${formatHours(hours)} × ${formatKr(supplement.rate.value)}`
            : `${formatHours(hours)} × ${formatKr(context.hourlyRateOre)} × ${formatPercent(supplement.rate.value)}`,
        );
      }

      if (expected <= 0) continue;
      const paid = categoryAmountOre(summary, category);
      const missing = expected - paid;
      if (missing <= tolerance) continue;

      flags.push(
        buildFlag(context, {
          key: `${summary.payslip.id}:${category}`,
          title: `${CATEGORY_LABELS[category]} mangler`,
          periodLabel: summary.label,
          periodStart,
          periodEnd,
          message:
            `Ut fra tidsrommene i kontrakten din skulle du hatt ${formatKr(expected)} i ` +
            `${CATEGORY_LABELS[category].toLowerCase()} for denne perioden. Lønnsslippen viser ` +
            `${formatKr(paid)}. Differansen er ${formatKr(missing)}. ` +
            `Satsene her er hentet fra det du har lagt inn fra kontrakten eller tariffavtalen — ` +
            `stemmer de ikke, rett dem opp, så blir regnestykket riktig.`,
          evidence: [
            ...rows,
            ev('Skulle hatt', formatKr(expected)),
            ev('På lønnsslippen', formatKr(paid)),
            ev('Differanse', formatKr(missing)),
            ev('Kilde til satsen', group.map((s) => s.source).join('; ')),
            ev('Hvor satsen kommer fra', 'Kontrakten eller tariffavtalen din — ikke arbeidsmiljøloven'),
          ],
          calculation: {
            // Show the working when there is one supplement of this kind; with several,
            // the per-supplement lines are in the evidence just above.
            expression:
              (workings.length === 1 ? `${workings[0]} = ${formatKr(expected)}` : formatKr(expected)) +
              ` − ${formatKr(paid)} betalt = ${formatKr(missing)}`,
            resultOre: missing,
          },
          amountOre: missing,
          documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
        }),
      );
    }
  }

  return flags;
};
