import { describe, expect, it } from 'vitest';
import { formatSource, formatSources } from '@/domain/sources';
import { DEFAULT_RULESET } from '@/domain/ruleset';

describe('hvordan kilden skrives ut', () => {
  it('setter paragraf rett etter loven', () => {
    expect(formatSource({ law: 'Arbeidsmiljøloven', paragraph: '§ 10-4', url: null, note: null })).toBe(
      'Arbeidsmiljøloven § 10-4',
    );
  });

  it('skiller med komma når kilden ikke er en paragraf', () => {
    // «Arbeidsavtalen Avtalte tillegg» ser ut som en skrivefeil; «Arbeidsavtalen, Avtalte
    // tillegg» leses som det det er.
    expect(
      formatSource({ law: 'Arbeidsavtalen eller tariffavtalen', paragraph: 'Avtalte tillegg', url: null, note: null }),
    ).toBe('Arbeidsavtalen eller tariffavtalen, Avtalte tillegg');
    expect(formatSource({ law: 'Høyesterett', paragraph: 'HR-2021-2532-A', url: null, note: null })).toBe(
      'Høyesterett, HR-2021-2532-A',
    );
  });

  it('tåler en kilde uten paragraf', () => {
    expect(formatSource({ law: 'Allmenngjøringsloven', paragraph: '  ', url: null, note: null })).toBe(
      'Allmenngjøringsloven',
    );
  });

  it('skriver ut alle kildene i en regel lesbart', () => {
    for (const rule of DEFAULT_RULESET.rules) {
      const text = formatSources(rule.sources);
      expect(text.length, rule.id).toBeGreaterThan(0);
      // Ingen doble mellomrom eller «lov paragraf» uten skilletegn.
      expect(text, rule.id).not.toMatch(/ {2}/);
      for (const source of rule.sources) {
        expect(text, rule.id).toContain(formatSource(source));
      }
    }
  });
});
