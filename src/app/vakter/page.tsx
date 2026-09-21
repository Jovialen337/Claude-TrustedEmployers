'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { weekBuckets } from '@/domain/aggregate';
import { contractedHoursPerWeek } from '@/domain/derive';
import { parseShiftPaste } from '@/domain/importShifts';
import { formatHours } from '@/domain/money';
import { Shift, type ShiftKind, type Workspace } from '@/domain/schemas';
import { formatDateShort, isoWeek, isoWeekKey, shiftWorkedHours, WEEKDAY_NAMES, weekdayIso } from '@/domain/time';
import { Field, Notice, Spinner } from '../_components/bits';
import { fetchWorkspace, newId, saveWorkspace } from '../_lib/client';

export default function VakterPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('22:00');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [kind, setKind] = useState<ShiftKind>('jobbet');

  const [paste, setPaste] = useState('');
  const [pasteKind, setPasteKind] = useState<ShiftKind>('jobbet');
  const [pasteErrors, setPasteErrors] = useState<{ line: number; text: string; reason: string }[]>([]);

  useEffect(() => {
    fetchWorkspace().then(setWorkspace).catch((e: Error) => setError(e.message));
  }, []);

  const weeks = useMemo(() => (workspace ? weekBuckets(workspace.shifts) : []), [workspace]);
  const contracted = workspace?.contract ? contractedHoursPerWeek(workspace.contract) : null;

  async function persist(shifts: Shift[], note: string) {
    if (!workspace) return;
    setError(null);
    try {
      const next = await saveWorkspace({ ...workspace, shifts });
      setWorkspace(next);
      setMessage(note);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onAdd() {
    if (!workspace) return;
    const candidate = Shift.safeParse({
      id: newId('vakt'),
      date,
      start,
      end,
      breakMinutes: Number(breakMinutes.replace(',', '.')) || 0,
      kind,
      source: 'manuell',
      note: null,
      documentRef: null,
    });
    if (!candidate.success) {
      setError('Sjekk dato og klokkeslett. Datoen må være fylt ut, og klokkeslettene på formen 17:00.');
      return;
    }
    await persist([...workspace.shifts, candidate.data], 'Vakta er lagt til.');
    setDate('');
  }

  async function onImport() {
    if (!workspace) return;
    const result = parseShiftPaste(paste, { kind: pasteKind, idPrefix: newId('import') });
    setPasteErrors(result.errors);
    if (result.shifts.length === 0) {
      setError('Vi fant ingen vakter i det du limte inn. Se listen under for hva som ikke kunne leses.');
      return;
    }
    await persist(
      [...workspace.shifts, ...result.shifts],
      `La inn ${result.shifts.length} vakter.${result.errors.length > 0 ? ` ${result.errors.length} linjer ble hoppet over.` : ''}`,
    );
    setPaste('');
  }

  if (workspace === null) return <Spinner />;

  return (
    <>
      <h1>2. Vaktene dine</h1>
      <p className="lead">
        Legg inn vaktene eller timene du har jobbet. Har du en eksport fra vaktsystemet (Planday, Quinyx,
        Tamigo og liknende), kan du lime den rett inn nedenfor.
      </p>

      {error ? <Notice kind="warn" title="Sjekk dette">{error}</Notice> : null}
      {message ? <Notice kind="ok">{message}</Notice> : null}
      {!workspace.contract ? (
        <Notice kind="info" title="Kontrakten mangler">
          Du kan legge inn vakter nå, men vi kan ikke sammenligne med avtalt arbeidstid før{' '}
          <Link href="/kontrakt">kontrakten er lagt inn</Link>.
        </Notice>
      ) : null}

      <div className="card">
        <h2>Lim inn fra vaktsystemet</h2>
        <p className="help">
          Én vakt per linje: <code>dato; fra; til; pause</code>. Både <code>2026-08-17</code> og{' '}
          <code>17.08.2026</code> går, og pausen kan skrives som <code>30</code>, <code>30 min</code> eller{' '}
          <code>0:30</code>. Overskriftsrad er greit.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'dato;start;slutt;pause\n2026-08-17;17:00;22:00;0\n2026-08-22;10:00;18:00;30'}
          aria-label="Lim inn vakter"
        />
        <div className="inline-choice" style={{ marginTop: '0.5rem' }}>
          <label>
            <input type="radio" name="pasteKind" checked={pasteKind === 'jobbet'} onChange={() => setPasteKind('jobbet')} />
            Dette er timer jeg har jobbet
          </label>
          <label>
            <input type="radio" name="pasteKind" checked={pasteKind === 'planlagt'} onChange={() => setPasteKind('planlagt')} />
            Dette er en vaktplan
          </label>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={onImport} disabled={paste.trim() === ''}>
            Les inn vaktene
          </button>
        </div>

        {pasteErrors.length > 0 ? (
          <Notice kind="warn" title={`${pasteErrors.length} linjer kunne ikke leses`}>
            <ul className="small">
              {pasteErrors.slice(0, 10).map((entry) => (
                <li key={entry.line}>
                  Linje {entry.line}: {entry.reason} <span className="muted">«{entry.text}»</span>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>

      <div className="card">
        <h2>Legg inn én vakt</h2>
        <div className="grid3">
          <Field label="Dato">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Fra">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Til" help="Går vakta over midnatt, skriv sluttiden som normalt.">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="grid2">
          <Field label="Pause (minutter)">
            <input type="text" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
          </Field>
          <Field label="Hva er dette?">
            <select value={kind} onChange={(e) => setKind(e.target.value as ShiftKind)}>
              <option value="jobbet">Timer jeg har jobbet</option>
              <option value="planlagt">Planlagt vakt</option>
            </select>
          </Field>
        </div>
        <div className="actions">
          <button type="button" onClick={onAdd}>Legg til vakta</button>
        </div>
      </div>

      <h2>Vaktene dine ({workspace.shifts.length})</h2>
      {workspace.shifts.length === 0 ? (
        <p className="muted">Ingen vakter lagt inn ennå.</p>
      ) : (
        weeks
          .slice()
          .reverse()
          .map((week) => {
            const shifts = workspace.shifts
              .filter((shift) => isoWeekKey(isoWeek(shift.date)) === week.key)
              .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
            const short = contracted !== null && week.workedHours + 0.001 < contracted;

            return (
              <div className="card" key={week.key}>
                <h3>
                  {week.label}{' '}
                  <span className="muted small">
                    {formatDateShort(week.start)} – {formatDateShort(week.end)}
                  </span>
                </h3>
                <div className="chips">
                  <span className="chip">Jobbet: {formatHours(week.workedHours)}</span>
                  {week.plannedHours > 0 ? <span className="chip">Planlagt: {formatHours(week.plannedHours)}</span> : null}
                  {contracted !== null ? (
                    <span className={short ? 'badge bor_sjekkes' : 'badge ok'}>
                      Avtalt: {formatHours(contracted)}
                    </span>
                  ) : null}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Dag</th>
                        <th>Fra–til</th>
                        <th className="num">Pause</th>
                        <th className="num">Timer</th>
                        <th>Type</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {shifts.map((shift) => (
                        <tr key={shift.id} className={shift.kind === 'planlagt' ? 'dim' : undefined}>
                          <td className="nowrap">
                            {WEEKDAY_NAMES[weekdayIso(shift.date) - 1]} {formatDateShort(shift.date)}
                          </td>
                          <td className="nowrap">
                            {shift.start}–{shift.end}
                          </td>
                          <td className="num">{shift.breakMinutes} min</td>
                          <td className="num">{formatHours(shiftWorkedHours(shift))}</td>
                          <td>{shift.kind === 'jobbet' ? 'Jobbet' : 'Planlagt'}</td>
                          <td className="num">
                            <button
                              type="button"
                              className="danger"
                              aria-label={`Slett vakta ${shift.date} ${shift.start}`}
                              onClick={() =>
                                persist(
                                  workspace.shifts.filter((other) => other.id !== shift.id),
                                  'Vakta er slettet.',
                                )
                              }
                            >
                              Slett
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
      )}

      <div className="actions">
        <Link className="button primary" href="/lonnsslipper">
          Videre til lønnsslippene
        </Link>
      </div>
    </>
  );
}
