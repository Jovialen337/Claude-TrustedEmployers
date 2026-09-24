/**
 * Rule: exemption from the working-time rules (AML § 10-12).
 *
 * A leading or particularly independent position is exempt from most of chapter 10 — working
 * hours, overtime, rest and breaks. The exemption is narrow and frequently claimed for
 * positions that do not qualify, so when the user has marked their position as exempt this
 * rule says plainly which checks have been switched off and what the test actually is.
 */
import { WORKING_TIME_EXEMPTION_LABELS, type Flag } from '../schemas';
import { buildFlag, contractRef, ev } from './helpers';
import type { RuleContext, RuleFn } from './types';

/** The rules § 10-12 switches off. The engine reads this. */
export const EXEMPTED_RULE_IDS = ['overtime', 'rest_periods', 'breaks', 'sunday_work', 'night_work'] as const;

export const workingTimeExemption: RuleFn = (context: RuleContext): Flag[] => {
  const exemption = context.contract.workingTimeExemption;
  if (exemption === 'ingen') return [];
  const range = context.dataRange;
  if (!range) return [];

  return [
    buildFlag(context, {
      key: 'unntak-fra-arbeidstidsreglene',
      severity: 'bor_sjekkes',
      title: 'Arbeidstidsreglene er slått av for stillingen din',
      periodLabel: 'Hele perioden',
      periodStart: range.start,
      periodEnd: range.end,
      message:
        `Du har oppgitt at du har en ${exemption === 'ledende' ? 'ledende' : 'særlig uavhengig'} stilling. ` +
        `Da gjelder ikke arbeidsmiljølovens regler om arbeidstid, overtid, pauser og arbeidsfri for deg, og ` +
        `vi har slått av de sjekkene: overtidstillegg, hviletid, pauser, søndagsarbeid og nattarbeid. ` +
        `Vi sjekker fortsatt om timene dine er betalt, om tillegg fra kontrakten er med, feriepenger, ` +
        `trekk i lønn og stillingsprosenten din. ` +
        `Unntaket er smalere enn mange tror: en ledende stilling forutsetter at du har klare lederfunksjoner ` +
        `og selv bestemmer arbeidstiden din, og en særlig uavhengig stilling at du i praksis styrer både ` +
        `arbeidsmengden og når arbeidet gjøres. At du har tittelen «leder», har fast lønn eller jobber ` +
        `selvstendig, er ikke nok i seg selv. Er du i tvil, er dette verdt å få avklart — det avgjør om du ` +
        `har krav på overtidsbetaling i det hele tatt.`,
      evidence: [
        ev('Oppgitt stillingstype', WORKING_TIME_EXEMPTION_LABELS[exemption]),
        ev('Sjekker som er slått av', 'Overtid, hviletid, pauser, søndagsarbeid, nattarbeid'),
        ev('Sjekker som fortsatt gjelder', 'Betalte timer, tillegg, feriepenger, trekk i lønn, stillingsprosent'),
      ],
      amountOre: null,
      documentRefs: contractRef(context),
    }),
  ];
};
