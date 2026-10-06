/**
 * How a rule's source is written out.
 *
 * "Arbeidsmiljøloven § 10-4" reads as one thing; "Arbeidsavtalen Avtalte tillegg" reads as a
 * mistake. A contract point is not a paragraph, so it gets a comma. One function, used by the
 * screen, the PDF and the draft message alike, so the three cannot drift apart.
 */
import type { RuleSource } from './schemas';

export function formatSource(source: RuleSource): string {
  if (source.paragraph.trim() === '') return source.law;
  const separator = source.paragraph.startsWith('§') ? ' ' : ', ';
  return `${source.law}${separator}${source.paragraph}`;
}

export function formatSources(sources: readonly RuleSource[]): string {
  return sources.map(formatSource).join('; ');
}
