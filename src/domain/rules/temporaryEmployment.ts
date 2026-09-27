/**
 * Rule: temporary employment (AML § 14-9).
 *
 * A temporary contract must state the basis for being temporary; without one, the position is
 * to be regarded as permanent. And after more than three years of continuous temporary
 * employment — on any basis, since the old four-year rule was dropped — the worker counts as
 * permanently employed.
 */
import type { Flag } from '../schemas';
import { daysBetween, formatDateLong } from '../time';
import { buildFlag, contractRef, ev, numberParam } from './helpers';
import type { RuleContext, RuleFn } from './types';

export const temporaryEmployment: RuleFn = (context: RuleContext): Flag[] => {
  const contract = context.contract;
  if (contract.employmentType !== 'midlertidig') return [];
  const range = context.dataRange;
  if (!range) return [];

  const flags: Flag[] = [];
  const yearsToPermanent = numberParam(context.rule, 'years_to_permanent', 3);

  /* ------------------------------- grunnlaget for midlertidigheten */
  if (contract.temporaryBasis === null || contract.temporaryBasis.trim() === '') {
    flags.push(
      buildFlag(context, {
        key: 'mangler-grunnlag',
        severity: 'bor_sjekkes',
        title: 'Kontrakten sier ikke hvorfor stillingen er midlertidig',
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `En midlertidig ansettelse skal være skriftlig, og arbeidsavtalen skal oppgi grunnlaget for at ` +
          `den er midlertidig. Mangler grunnlaget, skal stillingen som hovedregel regnes som fast. ` +
          `Sjekk om det står noe om dette i avtalen din — og hvis ikke, ta det opp.`,
        evidence: [
          ev('Ansettelsesform', 'Midlertidig'),
          ev('Grunnlag oppgitt i kontrakten', 'Nei'),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  /* --------------------------------- treårsregelen (§ 14-9 sjuende ledd) */
  const servedDays = daysBetween(contract.startDate, range.end);
  const servedYears = servedDays / 365.25;

  if (servedYears >= yearsToPermanent) {
    flags.push(
      buildFlag(context, {
        key: 'treaarsregelen',
        severity: 'bor_sjekkes',
        title: `Du har vært midlertidig ansatt i over ${yearsToPermanent} år`,
        periodLabel: 'Hele perioden',
        periodStart: range.start,
        periodEnd: range.end,
        message:
          `Du har vært ansatt siden ${formatDateLong(contract.startDate)}, altså mer enn ` +
          `${yearsToPermanent} år. Har du vært sammenhengende midlertidig ansatt i mer enn ` +
          `${yearsToPermanent} år, regnes du som fast ansatt — uansett hva grunnlaget for midlertidigheten ` +
          `var. Vi vet ikke om ansettelsen har vært sammenhengende, så sjekk det selv: ferie og korte ` +
          `avbrudd bryter normalt ikke sammenhengen. Ta det opp skriftlig, og kontakt fagforeningen din ` +
          `hvis du blir møtt med nei.`,
        evidence: [
          ev('Ansatt fra', formatDateLong(contract.startDate)),
          ev('Så langt vi ser', `${Math.floor(servedYears)} år og ${Math.round((servedYears % 1) * 12)} måneder`),
          ev('Grensen i loven', `${yearsToPermanent} år`),
        ],
        amountOre: null,
        documentRefs: contractRef(context),
      }),
    );
  }

  return flags;
};
