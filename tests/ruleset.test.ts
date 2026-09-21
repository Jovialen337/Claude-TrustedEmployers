import { describe, expect, it } from 'vitest';
import { RULE_IDS } from '@/domain/schemas';
import { DEFAULT_RULESET, applyOverrides, enabledRules, ruleById } from '@/domain/ruleset';

describe('standardregelsettet', () => {
  it('validerer mot skjemaet og dekker alle reglene', () => {
    expect(DEFAULT_RULESET.id).toBe('no_default');
    expect(DEFAULT_RULESET.jurisdiction).toBe('NO');
    expect(DEFAULT_RULESET.rules.map((rule) => rule.id).sort()).toEqual([...RULE_IDS].sort());
  });

  it('har kilde, forklaring og tittel på hver regel', () => {
    for (const rule of DEFAULT_RULESET.rules) {
      expect(rule.sources.length, `${rule.id} mangler kilde`).toBeGreaterThan(0);
      expect(rule.explanation.length, `${rule.id} mangler forklaring`).toBeGreaterThan(40);
      expect(rule.title.length).toBeGreaterThan(3);
      for (const source of rule.sources) {
        expect(source.paragraph.length, `${rule.id} mangler paragrafhenvisning`).toBeGreaterThan(0);
      }
    }
  });

  it('har ingen hardkodede tillegg-satser i lovreglene', () => {
    // Kvelds-/natt-/helgetillegg følger av kontrakt eller tariff, aldri av regelsettet.
    const supplements = ruleById(DEFAULT_RULESET, 'supplements');
    expect(supplements).not.toBeNull();
    const paramKeys = Object.keys(supplements!.params);
    expect(paramKeys).toEqual(['tolerance_ore']);

    // Ingen regel i regelsettet skal inneholde en tilleggssats som en parameterverdi —
    // slike satser er brukerdata fra kontrakt/tariff. (Lovens 40 % overtidstillegg og
    // ferielovens prosentsatser er lovbestemte og hører hjemme her.)
    const lawfulRateParams = new Set([
      'overtime_supplement_percent',
      'rate_percent_statutory',
      'rate_percent_five_weeks',
      'rate_percent_over_60',
    ]);
    for (const rule of DEFAULT_RULESET.rules) {
      for (const key of Object.keys(rule.params)) {
        if (lawfulRateParams.has(key)) continue;
        expect(key, `${rule.id}.${key} ser ut som en avtalt sats`).not.toMatch(
          /per_hour|tillegg|supplement_ore|_sats/i,
        );
      }
    }
  });

  it('bruker lovens satser som standard', () => {
    expect(ruleById(DEFAULT_RULESET, 'overtime')!.params.overtime_supplement_percent).toBe(40);
    expect(ruleById(DEFAULT_RULESET, 'overtime')!.params.normal_daily_limit_hours).toBe(9);
    expect(ruleById(DEFAULT_RULESET, 'overtime')!.params.normal_weekly_limit_hours).toBe(40);
    expect(ruleById(DEFAULT_RULESET, 'rest_periods')!.params.min_daily_rest_hours).toBe(11);
    expect(ruleById(DEFAULT_RULESET, 'rest_periods')!.params.min_weekly_rest_hours).toBe(35);
    expect(ruleById(DEFAULT_RULESET, 'feriepenger')!.params.rate_percent_statutory).toBe(10.2);
  });

  it('lar brukeren overstyre terskler og skru av regler', () => {
    const overridden = applyOverrides(DEFAULT_RULESET, {
      overtime: { params: { normal_weekly_limit_hours: 38 } },
      feriepenger: { enabled: false },
    });
    expect(ruleById(overridden, 'overtime')!.params.normal_weekly_limit_hours).toBe(38);
    // Andre parametre i samme regel beholdes.
    expect(ruleById(overridden, 'overtime')!.params.overtime_supplement_percent).toBe(40);
    expect(ruleById(overridden, 'feriepenger')!.enabled).toBe(false);
    expect(enabledRules(overridden).map((r) => r.id)).not.toContain('feriepenger');
    // Standardsettet er urørt.
    expect(ruleById(DEFAULT_RULESET, 'overtime')!.params.normal_weekly_limit_hours).toBe(40);
  });
});
