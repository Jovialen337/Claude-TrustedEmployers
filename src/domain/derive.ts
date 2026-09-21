/**
 * Values derived from the contract. Kept in one place so that every rule agrees on what
 * "contracted hours" and "your hourly rate" mean.
 */
import type { Contract, RuleParams } from './schemas';

/** Contracted weekly hours: the explicit figure if the contract states one, else stillingsprosent × full time. */
export function contractedHoursPerWeek(contract: Contract): number {
  if (contract.contractedHoursPerWeek !== null) return contract.contractedHoursPerWeek;
  return (contract.stillingsprosent / 100) * contract.fullTimeHoursPerWeek;
}

export function contractedHoursPerWeekExplanation(contract: Contract): string {
  if (contract.contractedHoursPerWeek !== null) {
    return 'Avtalt arbeidstid står direkte i kontrakten.';
  }
  return `${contract.stillingsprosent} % av ${contract.fullTimeHoursPerWeek} t full stilling`;
}

/**
 * The hourly rate used for money estimates.
 *
 * For a monthly salary we convert with 52 weeks a year: timelønn = månedslønn × 12 / (avtalt
 * uketimer × 52). For 37,5 t/uke that is the familiar ~1950 hours a year. See DECISIONS.md.
 */
export function effectiveHourlyRateOre(contract: Contract): number {
  if (contract.wage.kind === 'hourly') return contract.wage.amountOre;
  const weekly = contractedHoursPerWeek(contract);
  if (weekly <= 0) return 0;
  return Math.round((contract.wage.amountOre * 12) / (weekly * 52));
}

export function hourlyRateExplanation(contract: Contract): string {
  if (contract.wage.kind === 'hourly') return 'Timelønn fra kontrakten.';
  return `Månedslønn × 12 / (${contractedHoursPerWeek(contract)} t/uke × 52 uker)`;
}

function numberParam(params: RuleParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
}

/** Normal daily working-hours limit (AML § 10-4), or the agreed override from the contract. */
export function normalDailyLimitHours(contract: Contract, params: RuleParams): number {
  return contract.normalDailyLimitHours ?? numberParam(params, 'normal_daily_limit_hours', 9);
}

/** Normal weekly working-hours limit (AML § 10-4), or the agreed override from the contract. */
export function normalWeeklyLimitHours(contract: Contract, params: RuleParams): number {
  return contract.normalWeeklyLimitHours ?? numberParam(params, 'normal_weekly_limit_hours', 40);
}

export { numberParam };
