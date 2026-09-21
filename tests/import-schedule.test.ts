/**
 * Uploading a work schedule. The route is exercised directly, with no server and no API key,
 * because this is the path that has to work for someone who never sets a key up at all.
 */
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/import-schedule/route';
import { formatHours } from '@/domain/money';
import { shiftWorkedHours } from '@/domain/time';
import type { Shift } from '@/domain/schemas';

async function upload(
  content: string | Uint8Array<ArrayBuffer>,
  name: string,
  type: string,
  kind = 'jobbet',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = new FormData();
  body.set('file', new File([content], name, { type }));
  body.set('kind', kind);
  const response = await POST(new Request('http://localhost/api/import-schedule', { method: 'POST', body }));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const CSV = ['dato;start;slutt;pause', '2026-08-17;17:00;22:00;0', '2026-08-20;22:00;06:00;30'].join('\n');

describe('last opp vaktplan', () => {
  it('leser en CSV-eksport uten å trenge API-nøkkel', async () => {
    const { status, body } = await upload(CSV, 'vaktplan.csv', 'text/csv');
    expect(status).toBe(200);
    const shifts = body.shifts as Shift[];
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({ date: '2026-08-17', start: '17:00', end: '22:00', kind: 'jobbet' });
    // Nattevakta over midnatt skal komme gjennom med sluttiden som den står.
    expect(shifts[1]).toMatchObject({ date: '2026-08-20', start: '22:00', end: '06:00', breakMinutes: 30 });
    expect(formatHours(shifts.reduce((sum, shift) => sum + shiftWorkedHours(shift), 0))).toBe('12,5 t');
    expect(body.readAs).toBe('tekst');
  });

  it('merker vaktene som planlagte når brukeren sier det er en plan', async () => {
    const { body } = await upload(CSV, 'plan.csv', 'text/csv', 'planlagt');
    expect((body.shifts as Shift[]).every((shift) => shift.kind === 'planlagt')).toBe(true);
  });

  it('henger dokumentnavnet på hver vakt, så funnene kan peke tilbake', async () => {
    const { body } = await upload(CSV, 'august.csv', 'text/csv');
    const shifts = body.shifts as Shift[];
    expect(shifts[0]!.documentRef).toMatchObject({ docName: 'august.csv', kind: 'vaktplan' });
    expect(shifts[0]!.source).toBe('import');
  });

  it('sier hvilke rader som ikke kunne leses, uten å droppe resten', async () => {
    const { status, body } = await upload(
      ['2026-08-17;17:00;22:00;0', 'tull', '32.13.2026;10:00;12:00'].join('\n'),
      'rotete.csv',
      'text/csv',
    );
    expect(status).toBe(200);
    expect(body.shifts as Shift[]).toHaveLength(1);
    expect((body.errors as unknown[]).length).toBe(2);
  });

  it('forklarer hva som mangler når fila ikke inneholder vakter', async () => {
    const { status, body } = await upload('dette er ikke en vaktplan', 'notat.txt', 'text/plain');
    expect(status).toBe(422);
    expect(String(body.error)).toContain('Vi fant ingen vakter');
    expect(String(body.error)).toContain('2026-08-17;17:00;22:00;30');
  });

  it('sender bilder videre til dokumentlesingen i stedet for å prøve å tolke dem', async () => {
    const pngMagic = new Uint8Array(new ArrayBuffer(4));
    pngMagic.set([137, 80, 78, 71]);
    const { status, body } = await upload(pngMagic, 'skjermbilde.png', 'image/png');
    expect(status).toBe(415);
    expect(String(body.error)).toContain('Les dokument');
  });

  it('avviser en tom forespørsel', async () => {
    const body = new FormData();
    body.set('kind', 'jobbet');
    const response = await POST(new Request('http://localhost/api/import-schedule', { method: 'POST', body }));
    expect(response.status).toBe(400);
  });
});
