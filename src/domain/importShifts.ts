/**
 * Parsing pasted shift data: a CSV export from a shift system, a copied table, or something
 * typed by hand. Pure and forgiving about format, strict about what it accepts as a shift.
 *
 * Every line that cannot be read is returned with a reason, so the UI can show the user what
 * was skipped instead of quietly dropping hours.
 */
import { Shift, type DateStr, type ShiftKind, type TimeStr } from './schemas';

export interface ImportResult {
  shifts: Shift[];
  errors: { line: number; text: string; reason: string }[];
}

/**
 * Split a line into fields.
 *
 * Semicolon, tab and pipe are tried first, and a comma only when none of them is present:
 * Norwegian data is full of decimal commas ("0,5 t"), and a comma-first rule would split
 * those in half. With no separator at all, whitespace is used, so a hand-typed
 * "2026-08-17 17:00 22:00 30" also works.
 */
function splitFields(line: string): string[] {
  const separator = [';', '\t', '|'].find((candidate) => line.includes(candidate));
  const parts = separator !== undefined
    ? line.split(separator)
    : line.includes(',')
      ? line.split(',')
      : line.split(/\s+/);
  return parts.map((field) => field.trim()).filter((field) => field !== '');
}

/** Guards against "32.13.2026", which matches the shape of a date but is not one. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normaliseDate(raw: string): DateStr | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    return isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? text : null;
  }

  // 17.08.2026, 17/08/2026, 17-08-2026 and the two-digit-year variants.
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  if (!day || !month || !year) return null;
  const fullYear = year.length === 2 ? `20${year}` : year;
  if (!isRealDate(Number(fullYear), Number(month), Number(day))) return null;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normaliseTime(raw: string): TimeStr | null {
  const text = raw.trim();
  const match = /^(\d{1,2})[:.]?(\d{2})$/.exec(text);
  if (match) {
    const [, hours, minutes] = match;
    if (!hours || !minutes) return null;
    const h = Number(hours);
    const m = Number(minutes);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // A bare hour: "17" means 17:00.
  if (/^\d{1,2}$/.test(text)) {
    const h = Number(text);
    return h <= 23 ? `${String(h).padStart(2, '0')}:00` : null;
  }
  return null;
}

/** "30", "30 min", "0:30" and "0,5 t" all mean half an hour. */
function normaliseBreak(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const text = raw.trim().toLowerCase();
  if (text === '' || text === '-') return 0;

  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const hours = /^(\d+([.,]\d+)?)\s*(t|time|timer|h)$/.exec(text);
  if (hours) return Math.round(Number(hours[1]!.replace(',', '.')) * 60);

  const minutes = /^(\d+)\s*(min|minutt|minutter|m)?$/.exec(text);
  if (minutes) return Number(minutes[1]);

  return null;
}

const HEADER_WORDS = ['dato', 'date', 'start', 'slutt', 'fra', 'til', 'pause', 'vakt', 'break'];

function looksLikeHeader(fields: string[]): boolean {
  const joined = fields.join(' ').toLowerCase();
  return HEADER_WORDS.filter((word) => joined.includes(word)).length >= 2 && normaliseDate(fields[0] ?? '') === null;
}

export function parseShiftPaste(
  input: string,
  options: { kind?: ShiftKind; idPrefix?: string; documentRef?: Shift['documentRef'] } = {},
): ImportResult {
  const kind: ShiftKind = options.kind ?? 'jobbet';
  const prefix = options.idPrefix ?? 'vakt';
  const shifts: Shift[] = [];
  const errors: ImportResult['errors'] = [];

  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    if (raw.trim() === '') continue;

    const fields = splitFields(raw);
    if (fields.length === 0) continue;
    if (looksLikeHeader(fields)) continue;

    if (fields.length < 3) {
      errors.push({ line: index + 1, text: raw.trim(), reason: 'Trenger minst dato, fra og til.' });
      continue;
    }

    const date = normaliseDate(fields[0]!);
    const start = normaliseTime(fields[1]!);
    const end = normaliseTime(fields[2]!);
    const breakMinutes = normaliseBreak(fields[3]);

    if (date === null) {
      errors.push({ line: index + 1, text: raw.trim(), reason: `Forstod ikke datoen «${fields[0]}».` });
      continue;
    }
    if (start === null || end === null) {
      errors.push({ line: index + 1, text: raw.trim(), reason: 'Forstod ikke klokkeslettene.' });
      continue;
    }
    if (breakMinutes === null) {
      errors.push({ line: index + 1, text: raw.trim(), reason: `Forstod ikke pausen «${fields[3]}».` });
      continue;
    }

    const candidate = Shift.safeParse({
      id: `${prefix}-${date}-${start.replace(':', '')}-${index}`,
      date,
      start,
      end,
      breakMinutes,
      kind,
      source: 'import',
      note: null,
      documentRef: options.documentRef ?? null,
    });

    if (!candidate.success) {
      errors.push({ line: index + 1, text: raw.trim(), reason: 'Linja ga ikke en gyldig vakt.' });
      continue;
    }
    shifts.push(candidate.data);
  }

  return { shifts, errors };
}
