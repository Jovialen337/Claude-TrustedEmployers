'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CheckResult } from '@/domain/engine';
import { formatHours, formatKr } from '@/domain/money';
import type { Workspace } from '@/domain/schemas';
import { draftMessage } from '@/report/draftMessage';
import { Disclaimer, Notice, Spinner, Stat } from '../_components/bits';
import { fetchCheck, fetchWorkspace } from '../_lib/client';

export default function RapportPage() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([fetchCheck(), fetchWorkspace()])
      .then(([checked, loaded]) => {
        setResult(checked);
        setWorkspace(loaded);
        setMessage(draftMessage(checked, loaded.contract));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const untouched = useMemo(
    () => (result && workspace ? draftMessage(result, workspace.contract) : ''),
    [result, workspace],
  );

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Klarte ikke kopiere automatisk. Merk teksten og kopier den selv.');
    }
  }

  if (error) return <Notice kind="warn" title="Noe gikk galt">{error}</Notice>;
  if (result === null || workspace === null) return <Spinner />;

  return (
    <>
      <h1>5. Rapport og melding</h1>
      <p className="lead">
        Her får du to ting: en rapport i PDF du kan gi til sjefen, tillitsvalgt eller fagforeningen, og et
        utkast til melding du kan sende selv. Verktøyet sender ingenting.
      </p>

      <div className="stats">
        <Stat big label="Anslag: ikke betalt for arbeid" value={formatKr(result.totals.estimatedOwedOre)} />
        <Stat label="Timer under avtalt tid" value={formatHours(result.totals.hoursShortVsContract)} />
        <Stat label="Funn i rapporten" value={String(result.totals.flagCount)} />
      </div>

      <div className="card">
        <h2>Rapport (PDF)</h2>
        <p>
          Rapporten inneholder hvert funn med regnestykket, det vi leste ut av dokumentene, og hvilken
          paragraf eller kontraktspunkt det bygger på. Den er skrevet nøkternt, uten påstander vi ikke kan
          vise til.
        </p>
        <div className="actions">
          <a className="button primary" href="/api/report">
            Last ned rapporten
          </a>
          <Link className="button" href="/sjekk">
            Se funnene på skjermen
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Utkast til melding til arbeidsgiver</h2>
        <p className="help">
          Teksten er et utgangspunkt. Les den gjennom, endre det du vil, og send den selv i e-post eller
          chat. Har du tillitsvalgt, kan det være lurt å snakke med dem først.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ minHeight: '24rem' }}
          aria-label="Utkast til melding"
        />
        <div className="actions">
          <button type="button" className="primary" onClick={onCopy}>
            {copied ? 'Kopiert ✓' : 'Kopier teksten'}
          </button>
          <button type="button" onClick={() => setMessage(untouched)} disabled={message === untouched}>
            Tilbakestill utkastet
          </button>
        </div>
      </div>

      <Notice kind="info" title="Hvor kan du få hjelp?">
        <ul>
          <li>Har du tillitsvalgt på jobben, er det ofte det enkleste stedet å starte.</li>
          <li>Er du medlem i en fagforening, kan de ta saken videre for deg.</li>
          <li>
            Arbeidstilsynet svarer på spørsmål om arbeidstid, pauser og hviletid på telefon 73 19 97 00.
          </li>
          <li>Blir dere ikke enige om rett til større stilling, kan saken gå til Tvisteløsningsnemnda.</li>
        </ul>
      </Notice>

      <Disclaimer />
    </>
  );
}
