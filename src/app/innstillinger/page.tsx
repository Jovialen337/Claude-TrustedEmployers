'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEFAULT_RULESET } from '@/domain/ruleset';
import { formatHours, parseHoursInput } from '@/domain/money';
import type { RuleId, Workspace } from '@/domain/schemas';
import { Field, Notice, Spinner } from '../_components/bits';
import { deleteEverything, fetchWorkspace, loadDemo, saveWorkspace } from '../_lib/client';

export default function InnstillingerPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [fullTime, setFullTime] = useState('37,5');

  useEffect(() => {
    fetchWorkspace()
      .then((loaded) => {
        setWorkspace(loaded);
        setFullTime(String(loaded.settings.fullTimeHoursPerWeek).replace('.', ','));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function patch(next: Workspace, note: string) {
    try {
      setWorkspace(await saveWorkspace(next));
      setMessage(note);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onToggleRule(ruleId: RuleId, enabled: boolean) {
    if (!workspace) return;
    await patch(
      {
        ...workspace,
        ruleOverrides: {
          ...workspace.ruleOverrides,
          [ruleId]: { ...(workspace.ruleOverrides[ruleId] ?? {}), enabled },
        },
      },
      enabled ? 'Regelen er slått på igjen.' : 'Regelen er slått av.',
    );
  }

  async function onDeleteAll() {
    try {
      await deleteEverything();
      setWorkspace(await fetchWorkspace());
      setConfirming(false);
      setMessage('Alt er slettet. Det finnes ikke lenger noen kopi av dataene dine.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (workspace === null) return <Spinner />;

  const counts = {
    shifts: workspace.shifts.length,
    payslips: workspace.payslips.length,
    documents: workspace.documents.length,
  };

  return (
    <>
      <h1>Innstillinger</h1>

      {error ? <Notice kind="warn" title="Noe gikk galt">{error}</Notice> : null}
      {message ? <Notice kind="ok">{message}</Notice> : null}

      <div className="card">
        <h2>Arbeidstid</h2>
        <Field label="Hva er full stilling der du jobber?" help="Vanligvis 37,5 timer i uka. Noen steder 40.">
          <input type="text" inputMode="decimal" value={fullTime} onChange={(e) => setFullTime(e.target.value)} />
        </Field>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              const hours = parseHoursInput(fullTime);
              if (hours === null || hours <= 0) {
                setError('Skriv timer som tall, for eksempel 37,5.');
                return;
              }
              void patch(
                { ...workspace, settings: { ...workspace.settings, fullTimeHoursPerWeek: hours } },
                `Full stilling er satt til ${formatHours(hours)} i uka.`,
              );
            }}
          >
            Lagre
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Hvilke regler skal sjekkes?</h2>
        <p className="help">
          Standardverdiene følger arbeidsmiljøloven og ferieloven. Har du en tariffavtale med andre
          grenser, kan du slå av en regel her — og heller legge inn det som gjelder for deg i kontrakten.
        </p>
        {DEFAULT_RULESET.rules.map((rule) => {
          const override = workspace.ruleOverrides[rule.id];
          const enabled = override?.enabled ?? rule.enabled;
          return (
            <details key={rule.id} className="flag til_info" style={{ borderLeftColor: 'var(--border)' }}>
              <summary>
                <span className="row1">
                  <span className={enabled ? 'badge ok' : 'badge til_info'}>{enabled ? 'På' : 'Av'}</span>
                  <span className="muted small">{rule.sources[0]?.paragraph ?? ''}</span>
                </span>
                <span className="title">{rule.title}</span>
                <span className="more">Vis forklaring og terskler ▾</span>
              </summary>
              <div className="body">
                <p>{rule.explanation}</p>
                <dl className="evidence">
                  {Object.entries(rule.params).map(([key, value]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="sources">
                  {rule.sources.map((source, index) => (
                    <li key={index}>
                      <strong>
                        {source.law} {source.paragraph}
                      </strong>
                      {source.note ? ` — ${source.note}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="small muted">
                  Kontrollert mot:{' '}
                  {rule.verified === 'lovdata'
                    ? 'lovdata.no'
                    : rule.verified === 'sekundaerkilde'
                      ? 'omtale hos LO, Arbeidstilsynet og liknende — ikke lovteksten selv'
                      : 'ikke kontrollert'}
                  .
                </p>
                <div className="actions">
                  <button type="button" onClick={() => onToggleRule(rule.id, !enabled)}>
                    {enabled ? 'Slå av denne regelen' : 'Slå på denne regelen'}
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="card">
        <h2>Dataene dine</h2>
        <p>
          Alt ligger i én fil på denne maskinen (<code>.data/workspace.json</code>). Ingen konto, ingen
          skylagring, ingen kopi noe annet sted.
        </p>
        <ul>
          <li>Kontrakt: {workspace.contract ? 'lagt inn' : 'ikke lagt inn'}</li>
          <li>Vakter: {counts.shifts}</li>
          <li>Lønnsslipper: {counts.payslips}</li>
          <li>Dokumenter: {counts.documents}</li>
          <li>Sist endret: {workspace.updatedAt.slice(0, 16).replace('T', ' ')}</li>
        </ul>

        <div className="actions">
          <button
            type="button"
            onClick={async () => {
              setWorkspace(await loadDemo());
              setMessage('Demodataene er lastet inn. De erstattet det som lå her.');
            }}
          >
            Last inn demodata
          </button>
          {!confirming ? (
            <button type="button" className="danger" onClick={() => setConfirming(true)}>
              Slett alt
            </button>
          ) : null}
        </div>

        {confirming ? (
          <Notice kind="warn" title="Er du sikker?">
            <p>
              Dette sletter kontrakten, alle vaktene, alle lønnsslippene og alle dokumentene. Det kan ikke
              angres, og vi har ingen kopi.
            </p>
            <div className="actions">
              <button type="button" className="danger" onClick={onDeleteAll}>
                Ja, slett alt
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Nei, behold dataene
              </button>
            </div>
          </Notice>
        ) : null}
      </div>

      <div className="card">
        <h2>Automatisk lesing av dokumenter</h2>
        <p>
          Appen kan lese arbeidskontrakt, lønnsslipper og vaktplaner for deg. Det krever en API-nøkkel i{' '}
          <code>.env</code>, og det er helt frivillig — alt kan legges inn manuelt.
        </p>
        <div className="actions">
          <Link className="button" href="/les">
            Prøv å lese et dokument
          </Link>
        </div>
      </div>
    </>
  );
}
