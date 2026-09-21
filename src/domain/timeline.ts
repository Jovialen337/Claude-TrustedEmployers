/**
 * The week-by-week view model: contract, schedule and payslip side by side.
 *
 * `paidHours` is deliberately null unless a payslip covers exactly that week. A monthly
 * payslip states hours for the whole month, and spreading them over the weeks would be
 * invented data — the week row points at the payslip period instead.
 */
import { payslipCovering, payslipSummary, payslipsOverlapping, type Bucket } from './aggregate';
import type { DateStr, Flag, Payslip, Severity } from './schemas';
import { SEVERITY_ORDER } from './schemas';

export interface TimelineWeek {
  key: string;
  label: string;
  start: DateStr;
  end: DateStr;
  /** Complete = the week lies fully inside the data we have, so it can be judged. */
  complete: boolean;
  contractedHours: number;
  plannedHours: number;
  workedHours: number;
  paidHours: number | null;
  payslipLabels: string[];
  flagIds: string[];
  worstSeverity: Severity | null;
  amountOre: number;
}

export function buildTimeline(
  weeks: readonly Bucket[],
  payslips: readonly Payslip[],
  flags: readonly Flag[],
  contractedWeeklyHours: number,
  dataRange: { start: DateStr; end: DateStr } | null,
): TimelineWeek[] {
  return weeks.map((week) => {
    const exact = payslipCovering(payslips, week.start, week.end);
    const overlapping = payslipsOverlapping(payslips, week.start, week.end);
    const weekFlags = flags.filter((flag) => flag.periodStart <= week.end && flag.periodEnd >= week.start);

    const worstSeverity = weekFlags.reduce<Severity | null>((worst, flag) => {
      if (worst === null) return flag.severity;
      return SEVERITY_ORDER[flag.severity] < SEVERITY_ORDER[worst] ? flag.severity : worst;
    }, null);

    return {
      key: week.key,
      label: week.label,
      start: week.start,
      end: week.end,
      complete: dataRange !== null && week.start >= dataRange.start && week.end <= dataRange.end,
      contractedHours: contractedWeeklyHours,
      plannedHours: week.plannedHours,
      workedHours: week.workedHours,
      paidHours: exact ? payslipSummary(exact).paidWorkHours : null,
      payslipLabels: overlapping.map((payslip) => payslipSummary(payslip).label),
      flagIds: weekFlags.map((flag) => flag.id),
      worstSeverity,
      amountOre: weekFlags.reduce((sum, flag) => sum + (flag.amountOre ?? 0), 0),
    };
  });
}
