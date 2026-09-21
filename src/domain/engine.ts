/**
 * The rules engine.
 *
 * Builds the shared context once, runs every enabled rule over it, then sorts the flags and
 * adds up the money. Pure and synchronous: given the same workspace it always produces the
 * same result, which is what lets the demo be asserted to the øre in a unit test.
 */
import { effectiveShifts, monthBuckets, payslipSummary, plannedShifts, segmentsOf, weekBuckets } from './aggregate';
import { applyPaidBreak, contractedHoursPerWeek, effectiveHourlyRateOre } from './derive';
import { applyOverrides, DEFAULT_RULESET } from './ruleset';
import { actualHoursVsContract } from './rules/actualHours';
import { breaks } from './rules/breaks';
import { feriepenger } from './rules/feriepenger';
import { hoursVsStillingsprosent } from './rules/hoursVsStillingsprosent';
import { overtime } from './rules/overtime';
import { restPeriods } from './rules/rest';
import { scheduledVsPaid } from './rules/scheduledVsPaid';
import { supplements } from './rules/supplements';
import type { RuleContext, RuleFn } from './rules/types';
import { SEVERITY_ORDER, type DateStr, type Flag, type RuleId, type RuleSet, type Severity, type Workspace } from './schemas';
import { buildTimeline, type TimelineWeek } from './timeline';

export const RULE_IMPLEMENTATIONS: Record<RuleId, RuleFn> = {
  hours_vs_stillingsprosent: hoursVsStillingsprosent,
  overtime,
  rest_periods: restPeriods,
  breaks,
  actual_hours_vs_contract: actualHoursVsContract,
  scheduled_vs_paid: scheduledVsPaid,
  supplements,
  feriepenger,
};

/** Rules whose amounts are work you did but were not paid for. These make the headline total. */
export const MONEY_OWED_RULES: RuleId[] = ['scheduled_vs_paid', 'overtime', 'supplements'];
/** Hours your stillingsprosent entitled you to but that you were never given — a separate figure. */
export const UNDER_SCHEDULED_RULES: RuleId[] = ['hours_vs_stillingsprosent'];

export interface CheckTotals {
  estimatedOwedOre: number;
  underScheduledOre: number;
  feriepengerToCheckOre: number;
  hoursShortVsContract: number;
  contractedWeeklyHours: number;
  averageWeeklyHours: number;
  weeksObserved: number;
  bySeverity: Record<Severity, number>;
  flagCount: number;
}

export interface CheckResult {
  generatedAt: string;
  ruleSet: { id: string; version: string; name: string };
  dataRange: { start: DateStr; end: DateStr } | null;
  flags: Flag[];
  totals: CheckTotals;
  timeline: TimelineWeek[];
  /** Why a check could not be run, in plain Norwegian, if that is the case. */
  blockers: string[];
  hourlyRateOre: number;
}

function dataRangeOf(workspace: Workspace): { start: DateStr; end: DateStr } | null {
  const dates: DateStr[] = [];
  for (const segment of segmentsOf(workspace.shifts)) dates.push(segment.date);
  for (const payslip of workspace.payslips) dates.push(payslip.periodStart, payslip.periodEnd);
  if (dates.length === 0) return null;
  dates.sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}

export function emptyTotals(contractedWeeklyHours = 0): CheckTotals {
  return {
    estimatedOwedOre: 0,
    underScheduledOre: 0,
    feriepengerToCheckOre: 0,
    hoursShortVsContract: 0,
    contractedWeeklyHours,
    averageWeeklyHours: 0,
    weeksObserved: 0,
    bySeverity: { sannsynlig_feil: 0, bor_sjekkes: 0, til_info: 0 },
    flagCount: 0,
  };
}

export interface RunCheckOptions {
  ruleSet?: RuleSet;
  now?: string;
}

export function runCheck(workspace: Workspace, options: RunCheckOptions = {}): CheckResult {
  const now = options.now ?? new Date().toISOString();
  const ruleSet = applyOverrides(options.ruleSet ?? DEFAULT_RULESET, workspace.ruleOverrides);
  const blockers: string[] = [];

  if (!workspace.contract) blockers.push('Vi mangler arbeidskontrakten din. Legg den inn for å få sjekket noe.');
  if (workspace.shifts.length === 0) blockers.push('Vi mangler vakter eller timer. Legg inn vaktplanen din.');
  if (workspace.payslips.length === 0) {
    blockers.push('Vi mangler lønnsslipper. Uten dem kan vi ikke sjekke om timene er betalt.');
  }

  const contract = workspace.contract;
  if (!contract) {
    return {
      generatedAt: now,
      ruleSet: { id: ruleSet.id, version: ruleSet.version, name: ruleSet.name },
      dataRange: dataRangeOf(workspace),
      flags: [],
      totals: emptyTotals(),
      timeline: [],
      blockers,
      hourlyRateOre: 0,
    };
  }

  const dataRange = dataRangeOf(workspace);
  // Hours are counted from these: identical to the stored shifts unless the contract says
  // breaks are paid, in which case the break is working time.
  const workTimeShifts = applyPaidBreak(contract, workspace.shifts);
  // Buckets span the whole data range, so a week or month with no shifts at all is still
  // visible instead of silently missing.
  const weeks = weekBuckets(workTimeShifts, dataRange);
  const months = monthBuckets(workTimeShifts, dataRange);
  const contractedWeeklyHours = contractedHoursPerWeek(contract);
  const hourlyRateOre = effectiveHourlyRateOre(contract);

  const baseContext: Omit<RuleContext, 'rule'> = {
    contract,
    shifts: workspace.shifts,
    workTimeShifts,
    payslips: workspace.payslips,
    effective: segmentsOf(effectiveShifts(workTimeShifts)),
    planned: segmentsOf(plannedShifts(workTimeShifts)),
    weeks,
    months,
    summaries: [...workspace.payslips]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      .map(payslipSummary),
    hourlyRateOre,
    contractedWeeklyHours,
    fullTimeHoursPerWeek: contract.fullTimeHoursPerWeek,
    dataRange,
  };

  const flags: Flag[] = [];
  for (const rule of ruleSet.rules) {
    if (!rule.enabled) continue;
    const implementation = RULE_IMPLEMENTATIONS[rule.id];
    flags.push(...implementation({ ...baseContext, rule }));
  }

  flags.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.amountOre ?? 0) - (a.amountOre ?? 0) ||
      a.periodStart.localeCompare(b.periodStart) ||
      a.id.localeCompare(b.id),
  );

  const completeWeeks = weeks.filter(
    (week) => dataRange !== null && week.start >= dataRange.start && week.end <= dataRange.end,
  );
  const workedInCompleteWeeks = completeWeeks.reduce((sum, week) => sum + week.workedHours, 0);

  const sumAmounts = (ruleIds: readonly RuleId[]) =>
    flags
      .filter((flag) => ruleIds.includes(flag.ruleId))
      .reduce((sum, flag) => sum + (flag.amountOre ?? 0), 0);

  const totals: CheckTotals = {
    estimatedOwedOre: sumAmounts(MONEY_OWED_RULES),
    underScheduledOre: sumAmounts(UNDER_SCHEDULED_RULES),
    feriepengerToCheckOre: sumAmounts(['feriepenger']),
    hoursShortVsContract: Math.round(
      completeWeeks.reduce((sum, week) => sum + Math.max(0, contractedWeeklyHours - week.workedHours), 0) * 100,
    ) / 100,
    contractedWeeklyHours,
    averageWeeklyHours: completeWeeks.length > 0 ? workedInCompleteWeeks / completeWeeks.length : 0,
    weeksObserved: completeWeeks.length,
    bySeverity: {
      sannsynlig_feil: flags.filter((flag) => flag.severity === 'sannsynlig_feil').length,
      bor_sjekkes: flags.filter((flag) => flag.severity === 'bor_sjekkes').length,
      til_info: flags.filter((flag) => flag.severity === 'til_info').length,
    },
    flagCount: flags.length,
  };

  return {
    generatedAt: now,
    ruleSet: { id: ruleSet.id, version: ruleSet.version, name: ruleSet.name },
    dataRange,
    flags,
    totals,
    timeline: buildTimeline(weeks, workspace.payslips, flags, contractedWeeklyHours, dataRange),
    blockers,
    hourlyRateOre,
  };
}
