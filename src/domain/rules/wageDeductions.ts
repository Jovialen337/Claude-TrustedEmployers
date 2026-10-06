/**
 * Rule: deductions from pay (AML § 14-15 andre ledd).
 *
 * An employer may not deduct from wages or feriepenger except in the cases the law lists —
 * tax and the like, union dues, a pension contribution, or an amount fixed in advance by a
 * written agreement. The Supreme Court (HR-2021-2532-A) held that such an agreement must
 * identify the actual deduction: a standard clause in the contract is not enough.
 */
import { formatKr } from '../money';
import { CATEGORY_LABELS, type Flag } from '../schemas';
import { buildFlag, contractRef, ev, numberParam, refsFromPayslip } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const wageDeductions: RuleFn = (context: RuleContext): Flag[] => {
  const flags: Flag[] = [];
  const minAmountOre = numberParam(context.rule, 'min_amount_ore', 100);

  for (const summary of context.summaries) {
    const deductions = summary.payslip.lines.filter(
      (line) => line.category === 'trekk' || line.amountOre < 0,
    );
    const total = deductions.reduce((sum, line) => sum + Math.abs(line.amountOre), 0);
    if (deductions.length === 0 || total < minAmountOre) continue;

    flags.push(
      buildFlag(context, {
        key: summary.payslip.id,
        title: `${formatKr(total)} er trukket fra lønna`,
        periodLabel: summary.label,
        periodStart: summary.payslip.periodStart,
        periodEnd: summary.payslip.periodEnd,
        message:
          `Arbeidsgiver kan bare trekke deg i lønn i de tilfellene loven lister opp: skatt og liknende ` +
          `lovbestemte trekk, fagforeningskontingent, egenandel til pensjons- eller forsikringsordning, ` +
          `erstatning for skade eller tap du forsettlig eller grovt uaktsomt har påført, trekk som følger ` +
          `av tariffavtale, eller et beløp som er fastsatt på forhånd i en skriftlig avtale. ` +
          `Høyesterett har slått fast at en slik avtale må gjelde det konkrete trekket — en generell ` +
          `standardsetning i arbeidsavtalen er ikke nok. Er dette trekk for kassedifferanse, uniform, ` +
          `knust utstyr eller liknende, bør du be arbeidsgiver vise hvilken avtale trekket bygger på. ` +
          `Trekket kan dessuten ikke være større enn at du har nok igjen å leve av.`,
        evidence: [
          ...deductions.map((line) =>
            ev(line.label, `${formatKr(Math.abs(line.amountOre))} (${CATEGORY_LABELS[line.category]})`),
          ),
          ev('Trukket til sammen', formatKr(total)),
          ev('Lønnsslipp', summary.label),
        ],
        amountOre: null,
        documentRefs: [...refsFromPayslip(summary.payslip), ...contractRef(context)],
      }),
    );
  }

  return flags;
};
