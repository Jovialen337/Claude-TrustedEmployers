'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatHours, formatKr, parseHoursInput, parseKrInput } from '@/domain/money';
import {
  CATEGORY_LABELS,
  PAYSLIP_CATEGORIES,
  type Contract,
  type Payslip,
  type PayslipCategory,
  type Shift,
  type Workspace,
} from '@/domain/schemas';
import { shiftWorkedHours } from '@/domain/time';
import type { Proposal } from '@/extraction/toDomain';
import { Field, Notice, Spinner } from '../_components/bits';
import { fetchWorkspace, saveWorkspace } from '../_lib/client';

type Kind = 'kontrakt' | 'lonnsslipp' | 'vaktplan';

const KIND_LABELS: Record<Kind, string> = {
  kontrakt: 'Arbeidskontrakt',
  lonnsslipp: 'Lønnsslipp',
  vaktplan: 'Vaktplan eller timeliste',
};

export default function LesPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const [kind, setKind] = useState<Kind>('kontrakt');
  const [file, setFile] = useState<File | null>(null);
  const [allowImage, setAllowImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [draftContract, setDraftContract] = useState<Contract | null>(null);
  const [draftPayslip, setDraftPayslip] = useState<Payslip | null>(null);
  const [draftShifts, setDraftShifts] = useState<Shift[]>([]);

  useEffect(() => {
    fetch('/api/extract')
      .then((response) => response.json())
      .then((status: { available: boolean; model: string | null }) => {
        setAvailable(status.available);
        setModel(status.model);
      })
      .catch(() => setAvailable(false));
    fetchWorkspace().then(setWorkspace).catch(() => undefined);
  }, []);

  async function onRead() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNeedsConsent(false);
    setProposal(null);
    setSaved(null);

    const body = new FormData();
    body.set('file', file);
    body.set('kind', kind);
    body.set('allowImage', String(allowImage));

    try {
      const response = await fetch('/api/extract', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Klarte ikke lese dokumentet.');
        setNeedsConsent(Boolean(payload.needsImageConsent));
        return;
      }
      const result = payload as Proposal;
      setProposal(result);
      setDraftContract(result.contract ?? null);
      setDraftPayslip(result.payslip ?? null);
      setDraftShifts(result.shifts ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!workspace || !proposal) return;
    setError(null);
    try {
      const next: Workspace = { ...workspace };
      if (proposal.kind === 'kontrakt' && draftContract) next.contract = draftContract;
      if (proposal.kind === 'lonnsslipp' && draftPayslip) next.payslips = [...workspace.payslips, draftPayslip];
      if (proposal.kind === 'vaktplan') next.shifts = [...workspace.shifts, ...draftShifts];
      // Record the document that was read, so the flags' "Hentet fra" has a matching entry in
      // the document list, and "Slett alt" really does delete everything.
      next.documents = [
        ...workspace.documents.filter((document) => document.id !== proposal.document.id),
        proposal.document,
      ];

      const stored = await saveWorkspace(next);
      setWorkspace(stored);
      setProposal(null);
      setFile(null);
      setSaved(
        proposal.kind === 'kontrakt'
          ? 'Kontrakten er lagret.'
          : proposal.kind === 'lonnsslipp'
            ? 'Lønnsslippen er lagret.'
            : `${draftShifts.length} vakter er lagret.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (available === null) return <Spinner />;

  return (
    <>
      <h1>Les et dokument for meg</h1>
      <p className="lead">
        Last opp arbeidskontrakten, en lønnsslipp eller en vaktplan, og få feltene fylt ut automatisk. Du
        får alltid se hva som ble lest, og kan rette det, før noe blir lagret eller sjekket.
      </p>

      {!available ? (
        <Notice kind="info" title="Automatisk lesing er ikke satt opp">
          <p>
            Appen fungerer helt uten dette. For å slå det på, kopier <code>.env.example</code> til{' '}
            <code>.env</code>, lim inn en API-nøkkel fra Anthropic, og start appen på nytt.
          </p>
          <p className="small">
            Uten nøkkel legger du inn opplysningene selv: <Link href="/kontrakt">kontrakt</Link>,{' '}
            <Link href="/vakter">vakter</Link>, <Link href="/lonnsslipper">lønnsslipper</Link>. Resultatet
            blir like riktig — det er koden som regner, ikke modellen.
          </p>
        </Notice>
      ) : null}

      <Notice kind="info" title="Slik behandles dokumentet">
        <ul className="small">
          <li>Tekst hentes først ut av PDF-en lokalt på maskinen din.</li>
          <li>Fødselsnummer og kontonummer fjernes før noe sendes.</li>
          <li>Bare den maskerte teksten sendes til Claude, som henter ut felt — ingen vurderinger.</li>
          <li>Ingenting lagres noe annet sted enn hos deg. {model ? `Modell: ${model}.` : ''}</li>
          <li>
            Bilder og skjermbilder kan vi <strong>ikke</strong> maskere. Der må du godta det selv først.
          </li>
        </ul>
      </Notice>

      {error ? <Notice kind="warn" title="Sjekk dette">{error}</Notice> : null}
      {saved ? (
        <Notice kind="ok" title="Lagret">
          {saved} <Link href="/sjekk">Kjør sjekken →</Link>
        </Notice>
      ) : null}

      {proposal === null ? (
        <div className="card">
          <Field label="Hva er dette?">
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Filen" help="PDF er best. Bilde, skjermbilde, CSV eller tekstfil går også.">
            <input
              type="file"
              accept=".pdf,.csv,.txt,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>

          <div className="inline-choice">
            <label>
              <input type="checkbox" checked={allowImage} onChange={(e) => setAllowImage(e.target.checked)} />
              Jeg godtar at bilder sendes uten maskering
            </label>
          </div>
          {needsConsent ? (
            <p className="error-text">Kryss av over for å lese dette dokumentet som bilde.</p>
          ) : null}

          <div className="actions">
            <button type="button" className="primary" onClick={onRead} disabled={!file || busy || !available}>
              {busy ? 'Leser dokumentet …' : 'Les dokumentet'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2>Stemmer dette?</h2>
          <p className="lead">
            Dette leste vi ut av <strong>{proposal.documentName}</strong>. Rett det som er feil, og
            bekreft. Ingenting sjekkes før du har bekreftet.
          </p>
          <p className="small muted">{proposal.redactionSummary}</p>

          {proposal.warnings.length > 0 ? (
            <Notice kind="warn" title="Merk">
              <ul className="small">
                {proposal.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {proposal.notes.length > 0 ? (
            <Notice kind="info" title="Modellen var usikker på dette">
              <ul className="small">
                {proposal.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {draftContract ? (
            <div className="card">
              <div className="grid2">
                <Field label="Arbeidsgiver">
                  <input
                    type="text"
                    value={draftContract.employer}
                    onChange={(e) => setDraftContract({ ...draftContract, employer: e.target.value })}
                  />
                </Field>
                <Field label="Navn">
                  <input
                    type="text"
                    value={draftContract.employeeName}
                    onChange={(e) => setDraftContract({ ...draftContract, employeeName: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid3">
                <Field label="Startdato">
                  <input
                    type="date"
                    value={draftContract.startDate}
                    onChange={(e) => setDraftContract({ ...draftContract, startDate: e.target.value })}
                  />
                </Field>
                <Field label="Stillingsprosent">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(draftContract.stillingsprosent).replace('.', ',')}
                    onChange={(e) =>
                      setDraftContract({
                        ...draftContract,
                        stillingsprosent: parseHoursInput(e.target.value) ?? draftContract.stillingsprosent,
                      })
                    }
                  />
                </Field>
                <Field label="Full stilling (t/uke)">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(draftContract.fullTimeHoursPerWeek).replace('.', ',')}
                    onChange={(e) =>
                      setDraftContract({
                        ...draftContract,
                        fullTimeHoursPerWeek:
                          parseHoursInput(e.target.value) ?? draftContract.fullTimeHoursPerWeek,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="grid2">
                <Field label={draftContract.wage.kind === 'hourly' ? 'Timelønn' : 'Månedslønn'}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(draftContract.wage.amountOre / 100).toFixed(2).replace('.', ',')}
                    onChange={(e) =>
                      setDraftContract({
                        ...draftContract,
                        wage: {
                          kind: draftContract.wage.kind,
                          amountOre: parseKrInput(e.target.value) ?? draftContract.wage.amountOre,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Tariffavtale">
                  <input
                    type="text"
                    value={draftContract.tariffavtale ?? ''}
                    onChange={(e) =>
                      setDraftContract({
                        ...draftContract,
                        tariffavtale: e.target.value === '' ? null : e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <h3>Tillegg som ble lest</h3>
              {draftContract.supplements.length === 0 ? (
                <p className="muted small">Ingen tillegg ble funnet i dokumentet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tillegg</th>
                        <th>Tidsrom</th>
                        <th className="num">Sats</th>
                        <th>Kilde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftContract.supplements.map((supplement) => (
                        <tr key={supplement.id}>
                          <td>{supplement.label}</td>
                          <td>
                            {supplement.fromTime && supplement.toTime
                              ? `${supplement.fromTime}–${supplement.toTime}`
                              : 'hele dagen'}
                          </td>
                          <td className="num">
                            {supplement.rate.kind === 'per_hour_ore'
                              ? `${formatKr(supplement.rate.value)}/t`
                              : `${supplement.rate.value} %`}
                          </td>
                          <td className="small">{supplement.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="small muted">
                Tillegg kan du finjustere på <Link href="/kontrakt">kontraktsiden</Link> etter at du har
                bekreftet.
              </p>
            </div>
          ) : null}

          {draftPayslip ? (
            <div className="card">
              <div className="grid2">
                <Field label="Perioden starter">
                  <input
                    type="date"
                    value={draftPayslip.periodStart}
                    onChange={(e) => setDraftPayslip({ ...draftPayslip, periodStart: e.target.value })}
                  />
                </Field>
                <Field label="Perioden slutter">
                  <input
                    type="date"
                    value={draftPayslip.periodEnd}
                    onChange={(e) => setDraftPayslip({ ...draftPayslip, periodEnd: e.target.value })}
                  />
                </Field>
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
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draftPayslip.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.label}</td>
                        <td>
                          <select
                            value={line.category}
                            onChange={(e) =>
                              setDraftPayslip({
                                ...draftPayslip,
                                lines: draftPayslip.lines.map((other) =>
                                  other.id === line.id
                                    ? { ...other, category: e.target.value as PayslipCategory }
                                    : other,
                                ),
                              })
                            }
                            aria-label={`Kategori for ${line.label}`}
                          >
                            {PAYSLIP_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">{line.hours === null ? '—' : formatHours(line.hours)}</td>
                        <td className="num">{line.rateOre === null ? '—' : formatKr(line.rateOre)}</td>
                        <td className="num">{formatKr(line.amountOre)}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              setDraftPayslip({
                                ...draftPayslip,
                                lines: draftPayslip.lines.filter((other) => other.id !== line.id),
                              })
                            }
                          >
                            Fjern
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">
                Feriepengegrunnlag:{' '}
                {draftPayslip.feriepengerBasisOre === null
                  ? 'ikke funnet'
                  : formatKr(draftPayslip.feriepengerBasisOre)}
                . Avsatt:{' '}
                {draftPayslip.feriepengerAccruedOre === null
                  ? 'ikke funnet'
                  : formatKr(draftPayslip.feriepengerAccruedOre)}
                .
              </p>
            </div>
          ) : null}

          {proposal.kind === 'vaktplan' ? (
            <div className="card">
              <p>
                <strong>{draftShifts.length} vakter</strong> ble lest, til sammen{' '}
                {formatHours(draftShifts.reduce((sum, shift) => sum + shiftWorkedHours(shift), 0))}.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dato</th>
                      <th>Fra–til</th>
                      <th className="num">Pause</th>
                      <th className="num">Timer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draftShifts.map((shift) => (
                      <tr key={shift.id}>
                        <td className="nowrap">{shift.date}</td>
                        <td className="nowrap">
                          {shift.start}–{shift.end}
                        </td>
                        <td className="num">{shift.breakMinutes} min</td>
                        <td className="num">{formatHours(shiftWorkedHours(shift))}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setDraftShifts(draftShifts.filter((other) => other.id !== shift.id))}
                          >
                            Fjern
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="actions">
            <button type="button" className="primary" onClick={onConfirm}>
              Dette stemmer — lagre
            </button>
            <button type="button" onClick={() => setProposal(null)}>
              Avbryt
            </button>
          </div>
        </>
      )}
    </>
  );
}
