'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { payslipSummary } from '@/domain/aggregate';
import { formatHours, formatKr, parseHoursInput, parseKrInput } from '@/domain/money';
import {
  CATEGORY_LABELS,
  PAYSLIP_CATEGORIES,
  Payslip,
  type PayslipCategory,
  type PayslipLine,
  type Workspace,
} from '@/domain/schemas';
import { monthEnd, monthKey, monthStart } from '@/domain/time';
import { Field, Notice, Spinner } from '../_components/bits';
import { fetchWorkspace, newId, saveWorkspace } from '../_lib/client';

function emptyLine(): PayslipLine {
  return { id: newId('linje'), category: 'ordinaer', label: 'Timelønn', hours: null, rateOre: null, amountOre: 0 };
}

export default function LonnsslipperPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [lines, setLines] = useState<PayslipLine[]>([emptyLine()]);
  const [basis, setBasis] = useState('');
  const [accrued, setAccrued] = useState('');

  useEffect(() => {
    fetchWorkspace().then(setWorkspace).catch((e: Error) => setError(e.message));
  }, []);

  /** Picking a month fills both dates, since a payslip almost always covers a whole month. */
  function onMonthPicked(value: string) {
    if (value === '') return;
    const key = monthKey(`${value}-01`);
    setPeriodStart(monthStart(key));
    setPeriodEnd(monthEnd(key));
  }

  function updateLine(id: string, patch: Partial<PayslipLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function onAdd() {
    if (!workspace) return;
    setError(null);

    const candidate = Payslip.safeParse({
      id: newId('slipp'),
      periodStart,
      periodEnd,
      lines: lines.filter((line) => line.amountOre !== 0 || line.hours !== null),
      grossOre: null,
      feriepengerBasisOre: basis.trim() === '' ? null : parseKrInput(basis),
      feriepengerAccruedOre: accrued.trim() === '' ? null : parseKrInput(accrued),
      documentRef: null,
    });

    if (!candidate.success) {
      setError('Sjekk at perioden er fylt ut, og at beløpene er tall (for eksempel 18 262,00).');
      return;
    }
    if (candidate.data.periodEnd < candidate.data.periodStart) {
      setError('Perioden slutter før den starter.');
      return;
    }

    try {
      const next = await saveWorkspace({ ...workspace, payslips: [...workspace.payslips, candidate.data] });
      setWorkspace(next);
      setMessage('Lønnsslippen er lagt inn.');
      setLines([emptyLine()]);
      setBasis('');
      setAccrued('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDelete(id: string) {
    if (!workspace) return;
    const next = await saveWorkspace({
      ...workspace,
      payslips: workspace.payslips.filter((payslip) => payslip.id !== id),
    });
    setWorkspace(next);
    setMessage('Lønnsslippen er slettet.');
  }

  if (workspace === null) return <Spinner />;

  return (
    <>
      <h1>3. Lønnsslippene</h1>
      <p className="lead">
        Skriv inn linjene fra lønnsslippen slik de står der. Det viktigste er timer, sats og beløp — da kan
        vi sammenligne med vaktene dine. Kategorien avgjør hvordan linja blir regnet, så velg den som
        passer teksten på slippen.
      </p>

      {error ? <Notice kind="warn" title="Sjekk dette">{error}</Notice> : null}
      {message ? <Notice kind="ok">{message}</Notice> : null}

      <div className="card">
        <h2>Ny lønnsslipp</h2>
        <div className="grid3">
          <Field label="Måned" help="Velg måneden, så fylles datoene ut.">
            <input type="month" onChange={(e) => onMonthPicked(e.target.value)} />
          </Field>
          <Field label="Perioden starter">
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label="Perioden slutter">
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>

        <h3>Linjer på slippen</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tekst på slippen</th>
                <th>Kategori</th>
                <th className="num">Timer</th>
                <th className="num">Sats</th>
                <th className="num">Beløp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <input
                      type="text"
                      value={line.label}
                      onChange={(e) => updateLine(line.id, { label: e.target.value })}
                      aria-label="Tekst på lønnsslippen"
                    />
                  </td>
                  <td>
                    <select
                      value={line.category}
                      onChange={(e) => updateLine(line.id, { category: e.target.value as PayslipCategory })}
                      aria-label="Kategori"
                    >
                      {PAYSLIP_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.hours === null ? '' : String(line.hours).replace('.', ',')}
                      onChange={(e) =>
                        updateLine(line.id, {
                          hours: e.target.value.trim() === '' ? null : parseHoursInput(e.target.value),
                        })
                      }
                      aria-label="Timer"
                    />
                  </td>
                  <td className="num">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.rateOre === null ? '' : (line.rateOre / 100).toFixed(2).replace('.', ',')}
                      onChange={(e) =>
                        updateLine(line.id, {
                          rateOre: e.target.value.trim() === '' ? null : parseKrInput(e.target.value),
                        })
                      }
                      aria-label="Sats i kroner"
                    />
                  </td>
                  <td className="num">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(line.amountOre / 100).toFixed(2).replace('.', ',')}
                      onChange={(e) => updateLine(line.id, { amountOre: parseKrInput(e.target.value) ?? 0 })}
                      aria-label="Beløp i kroner"
                    />
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setLines((current) => current.filter((other) => other.id !== line.id))}
                      aria-label="Fjern linja"
                    >
                      Fjern
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions">
          <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
            + Legg til linje
          </button>
        </div>

        <div className="grid2">
          <Field label="Feriepengegrunnlag (valgfritt)" help="Står ofte nederst på slippen.">
            <input type="text" inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="65 000,00" />
          </Field>
          <Field label="Avsatte feriepenger (valgfritt)">
            <input type="text" inputMode="decimal" value={accrued} onChange={(e) => setAccrued(e.target.value)} placeholder="6 000,00" />
          </Field>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={onAdd}>
            Lagre lønnsslippen
          </button>
        </div>
      </div>

      <h2>Lagrede lønnsslipper ({workspace.payslips.length})</h2>
      {workspace.payslips.length === 0 ? (
        <p className="muted">Ingen lønnsslipper lagt inn ennå.</p>
      ) : (
        [...workspace.payslips]
          .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
          .map((payslip) => {
            const summary = payslipSummary(payslip);
            return (
              <div className="card" key={payslip.id}>
                <h3>{summary.label}</h3>
                <div className="chips">
                  <span className="chip">Betalte timer: {formatHours(summary.paidWorkHours)}</span>
                  <span className="chip">Sum linjer: {formatKr(summary.linesTotalOre)}</span>
                  {summary.paidOvertimeHours > 0 ? (
                    <span className="chip">Overtid: {formatHours(summary.paidOvertimeHours)}</span>
                  ) : null}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tekst</th>
                        <th>Kategori</th>
                        <th className="num">Timer</th>
                        <th className="num">Sats</th>
                        <th className="num">Beløp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.lines.map((line) => (
                        <tr key={line.id}>
                          <td>{line.label}</td>
                          <td>{CATEGORY_LABELS[line.category]}</td>
                          <td className="num">{line.hours === null ? '—' : formatHours(line.hours)}</td>
                          <td className="num">{line.rateOre === null ? '—' : formatKr(line.rateOre)}</td>
                          <td className="num">{formatKr(line.amountOre)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="actions">
                  <button type="button" className="danger" onClick={() => onDelete(payslip.id)}>
                    Slett denne lønnsslippen
                  </button>
                </div>
              </div>
            );
          })
      )}

      <div className="actions">
        <Link className="button primary" href="/sjekk">
          Kjør sjekken
        </Link>
      </div>
    </>
  );
}
