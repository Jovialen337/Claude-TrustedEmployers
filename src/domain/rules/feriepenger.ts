/**
 * Rule: feriepenger (ferieloven § 10).
 *
 * Always reported as something to check, never as a certain error: what counts towards the
 * feriepengegrunnlag varies (expense refunds and last year's feriepenger are excluded), and
 * this app usually sees only part of the opptjeningsår.
 */
import { formatKr, formatPercent, mulOre } from '../money';
import type { Flag, PayslipCategory } from '../schemas';
import { feriepengerRatePercent, withSource } from '../thresholds';
import { buildFlag, contractRef, ev, numberParam, refsFromPayslip } from './helpers';
import type { RuleContext, RuleFn } from './types';

/** Categories left out of our own feriepengegrunnlag estimate. */
const EXCLUDED: PayslipCategory[] = ['feriepenger', 'annet'];

export const feriepenger: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const range = context.dataRange;
  if (!range) return flags;

  const statutory = numberParam(context.rule, 'rate_percent_statutory', 10.2);
  const tolerance = numberParam(context.rule, 'tolerance_ore', 1000);
  // The contract's rate governs, but never below ferielovens minimum.
  const rateThreshold = feriepengerRatePercent(context.contract, context.rule);
  const rate = rateThreshold.value;

  if (rateThreshold.belowStatutory && context.summaries.length > 0) {
    flags.push(
      buildFlag(context, {
        key: 'sats-under-lovens-minimum',
        severity: 'bor_sjekkes',
        title: 'Kontrakten oppgir lavere feriepengesats enn ferieloven krever',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Kontrakten din oppgir ${formatPercent(rateThreshold.belowStatutory.contractValue)} i feriepenger. ` +
          `Ferieloven krever minst ${formatPercent(rateThreshold.belowStatutory.statutory)}, så vi har regnet ` +
          `med lovens sats.`,
        evidence: [
          ev('Sats i kontrakten', formatPercent(rateThreshold.belowStatutory.contractValue)),
          ev('Lovens minimum', formatPercent(rateThreshold.belowStatutory.statutory)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  const stated = context.summaries.filter(
    (summary) => summary.payslip.feriepengerBasisOre !== null || summary.payslip.feriepengerAccruedOre !== null,
  );

  /* ----------------------------------------- ingenting oppgitt på lønnsslippene */
  if (stated.length === 0) {
    return [
      ...flags,
      buildFlag(context, {
        key: 'ikke-oppgitt',
        severity: 'til_info',
        title: 'Feriepengegrunnlaget står ikke på lønnsslippene',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Du har krav på å få oppgitt hva feriepengene dine regnes ut fra. Vi finner ikke noe ` +
          `feriepengegrunnlag på lønnsslippene vi har. Feriepenger er minst ${formatPercent(statutory)} av ` +
          `grunnlaget, og ${formatPercent(12)} hvis du har avtale om fem uker ferie. Spør arbeidsgiver om en ` +
          `oppstilling, og sjekk at grunnlaget stemmer med lønna du har fått.`,
        evidence: [
          ev('Lønnsslipper vi har', String(context.summaries.length)),
          ev('Sats vi ville brukt', formatPercent(rate)),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    ];
  }

  /* ---------------------------------- oppgitt sats/avsetning mot vår utregning */
  for (const summary of stated) {
    const basis = summary.payslip.feriepengerBasisOre;
    const accrued = summary.payslip.feriepengerAccruedOre;
    if (basis === null || accrued === null) continue;

    const expected = mulOre(basis, rate / 100);
    const difference = expected - accrued;
    if (Math.abs(difference) <= tolerance) continue;

    flags.push(
      buildFlag(context, {
        key: `avsetning:${summary.payslip.id}`,
        title: 'Sjekk feriepengene på denne lønnsslippen',
        periodLabel: summary.label,
        periodStart: summary.payslip.periodStart,
        periodEnd: summary.payslip.periodEnd,
        message:
          `Lønnsslippen oppgir et feriepengegrunnlag på ${formatKr(basis)} og avsatte feriepenger på ` +
          `${formatKr(accrued)}. Med ${formatPercent(rate)} skulle avsetningen vært ${formatKr(expected)} — ` +
          `${difference > 0 ? `${formatKr(difference)} mer` : `${formatKr(-difference)} mindre`} enn det som står. ` +
          `Dette er noe du bør sjekke, ikke en sikker feil: satsen kan være en annen, og avsetningen kan bli ` +
          `justert senere i året.`,
        evidence: [
          ev('Grunnlag på lønnsslippen', formatKr(basis)),
          ev('Avsatt på lønnsslippen', formatKr(accrued)),
          ev('Sats vi bruker', withSource(formatPercent(rate), rateThreshold)),
          ev('Forventet avsetning', formatKr(expected)),
          ev('Differanse', formatKr(difference)),
        ],
        calculation:
          difference > 0
            ? {
                expression:
                  `${formatKr(basis)} × ${formatPercent(rate)} = ${formatKr(expected)} − ` +
                  `${formatKr(accrued)} avsatt = ${formatKr(difference)}`,
                resultOre: difference,
              }
            : {
                expression: `${formatKr(basis)} × ${formatPercent(rate)} = ${formatKr(expected)}`,
                resultOre: null,
              },
        amountOre: difference > 0 ? difference : null,
        documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
      }),
    );
  }

  /* ------------------------------ vårt eget grunnlag mot det som er oppgitt */
  const latest = stated[stated.length - 1]!;
  const statedBasis = latest.payslip.feriepengerBasisOre;
  if (statedBasis !== null) {
    const year = latest.payslip.periodEnd.slice(0, 4);
    const sameYear = context.summaries.filter((summary) => summary.payslip.periodEnd.slice(0, 4) === year);
    const ourBasis = sameYear.reduce(
      (sum, summary) =>
        sum +
        [...summary.byCategory.entries()]
          .filter(([category]) => !EXCLUDED.includes(category))
          .reduce((lineSum, [, total]) => lineSum + total.amountOre, 0),
      0,
    );

    if (ourBasis > 0 && Math.abs(ourBasis - statedBasis) > tolerance) {
      flags.push(
        buildFlag(context, {
          key: 'grunnlag',
          severity: 'til_info',
          title: 'Sjekk om feriepengegrunnlaget stemmer med lønna du har fått',
          periodLabel: `Opptjeningsåret ${year}`,
          periodStart: latest.payslip.periodStart,
          periodEnd: latest.payslip.periodEnd,
          message:
            `Lønnsslippen oppgir ${formatKr(statedBasis)} i feriepengegrunnlag. Ut fra de ` +
            `${sameYear.length} lønnsslippene vi har for ${year} summerer lønna di til ${formatKr(ourBasis)} ` +
            `(utlegg og feriepenger holdt utenfor). Har vi ikke alle lønnsslippene for året, er forskjellen ` +
            `helt normal — men får du en oppstilling fra arbeidsgiver, er dette verdt å sammenligne.`,
          evidence: [
            ev('Grunnlag på lønnsslippen', formatKr(statedBasis)),
            ev('Vår sum av lønn', formatKr(ourBasis)),
            ev('Lønnsslipper for året', String(sameYear.length)),
            ev('Holdt utenfor', 'Feriepenger og linjer merket «Annet» (for eksempel utlegg)'),
          ],
          amountOre: null,
          documentRefs: refsFromPayslip(latest.payslip),
        }),
      );
    }
  }

  return flags;
};
