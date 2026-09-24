/**
 * A draft message to the employer: polite, factual, and something the user edits before
 * sending. The tool never sends anything itself.
 */
import type { CheckResult } from '../domain/engine';
import { formatHours, formatKr } from '../domain/money';
import type { Contract, Flag } from '../domain/schemas';
import { formatDateLong } from '../domain/time';

function claimLine(flag: Flag, index: number): string {
  const lines = [`${index}. ${flag.title} — ${flag.periodLabel}`];
  if (flag.calculation) lines.push(`   Slik har jeg regnet: ${flag.calculation.expression}`);
  const source = flag.sources[0];
  if (source) {
    // "Arbeidsmiljøloven § 10-4", but "Arbeidsavtalen, Avtalte tillegg" — a contract point
    // is not a paragraph, so it does not read as one.
    const separator = source.paragraph.startsWith('§') ? ' ' : ', ';
    lines.push(`   Grunnlag: ${source.law}${separator}${source.paragraph}`);
  }
  return lines.join('\n');
}

export function draftMessage(result: CheckResult, contract: Contract | null): string {
  const claims = result.flags.filter((flag) => flag.severity === 'sannsynlig_feil');
  const questions = result.flags.filter((flag) => flag.severity === 'bor_sjekkes');

  const period =
    result.dataRange !== null
      ? `${formatDateLong(result.dataRange.start)} til ${formatDateLong(result.dataRange.end)}`
      : 'perioden jeg har oversikt over';

  const parts: string[] = [];

  parts.push('Hei,');
  parts.push(
    `jeg har gått gjennom arbeidsavtalen min, vaktene mine og lønnsslippene for ${period}. ` +
      `Det er noen ting jeg ikke får til å stemme, og jeg håper du kan se på dem og forklare eller rette opp.`,
  );

  if (claims.length > 0) {
    parts.push('Dette mener jeg ikke er riktig:');
    parts.push(claims.map((flag, index) => claimLine(flag, index + 1)).join('\n\n'));
    if (result.totals.estimatedOwedOre > 0) {
      parts.push(
        `Slik jeg regner det utgjør punktene over ${formatKr(result.totals.estimatedOwedOre)} til sammen. ` +
          `Jeg kan ha misforstått noe, og da retter jeg det gjerne.`,
      );
    }
  }

  if (questions.length > 0) {
    parts.push('I tillegg er det noe jeg gjerne vil forstå bedre:');
    parts.push(
      questions
        .map((flag, index) => `${index + 1}. ${flag.title} — ${flag.periodLabel}`)
        .join('\n'),
    );
  }

  if (result.totals.hoursShortVsContract > 0 && contract) {
    parts.push(
      `Jeg har også fått ${formatHours(result.totals.hoursShortVsContract)} mindre enn stillingsprosenten min på ` +
        `${contract.stillingsprosent} % skulle gitt i denne perioden. Er det mulig å få satt opp flere vakter, ` +
        `eller å se på stillingsprosenten?`,
    );
  }

  parts.push(
    'Jeg har satt opp en oversikt med tall og datoer som jeg gjerne sender eller går gjennom med deg. ' +
      'Si gjerne fra om det passer å ta en prat.',
  );

  parts.push('Med vennlig hilsen');
  parts.push(contract?.employeeName?.trim() || '[navnet ditt]');

  return parts.join('\n\n');
}
