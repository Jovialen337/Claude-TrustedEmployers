/**
 * Masking of personal identifiers, applied at the single point where text can leave the
 * machine (the Claude API call in src/extraction).
 *
 * The bias is deliberately towards over-masking: a fødselsnummer or an account number is
 * never needed to read a contract or a payslip, so removing a number that merely looks like
 * one costs nothing. What must survive is everything the rules need — dates, clock times,
 * hours and amounts — so the patterns are written not to touch those.
 */

export type RedactionKind = 'fodselsnummer' | 'kontonummer' | 'iban' | 'kortnummer';

export interface Redaction {
  kind: RedactionKind;
  /** What replaced it, so the user can see what happened. */
  placeholder: string;
  count: number;
}

export interface MaskResult {
  text: string;
  redactions: Redaction[];
}

interface Pattern {
  kind: RedactionKind;
  regex: RegExp;
  placeholder: string;
}

const PLACEHOLDERS: Record<RedactionKind, string> = {
  fodselsnummer: '[fjernet fødselsnummer]',
  kontonummer: '[fjernet kontonummer]',
  iban: '[fjernet kontonummer]',
  kortnummer: '[fjernet kortnummer]',
};

/**
 * Order matters: the most specific shapes are removed first, so a formatted account number
 * is recognised as such before the plain eleven-digit rule sees it.
 */
const PATTERNS: Pattern[] = [
  // IBAN, e.g. NO93 8601 1117 947
  { kind: 'iban', regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{3,4}){2,7}\b/g, placeholder: PLACEHOLDERS.iban },
  // Kontonummer written 1234.56.78901 or 1234 56 78901
  { kind: 'kontonummer', regex: /\b\d{4}[ .]\d{2}[ .]\d{5}\b/g, placeholder: PLACEHOLDERS.kontonummer },
  // Card-like runs of 12–19 digits, optionally grouped in fours.
  { kind: 'kortnummer', regex: /\b\d{4}(?:[ -]?\d{4}){2,4}\b/g, placeholder: PLACEHOLDERS.kortnummer },
  { kind: 'kortnummer', regex: /\b\d{12,19}\b/g, placeholder: PLACEHOLDERS.kortnummer },
  // Fødselsnummer / D-nummer: 11 digits, often as 010190 12345.
  { kind: 'fodselsnummer', regex: /\b\d{6}[ -]?\d{5}\b/g, placeholder: PLACEHOLDERS.fodselsnummer },
];

/** Remove personal identifiers from text. Dates, times, hours and amounts are left alone. */
export function maskPersonalData(input: string): MaskResult {
  let text = input;
  const counts = new Map<RedactionKind, number>();

  for (const pattern of PATTERNS) {
    text = text.replace(pattern.regex, () => {
      counts.set(pattern.kind, (counts.get(pattern.kind) ?? 0) + 1);
      return pattern.placeholder;
    });
  }

  const redactions: Redaction[] = [...counts.entries()].map(([kind, count]) => ({
    kind,
    placeholder: PLACEHOLDERS[kind],
    count,
  }));

  return { text, redactions };
}

/** True if the text still contains something that looks like a personal identifier. */
export function containsPersonalData(text: string): boolean {
  return PATTERNS.some((pattern) => new RegExp(pattern.regex.source).test(text));
}

export function describeRedactions(redactions: readonly Redaction[]): string {
  if (redactions.length === 0) return 'Vi fant ingen fødselsnummer eller kontonummer å fjerne.';
  const labels: Record<RedactionKind, string> = {
    fodselsnummer: 'fødselsnummer',
    kontonummer: 'kontonummer',
    iban: 'kontonummer (IBAN)',
    kortnummer: 'kort- eller kontonummer',
  };
  const parts = redactions.map((entry) => `${entry.count} ${labels[entry.kind]}`);
  return `Fjernet før sending: ${parts.join(', ')}.`;
}
