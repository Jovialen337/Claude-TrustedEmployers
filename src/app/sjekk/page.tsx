'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CheckResult } from '@/domain/engine';
import { formatHours, formatKr, formatPercent } from '@/domain/money';
import { SEVERITY_LABELS } from '@/domain/schemas';
import { formatDateShort } from '@/domain/time';
import { FlagCard } from '../_components/FlagCard';
import { Disclaimer, Notice, Spinner, Stat } from '../_components/bits';
import { fetchCheck } from '../_lib/client';

export default function SjekkPage() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCheck().then(setResult).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Notice kind="warn" title="Noe gikk galt">{error}</Notice>;
  if (result === null) return <Spinner text="Regner …" />;

  const { totals } = result;
  const nothingFound = result.flags.length === 0 && result.blockers.length === 0;

  return (
    <>
      <h1>4. Dette fant vi</h1>

      {result.blockers.length > 0 ? (
        <Notice kind="info" title="Vi mangler noe før sjekken blir fullstendig">
          <ul>
            {result.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <p className="small">
            <Link href="/kontrakt">Kontrakt</Link> · <Link href="/vakter">Vakter</Link> ·{' '}
            <Link href="/lonnsslipper">Lønnsslipper</Link>
          </p>
        </Notice>
      ) : null}

      {nothingFound ? (
        <Notice kind="ok" title="Vi fant ingen avvik">
          Ut fra det som er lagt inn stemmer kontrakten, vaktene og lønnsslippene. Husk at vi bare kan
          sjekke det vi har fått se.
        </Notice>
      ) : null}

      <div className="stats">
        <Stat
          big
          label="Anslag: ikke betalt for arbeid"
          value={formatKr(totals.estimatedOwedOre)}
          hint="Timer du har jobbet uten å få betalt, pluss manglende overtidstillegg og tillegg."
        />
        <Stat
          label="Timer du ikke fikk"
          value={formatHours(totals.hoursShortVsContract)}
          hint={`Mot avtalt ${formatHours(totals.contractedWeeklyHours)} i uka. Anslått verdi ${formatKr(totals.underScheduledOre)}.`}
        />
        <Stat
          label="Funn"
          value={String(totals.flagCount)}
          hint={`${totals.bySeverity.sannsynlig_feil} sannsynlige feil · ${totals.bySeverity.bor_sjekkes} bør sjekkes · ${totals.bySeverity.til_info} til info`}
        />
      </div>

      {result.dataRange ? (
        <p className="small muted">
          Perioden vi har sett på: {formatDateShort(result.dataRange.start)} –{' '}
          {formatDateShort(result.dataRange.end)} ({totals.weeksObserved} hele uker). Snitt{' '}
          {formatHours(totals.averageWeeklyHours)} i uka, som er{' '}
          {totals.contractedWeeklyHours > 0
            ? formatPercent(Math.round((totals.averageWeeklyHours / totals.contractedWeeklyHours) * 1000) / 10)
            : '—'}{' '}
          av avtalt arbeidstid. Timelønn lagt til grunn: {formatKr(result.hourlyRateOre)}.
        </p>
      ) : null}

      {totals.feriepengerToCheckOre > 0 ? (
        <Notice kind="info">
          I tillegg er det {formatKr(totals.feriepengerToCheckOre)} i feriepenger som bør sjekkes. Det er
          holdt utenfor summen over, fordi hva som inngår i feriepengegrunnlaget varierer.
        </Notice>
      ) : null}

      {(['sannsynlig_feil', 'bor_sjekkes', 'til_info'] as const).map((severity) => {
        const flags = result.flags.filter((flag) => flag.severity === severity);
        if (flags.length === 0) return null;
        return (
          <section key={severity}>
            <h2>
              {SEVERITY_LABELS[severity]} ({flags.length})
            </h2>
            {severity === 'sannsynlig_feil' ? (
              <p className="lead small">
                Dette ser ut som feil vi kan regne på. Ta dem opp med arbeidsgiver — hvert punkt viser
                regnestykket og hvor tallene kommer fra.
              </p>
            ) : null}
            {severity === 'bor_sjekkes' ? (
              <p className="lead small">
                Her er det noe som ikke stemmer helt, men det kan finnes en god forklaring — for eksempel en
                avtale du ikke har lagt inn.
              </p>
            ) : null}
            {flags.map((flag) => (
              <FlagCard key={flag.id} flag={flag} open={severity === 'sannsynlig_feil' && flags.length <= 3} />
            ))}
          </section>
        );
      })}

      <h2>Uke for uke</h2>
      <p className="lead small">
        Kontrakt, vaktplan og lønnsslipp ved siden av hverandre. Betalte timer står bare på uker der en
        lønnsslipp dekker akkurat den uka — en månedsslipp sier ikke hvilke timer som hørte til hvilken uke,
        og vi gjetter ikke.
      </p>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Uke</th>
                <th className="num">Avtalt</th>
                <th className="num">Planlagt</th>
                <th className="num">Jobbet</th>
                <th className="num">Betalt</th>
                <th>Lønnsperiode</th>
                <th>Funn</th>
              </tr>
            </thead>
            <tbody>
              {result.timeline.map((week) => {
                const short = week.workedHours + 0.001 < week.contractedHours;
                return (
                  <tr key={week.key} className={week.complete ? undefined : 'dim'}>
                    <td className="nowrap">
                      {week.label}
                      {!week.complete ? <span className="muted small"> (delvis)</span> : null}
                    </td>
                    <td className="num">{formatHours(week.contractedHours)}</td>
                    <td className="num">{week.plannedHours > 0 ? formatHours(week.plannedHours) : '—'}</td>
                    <td className="num">
                      {formatHours(week.workedHours)}
                      <span
                        className={`timeline-bar ${week.workedHours === 0 ? 'none' : short ? 'short' : ''}`}
                        style={{
                          width: `${Math.min(100, week.contractedHours > 0 ? (week.workedHours / week.contractedHours) * 60 : 0)}px`,
                        }}
                        aria-hidden="true"
                      />
                    </td>
                    <td className="num">{week.paidHours === null ? '—' : formatHours(week.paidHours)}</td>
                    <td className="small">{week.payslipLabels.join(', ') || '—'}</td>
                    <td>
                      {week.worstSeverity ? (
                        <span className={`badge ${week.worstSeverity}`}>{week.flagIds.length}</span>
                      ) : week.periodFlagIds.length > 0 ? (
                        <span className="muted small">i perioden</span>
                      ) : (
                        <span className="badge ok">ok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="actions">
        <Link className="button primary" href="/rapport">
          Lag rapport og melding til arbeidsgiver
        </Link>
      </div>

      <Disclaimer />
    </>
  );
}
