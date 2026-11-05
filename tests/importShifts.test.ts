import { describe, expect, it } from 'vitest';
import { parseShiftPaste } from '@/domain/importShifts';

describe('lime inn vakter', () => {
  it('leser en semikolonseparert eksport med overskriftsrad', () => {
    const { shifts, errors } = parseShiftPaste(
      ['dato;start;slutt;pause', '2026-08-17;17:00;22:00;0', '2026-08-18;10:00;18:00;30'].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({ date: '2026-08-17', start: '17:00', end: '22:00', breakMinutes: 0 });
    expect(shifts[1]!.breakMinutes).toBe(30);
    expect(shifts[0]!.source).toBe('import');
  });

  it('godtar norske datoer, punktum i klokkeslett og tabulator', () => {
    const { shifts, errors } = parseShiftPaste('17.08.2026\t17.00\t22.00\t30 min');
    expect(errors).toEqual([]);
    expect(shifts[0]).toMatchObject({ date: '2026-08-17', start: '17:00', end: '22:00', breakMinutes: 30 });
  });

  it('godtar pause skrevet på flere måter', () => {
    const { shifts } = parseShiftPaste(
      ['2026-08-17;10:00;18:00;0:30', '2026-08-18;10:00;18:00;0,5 t', '2026-08-19;10:00;18:00;45'].join('\n'),
    );
    expect(shifts.map((shift) => shift.breakMinutes)).toEqual([30, 30, 45]);
  });

  it('leser en nattevakt som krysser midnatt', () => {
    const { shifts } = parseShiftPaste('2026-08-20;22:00;06:00;30');
    expect(shifts[0]).toMatchObject({ start: '22:00', end: '06:00' });
  });

  it('sier hvilke linjer som ikke kunne leses, i stedet for å hoppe over dem stille', () => {
    const { shifts, errors } = parseShiftPaste(
      ['2026-08-17;17:00;22:00;0', 'tull på denne linja', '2026-08-18;17:00', '32.13.2026;10:00;12:00'].join('\n'),
    );
    expect(shifts).toHaveLength(1);
    expect(errors).toHaveLength(3);
    expect(errors[0]!.line).toBe(2);
    expect(errors[1]!.reason).toContain('minst dato');
    expect(errors[2]!.reason).toContain('Forstod ikke datoen');
  });

  it('avviser en dato som ser riktig ut men ikke finnes', () => {
    const { shifts, errors } = parseShiftPaste(
      ['2026-13-01;10:00;12:00', '2026-02-30;10:00;12:00', '2026-02-28;10:00;12:00'].join('\n'),
    );
    expect(shifts).toHaveLength(1);
    expect(shifts[0]!.date).toBe('2026-02-28');
    expect(errors).toHaveLength(2);
  });

  it('godtar mellomrom som skilletegn når det ikke er noe annet', () => {
    const { shifts, errors } = parseShiftPaste('2026-08-17 17:00 22:00 30');
    expect(errors).toEqual([]);
    expect(shifts[0]).toMatchObject({ start: '17:00', end: '22:00', breakMinutes: 30 });
  });

  it('hopper over tomme linjer', () => {
    const { shifts, errors } = parseShiftPaste('\n2026-08-17;17:00;22:00\n\n');
    expect(shifts).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('kan merke de importerte vaktene som planlagte', () => {
    const { shifts } = parseShiftPaste('2026-08-17;17:00;22:00', { kind: 'planlagt' });
    expect(shifts[0]!.kind).toBe('planlagt');
  });
});
