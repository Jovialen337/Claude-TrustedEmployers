/**
 * Rule: minimum wage in an industry with a generally applied tariff agreement
 * (allmenngjøringsloven).
 *
 * Norway has no general statutory minimum wage, but in nine industries — among them
 * construction, cleaning, and accommodation, catering and serving — a nationwide agreement is
 * "allmenngjort" and its rates apply to everyone in that industry. The rates change, and this
 * app ships none: the user enters the rate that applies to them, and until then the rule only
 * says where to find it.
 */
import { formatKr, hoursTimesRate } from '../money';
import type { Flag } from '../schemas';
import { buildFlag, contractRef, ev, numberParam } from './helpers';
import type { RuleContext, RuleFn } from './types';

/** The industries where a generally applied agreement sets a minimum wage. */
export const ALLMENNGJORTE_INDUSTRIES = [
  'bygg',
  'renhold',
  'overnatting',
  'servering',
  'catering',
  'jordbruk',
  'gartneri',
  'fiskeindustri',
  'elektro',
  'godstransport',
  'persontransport',
  'turbil',
  'skipsverft',
] as const;

function industryLooksAllmenngjort(industry: string | null): boolean {
  if (industry === null) return false;
  const text = industry.toLowerCase();
  return ALLMENNGJORTE_INDUSTRIES.some((word) => text.includes(word));
}

export const minimumWage: RuleFn = (context: RuleContext): Flag[] => {
  const range = context.dataRange;
  if (!range) return [];

  const contract = context.contract;
  const minimum = contract.allmenngjortMinimumHourlyOre;
  const tolerance = numberParam(context.rule, 'tolerance_ore', 50);

  /* -------------------------- brukeren har lagt inn en minstelønnssats */
  if (minimum !== null && minimum > 0) {
    const shortfall = minimum - context.hourlyRateOre;
    if (shortfall <= tolerance) return [];

    const workedHours = context.weeks.reduce((sum, week) => sum + week.workedHours, 0);
    const amountOre = hoursTimesRate(workedHours, shortfall);

    return [
      buildFlag(context, {
        key: 'under-minstelonn',
        severity: 'sannsynlig_feil',
        title: 'Timelønna er lavere enn minstelønna i bransjen',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `I bransjer med allmenngjort tariffavtale gjelder en lovbestemt minstelønn for alle, uansett om ` +
          `arbeidsgiver er bundet av tariffavtalen. Du har lagt inn ${formatKr(minimum)} som minstelønn, ` +
          `mens kontrakten din gir ${formatKr(context.hourlyRateOre)}. Differansen er ` +
          `${formatKr(shortfall)} per time. Sjekk gjeldende sats på arbeidstilsynet.no — satsene endres ` +
          `med jevne mellomrom, og det finnes egne satser for alder, fagbrev og erfaring.`,
        evidence: [
          ev('Minstelønn du har lagt inn', formatKr(minimum)),
          ev('Timelønn i kontrakten', formatKr(context.hourlyRateOre)),
          ev('Differanse per time', formatKr(shortfall)),
          ev('Timer i perioden', String(Math.round(workedHours * 100) / 100)),
          ev('Bransje', contract.industry ?? 'Ikke oppgitt'),
        ],
        calculation: {
          expression: `${Math.round(workedHours * 100) / 100} t × ${formatKr(shortfall)} = ${formatKr(amountOre)}`,
          resultOre: amountOre,
        },
        amountOre,
        documentRefs: contractRef(context),
      }),
    ];
  }

  /* ------------- ingen sats lagt inn: si hvor den finnes, ikke gjett den */
  if (!industryLooksAllmenngjort(contract.industry)) return [];

  return [
    buildFlag(context, {
      key: 'minstelonn-ikke-lagt-inn',
      severity: 'til_info',
      title: 'Bransjen din kan ha lovbestemt minstelønn',
      periodLabel: 'Hele perioden',
      periodStart: range.start,
      periodEnd: range.end,
      message:
        `Du har oppgitt bransjen «${contract.industry}». I ni bransjer — blant annet bygg, renhold, ` +
        `overnatting, servering og catering, jordbruk og gartneri, fiskeindustri, elektro og transport — ` +
        `er tariffavtalen allmenngjort, og da gjelder en lovbestemt minstelønn for alle som jobber der. ` +
        `Vi har ikke lagt inn noen satser, fordi de endres jevnlig og avhenger av alder, fagbrev og ` +
        `erfaring. Finn satsen som gjelder deg på arbeidstilsynet.no, legg den inn under Kontrakt, og så ` +
        `sammenligner vi.`,
      evidence: [
        ev('Bransje', contract.industry ?? 'Ikke oppgitt'),
        ev('Timelønn i kontrakten', formatKr(context.hourlyRateOre)),
        ev('Minstelønn lagt inn', 'Nei'),
      ],
      amountOre: null,
      documentRefs: contractRef(context),
    }),
  ];
};
