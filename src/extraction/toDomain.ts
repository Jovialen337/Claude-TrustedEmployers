/**
 * Mapping what was read out of a document into the domain model.
 *
 * Kroner become øre here, ids are generated here, and defaults are filled in here — not by
 * the model. A field the model left null stays null (or falls back to what the user already
 * had), so a missing value never quietly becomes a zero.
 */
import { oreFromKr } from '../domain/money';
import {
  Contract,
  Payslip,
  Shift,
  type DocumentRef,
  type Supplement,
} from '../domain/schemas';
import type { ExtractedContract, ExtractedPayslip, ExtractedSchedule } from './schemas';

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSupplement(extracted: ExtractedContract['supplements'][number]): Supplement | null {
  const rate =
    extracted.rateKroner !== null
      ? ({ kind: 'per_hour_ore', value: oreFromKr(extracted.rateKroner) } as const)
      : extracted.ratePercent !== null
        ? ({ kind: 'percent', value: extracted.ratePercent } as const)
        : null;
  // A supplement with no rate cannot be checked against anything, so it is dropped rather
  // than stored as a zero the user might not notice.
  if (rate === null) return null;

  return {
    id: id('tillegg'),
    label: extracted.label,
    kind: extracted.kind,
    fromTime: extracted.fromTime,
    toTime: extracted.toTime,
    weekdays: extracted.kind === 'helg' ? [6, 7] : null,
    rate,
    source: extracted.source ?? 'Lest fra dokumentet',
  };
}

export function contractFromExtraction(
  extracted: ExtractedContract,
  existing: Contract | null,
  settingsFullTime: number,
  documentRef: DocumentRef | null,
): { contract: Contract; droppedSupplements: number } {
  const supplements = extracted.supplements.map(toSupplement);
  const kept = supplements.filter((supplement): supplement is Supplement => supplement !== null);

  const wageKind = extracted.wageKind ?? existing?.wage.kind ?? 'hourly';
  const wageOre =
    extracted.wageKroner !== null ? oreFromKr(extracted.wageKroner) : (existing?.wage.amountOre ?? 0);

  const candidate = {
    id: existing?.id ?? id('kontrakt'),
    employer: extracted.employer ?? existing?.employer ?? '',
    employeeName: extracted.employeeName ?? existing?.employeeName ?? '',
    startDate: extracted.startDate ?? existing?.startDate ?? '2020-01-01',
    endDate: existing?.endDate ?? null,
    stillingsprosent: extracted.stillingsprosent ?? existing?.stillingsprosent ?? 0,
    fullTimeHoursPerWeek:
      extracted.fullTimeHoursPerWeek ?? existing?.fullTimeHoursPerWeek ?? settingsFullTime,
    contractedHoursPerWeek: extracted.contractedHoursPerWeek ?? existing?.contractedHoursPerWeek ?? null,
    wage: { kind: wageKind, amountOre: wageOre },
    tariffavtale: extracted.tariffavtale ?? existing?.tariffavtale ?? null,
    averagingAgreement: extracted.averagingAgreement ?? existing?.averagingAgreement ?? false,

    // Agreed terms: what the document said, else what the user already had, else null —
    // which is what makes the rules fall back to the law.
    normalDailyLimitHours: extracted.normalDailyLimitHours ?? existing?.normalDailyLimitHours ?? null,
    normalWeeklyLimitHours: extracted.normalWeeklyLimitHours ?? existing?.normalWeeklyLimitHours ?? null,
    overtimeSupplementPercent:
      extracted.overtimeSupplementPercent ?? existing?.overtimeSupplementPercent ?? null,
    maxOvertimeHoursPer7Days: existing?.maxOvertimeHoursPer7Days ?? null,
    maxOvertimeHoursPer4Weeks: existing?.maxOvertimeHoursPer4Weeks ?? null,
    maxOvertimeHoursPer52Weeks: existing?.maxOvertimeHoursPer52Weeks ?? null,
    agreedDailyRestHours: extracted.agreedDailyRestHours ?? existing?.agreedDailyRestHours ?? null,
    agreedWeeklyRestHours: extracted.agreedWeeklyRestHours ?? existing?.agreedWeeklyRestHours ?? null,
    breakRequiredAfterHours: extracted.breakRequiredAfterHours ?? existing?.breakRequiredAfterHours ?? null,
    longDayHours: existing?.longDayHours ?? null,
    minBreakMinutesLongDay: extracted.minBreakMinutesLongDay ?? existing?.minBreakMinutesLongDay ?? null,
    paidBreak: extracted.paidBreak ?? existing?.paidBreak ?? false,
    largerPositionLookbackMonths: existing?.largerPositionLookbackMonths ?? null,
    feriepengerRatePercent: extracted.feriepengerRatePercent ?? existing?.feriepengerRatePercent ?? null,
    sundayWorkAgreement: existing?.sundayWorkAgreement ?? false,
    nightWorkAgreement: existing?.nightWorkAgreement ?? false,
    allmenngjortMinimumHourlyOre: existing?.allmenngjortMinimumHourlyOre ?? null,

    jobTitle: extracted.jobTitle ?? existing?.jobTitle ?? null,
    workplace: extracted.workplace ?? existing?.workplace ?? null,
    employmentType: extracted.employmentType ?? existing?.employmentType ?? 'fast',
    temporaryBasis: extracted.temporaryBasis ?? existing?.temporaryBasis ?? null,
    // § 10-12 is never inferred from a document: the app asks the worker, because the
    // exemption turns off the working-time rules entirely.
    workingTimeExemption: existing?.workingTimeExemption ?? 'ingen',
    noticePeriodMonths: extracted.noticePeriodMonths ?? existing?.noticePeriodMonths ?? null,
    probationMonths: extracted.probationMonths ?? existing?.probationMonths ?? null,
    payDayOfMonth:
      extracted.payDayOfMonth !== null && extracted.payDayOfMonth >= 1 && extracted.payDayOfMonth <= 31
        ? Math.round(extracted.payDayOfMonth)
        : (existing?.payDayOfMonth ?? null),
    industry: existing?.industry ?? null,
    supplements: kept.length > 0 ? kept : (existing?.supplements ?? []),
    documentRef: documentRef ?? existing?.documentRef ?? null,
  };

  return {
    contract: Contract.parse(candidate),
    droppedSupplements: supplements.length - kept.length,
  };
}

export function payslipFromExtraction(
  extracted: ExtractedPayslip,
  documentRef: DocumentRef | null,
): Payslip {
  return Payslip.parse({
    id: id('slipp'),
    periodStart: extracted.periodStart ?? '2020-01-01',
    periodEnd: extracted.periodEnd ?? '2020-01-31',
    lines: extracted.lines.map((line) => ({
      id: id('linje'),
      category: line.category,
      label: line.label,
      hours: line.hours,
      rateOre: line.rateKroner === null ? null : oreFromKr(line.rateKroner),
      amountOre: oreFromKr(line.amountKroner),
    })),
    grossOre: extracted.grossKroner === null ? null : oreFromKr(extracted.grossKroner),
    feriepengerBasisOre:
      extracted.feriepengerBasisKroner === null ? null : oreFromKr(extracted.feriepengerBasisKroner),
    feriepengerAccruedOre:
      extracted.feriepengerAccruedKroner === null ? null : oreFromKr(extracted.feriepengerAccruedKroner),
    documentRef,
  });
}

export function shiftsFromExtraction(
  extracted: ExtractedSchedule,
  documentRef: DocumentRef | null,
): { shifts: Shift[]; skipped: number } {
  const shifts: Shift[] = [];
  let skipped = 0;

  for (const entry of extracted.shifts) {
    const candidate = Shift.safeParse({
      id: id('vakt'),
      date: entry.date,
      start: entry.start,
      end: entry.end,
      breakMinutes: entry.breakMinutes ?? 0,
      kind: extracted.kind ?? 'jobbet',
      source: 'ai',
      note: null,
      documentRef,
    });
    if (candidate.success) shifts.push(candidate.data);
    else skipped += 1;
  }

  return { shifts, skipped };
}

/** Everything a confirmation screen needs before anything is written to the workspace. */
export interface Proposal {
  kind: 'kontrakt' | 'lonnsslipp' | 'vaktplan';
  contract?: Contract;
  payslip?: Payslip;
  shifts?: Shift[];
  notes: string[];
  warnings: string[];
  redactionSummary: string;
  documentName: string;
}
