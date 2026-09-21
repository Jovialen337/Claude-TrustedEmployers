/**
 * Money is integer øre everywhere. Formatting is done by hand rather than with Intl so
 * that a number renders identically in the browser, in a unit test and in the PDF report,
 * regardless of the ICU data available.
 */

/**
 * 198.5 kr -> 19850 øre.
 *
 * `kr * 100` alone is not safe: 1.005 * 100 is 100.49999999999999 in binary floating
 * point, which would round down to 100 øre and quietly lose an øre. Normalising through
 * toPrecision(12) first removes the representation error before rounding.
 */
export function oreFromKr(kr: number): number {
  return Math.round(Number((kr * 100).toPrecision(12)));
}

/**
 * Parse money the way a Norwegian user types it ("198,50", "1 234,5", "-20") into øre,
 * without going through a float at all. Returns null for anything unparseable, so the UI
 * can show an error instead of silently reading 0.
 */
export function parseKrInput(text: string): number | null {
  const cleaned = text.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const digits = negative ? cleaned.slice(1) : cleaned;
  const [whole = '0', fraction = ''] = digits.split('.');
  if (whole === '' && fraction === '') return null;
  const ore = Number(whole || '0') * 100 + Number((fraction + '00').slice(0, 2) || '0');
  return negative ? -ore : ore;
}

/** Parse hours the way a Norwegian user types them ("7,5"). Returns null if unparseable. */
export function parseHoursInput(text: string): number | null {
  const ore = parseKrInput(text);
  return ore === null ? null : ore / 100;
}

export function krFromOre(ore: number): number {
  return ore / 100;
}

/** Multiply øre by a factor (e.g. 0.4 for an overtime supplement), rounded to whole øre. */
export function mulOre(ore: number, factor: number): number {
  return Math.round(ore * factor);
}

/** Hours × øre-per-hour -> øre. */
export function hoursTimesRate(hours: number, rateOre: number): number {
  return Math.round(hours * rateOre);
}

export function sumOre(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ' ';
    out += digits[i];
  }
  return out;
}

/** 49625 -> "496,25". 123456789 -> "1 234 567,89". */
export function formatOre(ore: number): string {
  const negative = ore < 0;
  const abs = Math.abs(Math.round(ore));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const text = `${groupThousands(String(whole))},${String(cents).padStart(2, '0')}`;
  return negative ? `−${text}` : text;
}

/** 49625 -> "496,25 kr". */
export function formatKr(ore: number): string {
  return `${formatOre(ore)} kr`;
}

/** Round hours the way they are shown: 2 decimals max. */
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/** 16 -> "16,0". 2.25 -> "2,25". 18.5 -> "18,5". */
export function formatHoursNumber(hours: number): string {
  const rounded = roundHours(hours);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs);
  const hundredths = Math.round((abs - whole) * 100);
  const decimals = hundredths % 10 === 0 ? String(hundredths / 10) : String(hundredths).padStart(2, '0');
  const text = `${groupThousands(String(whole))},${decimals}`;
  return negative ? `−${text}` : text;
}

/** 18.5 -> "18,5 t". */
export function formatHours(hours: number): string {
  return `${formatHoursNumber(hours)} t`;
}

export function formatPercent(value: number): string {
  return `${formatHoursNumber(value).replace(',0', '')} %`;
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}
