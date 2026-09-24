/**
 * Rule: what the employment contract must state (AML § 14-6), plus the two rights that make
 * the rest of this app possible: a written record of hours worked (§ 10-7) and a work plan
 * two weeks in advance (§ 10-3).
 *
 * This does not judge the contract's terms — the other rules do that. It lists what the law
 * says the contract must tell you and which of those things we have not been given, so the
 * worker can go and ask for them.
 */
import type { Flag } from '../schemas';
import { buildFlag, contractRef, ev, numberParam } from './helpers';
import type { RuleContext, RuleFn } from './types';

interface Requirement {
  label: string;
  present: boolean;
  /** What the worker should ask for, when it is missing. */
  ask: string;
}

export const contractContents: RuleFn = (context: RuleContext): Flag[] => {
  const range = context.dataRange;
  if (!range) return [];
  const contract = context.contract;

  const requirements: Requirement[] = [
    {
      label: 'Partenes identitet',
      present: contract.employer.trim() !== '' && contract.employeeName.trim() !== '',
      ask: 'navn på arbeidsgiver og arbeidstaker',
    },
    { label: 'Arbeidsplass', present: contract.workplace !== null && contract.workplace.trim() !== '', ask: 'hvor du skal jobbe' },
    { label: 'Stillingstittel eller beskrivelse av arbeidet', present: contract.jobTitle !== null && contract.jobTitle.trim() !== '', ask: 'tittel eller beskrivelse av arbeidet' },
    { label: 'Tidspunkt for arbeidsforholdets begynnelse', present: contract.startDate !== '', ask: 'startdato' },
    {
      label: 'Lengde og plassering av arbeidstiden',
      present: contract.contractedHoursPerWeek !== null || contract.stillingsprosent > 0,
      ask: 'avtalt arbeidstid per uke, og når den ligger',
    },
    { label: 'Lønn, og hva den består av', present: contract.wage.amountOre > 0, ask: 'timelønn eller månedslønn' },
    {
      label: 'Tillegg og andre godtgjøringer oppgitt særskilt',
      present: contract.supplements.length > 0,
      ask: 'hvilke tillegg du har (kveld, natt, helg, helligdag) og satsene',
    },
    { label: 'Utbetalingsmåte og -tidspunkt', present: contract.payDayOfMonth !== null, ask: 'hvilken dato lønna utbetales' },
    { label: 'Ferie og feriepenger', present: contract.feriepengerRatePercent !== null, ask: 'feriepengesatsen din' },
    { label: 'Oppsigelsesfrister', present: contract.noticePeriodMonths !== null, ask: 'oppsigelsesfristen' },
    { label: 'Eventuell prøvetid', present: contract.probationMonths !== null, ask: 'om du har prøvetid, og hvor lang' },
    {
      label: 'Tariffavtaler som gjelder',
      present: contract.tariffavtale !== null && contract.tariffavtale.trim() !== '',
      ask: 'om det finnes en tariffavtale, og hvilken',
    },
    {
      label: 'Ordninger for overtidsarbeid og betaling for det',
      present: contract.overtimeSupplementPercent !== null,
      ask: 'hva du får i overtidstillegg',
    },
    ...(contract.employmentType === 'midlertidig'
      ? [
          {
            label: 'Grunnlaget for midlertidig ansettelse',
            present: contract.temporaryBasis !== null && contract.temporaryBasis.trim() !== '',
            ask: 'hvorfor stillingen er midlertidig',
          },
        ]
      : []),
  ];

  const missing = requirements.filter((requirement) => !requirement.present);
  const flags: Flag[] = [];

  if (missing.length >= numberParam(context.rule, 'min_missing_to_flag', 1)) {
    flags.push(
      buildFlag(context, {
        key: 'mangler-opplysninger',
        severity: 'til_info',
        title: `${missing.length} av ${requirements.length} lovpålagte opplysninger mangler hos oss`,
        periodLabel: 'Arbeidsavtalen',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Arbeidsavtalen skal opplyse om alt som har vesentlig betydning i arbeidsforholdet, og loven ` +
          `lister opp hva som minst skal stå der. Dette er punkter vi ikke har fått lagt inn — det kan ` +
          `hende de står i avtalen din likevel, og da er det bare å fylle dem inn her. Står de ikke der, ` +
          `har du rett til å få dem skriftlig: avtalen skal foreligge senest sju dager etter at du begynte, ` +
          `og endringer skal inn i avtalen senest den dagen de trer i kraft.`,
        evidence: [
          ...missing.map((requirement) => ev(requirement.label, `Be om ${requirement.ask}`)),
          ev('Punkter vi har', `${requirements.length - missing.length} av ${requirements.length}`),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* ------------ retten til å få vite hva du har jobbet, og når du skal jobbe */
  if (context.shifts.length === 0) {
    flags.push(
      buildFlag(context, {
        key: 'oversikt-over-arbeidstiden',
        severity: 'til_info',
        title: 'Du har rett til å få en oversikt over arbeidstiden din',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Arbeidsgiver skal ha en oversikt som viser hvor mye den enkelte har arbeidet, og den skal være ` +
          `tilgjengelig for deg og for Arbeidstilsynet. Har du ikke tilgang til timene dine, kan du be om ` +
          `oversikten skriftlig — da får du noe å sammenligne lønnsslippene med.`,
        evidence: [ev('Vakter lagt inn', '0')],
        amountOre: null,
      }),
    );
  }

  const plannedOnly = context.shifts.filter((shift) => shift.kind === 'planlagt').length;
  if (plannedOnly > 0) {
    flags.push(
      buildFlag(context, {
        key: 'arbeidsplan',
        severity: 'til_info',
        title: 'Arbeidsplanen skal være klar to uker i forveien',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Jobber du til ulike tider på døgnet, skal arbeidsgiver sette opp en arbeidsplan som viser hvilke ` +
          `uker, dager og tider du skal jobbe. Planen skal drøftes med tillitsvalgte og være tilgjengelig ` +
          `for deg minst to uker før den settes i verk. Får du vaktene dine senere enn det, er det verdt å ` +
          `si fra — også fordi det gjør det vanskelig å planlegge livet rundt jobben.`,
        evidence: [
          ev('Planlagte vakter lagt inn', String(plannedOnly)),
          ev('Lovens krav', 'Arbeidsplan tilgjengelig minst to uker i forveien'),
        ],
        amountOre: null,
      }),
    );
  }

  return flags;
};
