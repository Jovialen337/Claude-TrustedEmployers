/**
 * Loading the ruleset and applying the user's own overrides.
 *
 * The default file (rules/no_default.json) is never written to. Anything the user changes
 * — a different full-time week, a tariff-agreed limit, a rule switched off — is stored as
 * an override in their workspace and applied on top at load time.
 */
import defaultRuleSetJson from '../../rules/no_default.json';
import { RuleSet, type Rule, type RuleId, type RuleOverride, type RuleParams } from './schemas';

export const DEFAULT_RULESET: RuleSet = RuleSet.parse(defaultRuleSetJson);

export function ruleById(ruleSet: RuleSet, id: RuleId): Rule | null {
  return ruleSet.rules.find((rule) => rule.id === id) ?? null;
}

export function applyOverrides(
  ruleSet: RuleSet,
  overrides: Partial<Record<RuleId, RuleOverride>>,
): RuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map((rule) => {
      const override = overrides[rule.id];
      if (!override) return rule;
      const params: RuleParams = { ...rule.params, ...(override.params ?? {}) };
      return { ...rule, enabled: override.enabled ?? rule.enabled, params };
    }),
  };
}

export function enabledRules(ruleSet: RuleSet): Rule[] {
  return ruleSet.rules.filter((rule) => rule.enabled);
}
