/**
 * The contract every rule follows.
 *
 * A rule is a pure function: same context in, same flags out. No network, no clock, no
 * randomness — which is what makes every flag in the UI reproducible in a unit test.
 */
import type { Bucket, PayslipSummary, SegmentWithShift } from '../aggregate';
import type { Contract, DateStr, Flag, Payslip, Rule, Shift } from '../schemas';

export interface RuleContext {
  contract: Contract;
  shifts: Shift[];
  payslips: Payslip[];
  /** The rule being run, with the user's overrides already applied. */
  rule: Rule;

  /** Segments of the shifts that count (registered hours beat the plan). */
  effective: SegmentWithShift[];
  /** Segments of the planned shifts, kept so the timeline can show plan vs reality. */
  planned: SegmentWithShift[];
  weeks: Bucket[];
  months: Bucket[];
  summaries: PayslipSummary[];

  hourlyRateOre: number;
  contractedWeeklyHours: number;
  fullTimeHoursPerWeek: number;

  /** The span actually covered by data. Partial weeks/months at the edges are not flagged. */
  dataRange: { start: DateStr; end: DateStr } | null;
}

export type RuleFn = (context: RuleContext) => Flag[];
