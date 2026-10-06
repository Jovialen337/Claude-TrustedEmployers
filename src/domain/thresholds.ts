/**
 * Where every threshold a rule uses comes from.
 *
 * The contract is the primary source. The statutory value in `rules/no_default.json` is only
 * a fallback for what the contract does not say — and, where the law sets a minimum the
 * parties cannot contract away, a floor.
 *
 * Each resolved threshold carries its own provenance, so a flag can state plainly whether it
 * is measuring against your own agreement or against the law, and so a contract term that is
 * weaker than the law becomes a finding of its own instead of quietly lowering the bar.
 */
import type { Contract, Rule } from './schemas';
import { numberParam } from './rules/helpers';

export type ThresholdSource = 'kontrakt' | 'lov';

export interface Threshold {
  value: number;
  source: ThresholdSource;
  /** For evidence: "fra kontrakten din" or "arbeidsmiljøloven § 10-4". */
  label: string;
  /**
   * Set when the contract said something the law does not allow, and the statutory value was
   * used instead. Rules turn this into a finding.
   */
  belowStatutory: { contractValue: number; statutory: number } | null;
}

export const CONTRACT_LABEL = 'fra kontrakten din';

function fromLaw(value: number, law: string): Threshold {
  return { value, source: 'lov', label: law, belowStatutory: null };
}

/**
 * @param direction  'free'      the contract may set any value (working-time limits, which
 *                               an averaging agreement can legitimately raise)
 *                  'atLeast'    the statutory value is a floor (overtime supplement, rest hours)
 *                  'atMost'     the statutory value is a ceiling (how long you may work
 *                               before a break is required)
 */
function resolve(
  contractValue: number | null,
  statutory: number,
  law: string,
  direction: 'free' | 'atLeast' | 'atMost',
): Threshold {
  if (contractValue === null) return fromLaw(statutory, law);

  const worse =
    (direction === 'atLeast' && contractValue < statutory) ||
    (direction === 'atMost' && contractValue > statutory);

  if (worse) {
    return {
      value: statutory,
      source: 'lov',
      label: law,
      belowStatutory: { contractValue, statutory },
    };
  }

  return { value: contractValue, source: 'kontrakt', label: CONTRACT_LABEL, belowStatutory: null };
}

/* ------------------------------------------------ arbeidstid og overtid */

export function dailyLimit(contract: Contract, rule: Rule): Threshold {
  // § 10-5 lets an averaging agreement raise the daily limit, so the contract governs freely.
  return resolve(
    contract.normalDailyLimitHours,
    numberParam(rule, 'normal_daily_limit_hours', 9),
    'arbeidsmiljøloven § 10-4',
    'free',
  );
}

export function weeklyLimit(contract: Contract, rule: Rule): Threshold {
  return resolve(
    contract.normalWeeklyLimitHours,
    numberParam(rule, 'normal_weekly_limit_hours', 40),
    'arbeidsmiljøloven § 10-4',
    'free',
  );
}

export function overtimeSupplementPercent(contract: Contract, rule: Rule): Threshold {
  // § 10-6(11) sets 40 % as a minimum; a tariff agreement commonly gives more.
  return resolve(
    contract.overtimeSupplementPercent,
    numberParam(rule, 'overtime_supplement_percent', 40),
    'arbeidsmiljøloven § 10-6',
    'atLeast',
  );
}

export function maxOvertimePer7Days(contract: Contract, rule: Rule): Threshold {
  // § 10-6(5)–(6): an agreement with tillitsvalgte, or permission from Arbeidstilsynet, can
  // raise these, so a higher contract figure is legitimate.
  return resolve(
    contract.maxOvertimeHoursPer7Days,
    numberParam(rule, 'max_overtime_hours_per_7_days', 10),
    'arbeidsmiljøloven § 10-6',
    'free',
  );
}

export function maxOvertimePer4Weeks(contract: Contract, rule: Rule): Threshold {
  return resolve(
    contract.maxOvertimeHoursPer4Weeks,
    numberParam(rule, 'max_overtime_hours_per_4_weeks', 25),
    'arbeidsmiljøloven § 10-6',
    'free',
  );
}

export function maxOvertimePer52Weeks(contract: Contract, rule: Rule): Threshold {
  return resolve(
    contract.maxOvertimeHoursPer52Weeks,
    numberParam(rule, 'max_overtime_hours_per_52_weeks', 200),
    'arbeidsmiljøloven § 10-6',
    'free',
  );
}

/* --------------------------------------------------------- arbeidsfri */

export function dailyRest(contract: Contract, rule: Rule): Threshold {
  // § 10-8(3): an agreement may reduce the 11 hours, but never below 8.
  const floor = numberParam(rule, 'min_daily_rest_hours_by_agreement', 8);
  const statutory = numberParam(rule, 'min_daily_rest_hours', 11);
  if (contract.agreedDailyRestHours === null) return fromLaw(statutory, 'arbeidsmiljøloven § 10-8');
  if (contract.agreedDailyRestHours < floor) {
    return {
      value: floor,
      source: 'lov',
      label: 'arbeidsmiljøloven § 10-8',
      belowStatutory: { contractValue: contract.agreedDailyRestHours, statutory: floor },
    };
  }
  return {
    value: contract.agreedDailyRestHours,
    source: 'kontrakt',
    label: CONTRACT_LABEL,
    belowStatutory: null,
  };
}

export function weeklyRest(contract: Contract, rule: Rule): Threshold {
  const floor = numberParam(rule, 'min_weekly_rest_hours_by_agreement', 28);
  const statutory = numberParam(rule, 'min_weekly_rest_hours', 35);
  if (contract.agreedWeeklyRestHours === null) return fromLaw(statutory, 'arbeidsmiljøloven § 10-8');
  if (contract.agreedWeeklyRestHours < floor) {
    return {
      value: floor,
      source: 'lov',
      label: 'arbeidsmiljøloven § 10-8',
      belowStatutory: { contractValue: contract.agreedWeeklyRestHours, statutory: floor },
    };
  }
  return {
    value: contract.agreedWeeklyRestHours,
    source: 'kontrakt',
    label: CONTRACT_LABEL,
    belowStatutory: null,
  };
}

/* ------------------------------------------------------------ pauser */

export function breakRequiredAfterHours(contract: Contract, rule: Rule): Threshold {
  // A contract may require a break sooner than the law, never later.
  return resolve(
    contract.breakRequiredAfterHours,
    numberParam(rule, 'break_required_after_hours', 5.5),
    'arbeidsmiljøloven § 10-9',
    'atMost',
  );
}

export function longDayHours(contract: Contract, rule: Rule): Threshold {
  return resolve(
    contract.longDayHours,
    numberParam(rule, 'long_day_hours', 8),
    'arbeidsmiljøloven § 10-9',
    'atMost',
  );
}

export function minBreakMinutesLongDay(contract: Contract, rule: Rule): Threshold {
  return resolve(
    contract.minBreakMinutesLongDay,
    numberParam(rule, 'min_total_break_minutes_long_day', 30),
    'arbeidsmiljøloven § 10-9',
    'atLeast',
  );
}

/* ------------------------------------------- større stilling og feriepenger */

export function largerPositionLookbackMonths(contract: Contract, rule: Rule): Threshold {
  // A tariff agreement may give the right after a shorter period than twelve months.
  return resolve(
    contract.largerPositionLookbackMonths,
    numberParam(rule, 'lookback_months', 12),
    'arbeidsmiljøloven § 14-4 a',
    'free',
  );
}

export function feriepengerRatePercent(contract: Contract, rule: Rule): Threshold {
  // Ferieloven § 10 sets 10,2 % as a minimum; five agreed weeks normally gives 12 %.
  return resolve(
    contract.feriepengerRatePercent,
    numberParam(rule, 'rate_percent_statutory', 10.2),
    'ferieloven § 10',
    'atLeast',
  );
}

/** For an evidence row: "9,0 t (arbeidsmiljøloven § 10-4)". */
export function withSource(formatted: string, threshold: Threshold): string {
  return `${formatted} (${threshold.label})`;
}
