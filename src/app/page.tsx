'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatKr } from '@/domain/money';
import type { Workspace } from '@/domain/schemas';
import { Notice, Spinner, Stat } from './_components/bits';
import { fetchWorkspace, loadDemo } from './_lib/client';

export default function StartPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspace().then(setWorkspace).catch((e: Error) => setError(e.message));
  }, []);

  async function onDemo() {
    setBusy(true);
    setError(null);
    try {
      setWorkspace(await loadDemo());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasSomething =
    workspace !== null &&
    (workspace.contract !== null || workspace.shifts.length > 0 || workspace.payslips.length > 0);

  return (
    <>
      <h1>Får du det kontrakten din sier?</h1>
      <p className="lead">
        Lønnssjekk legger arbeidskontrakten, vaktplanen og lønnsslippene dine ved siden av hverandre og
        viser hvert sted de ikke stemmer — med regnestykket og kilden, slik at du kan ta det opp med
        arbeidsgiver, tillitsvalgt eller fagforeningen.
      </p>

      {error ? <Notice kind="warn" title="Noe gikk galt">{error}</Notice> : null}

      {workspace === null ? (
        <Spinner />
      ) : hasSomething ? (
        <>
          <div className="stats">
            <Stat
              label="Kontrakt"
              value={workspace.contract ? `${workspace.contract.stillingsprosent} %` : 'Mangler'}
              hint={
                workspace.contract
                  ? `${workspace.contract.employer} — ${formatKr(
                      workspace.contract.wage.amountOre,
                    )} ${workspace.contract.wage.kind === 'hourly' ? 'per time' : 'per måned'}`
                  : 'Legg inn kontrakten din'
              }
            />
            <Stat
              label="Vakter"
              value={String(workspace.shifts.length)}
              hint={workspace.shifts.length > 0 ? 'timer og vakter lagt inn' : 'Legg inn vaktplanen'}
            />
            <Stat
              label="Lønnsslipper"
              value={String(workspace.payslips.length)}
              hint={workspace.payslips.length > 0 ? 'perioder lagt inn' : 'Legg inn lønnsslippene'}
            />
          </div>

          <div className="actions">
            <Link className="button primary" href="/sjekk">
              Kjør sjekken
            </Link>
            <Link className="button" href="/kontrakt">
              Se eller endre kontrakten
            </Link>
            <Link className="button" href="/vakter">
              Legg inn flere vakter
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <h2>Kom i gang</h2>
            <p>Du trenger tre ting. Det går fint å begynne med én og legge til resten senere.</p>
            <ol>
              <li>
                <strong>Arbeidskontrakten</strong> — stillingsprosent, timelønn og eventuelle tillegg.
              </li>
              <li>
                <strong>Vaktplanen eller timene dine</strong> — dato, fra, til og pause.
              </li>
              <li>
                <strong>Lønnsslippene</strong> — timer og satser per periode.
              </li>
            </ol>
            <div className="actions">
              <Link className="button primary" href="/kontrakt">
                Start med kontrakten
              </Link>
              <button type="button" onClick={onDemo} disabled={busy}>
                {busy ? 'Laster demo …' : 'Vis meg et eksempel først'}
              </button>
            </div>
          </div>

          <Notice kind="info" title="Vil du bare se hvordan det ser ut?">
            Eksempelet er en oppdiktet person med tre måneder med data og flere innlagte feil. Ingen
            virkelige personopplysninger. Du kan slette alt etterpå med ett klikk.
          </Notice>
        </>
      )}

      <h2>Hva sjekkes?</h2>
      <div className="card">
        <ul>
          <li>Får du timene stillingsprosenten din gir deg — per uke, måned og hele perioden?</li>
          <li>Er overtid betalt med minst 40 % tillegg? Og er det egentlig overtid, eller merarbeid?</li>
          <li>Har du hatt 11 timer fri mellom vaktene, og 35 timer i uka?</li>
          <li>Er det registrert pause på de lange vaktene?</li>
          <li>Er hver time du jobbet betalt, i riktig kategori og med riktig sats?</li>
          <li>Er kvelds-, natt-, helge- og helligdagstillegg fra kontrakten din med?</li>
          <li>Ser feriepengegrunnlaget riktig ut?</li>
          <li>Har du jobbet så mye at du kan ha rett til en større stilling?</li>
        </ul>
        <p className="small muted">
          Alt regnes ut av vanlig kode med faste regler — ikke av en språkmodell. Kunstig intelligens
          brukes bare til å lese dokumenter, og du får alltid se og rette det som ble lest, før noe
          sjekkes. Ingen feil i rapporten skal komme av at en modell gjettet.
        </p>
      </div>
    </>
  );
}
