'use client';

import { formatKr } from '@/domain/money';
import type { Flag } from '@/domain/schemas';
import { Badge } from './bits';

/** One flag: the claim, the evidence, the calculation and where it comes from. */
export function FlagCard({ flag, open = false }: { flag: Flag; open?: boolean }) {
  return (
    <details className={`flag ${flag.severity}`} open={open}>
      <summary>
        <span className="row1">
          <Badge severity={flag.severity} />
          <span className="muted small">{flag.periodLabel}</span>
          {flag.amountOre !== null ? <span className="amount">{formatKr(flag.amountOre)}</span> : null}
        </span>
        <span className="title">{flag.title}</span>
        <span className="more">Vis hva vi bygger dette på ▾</span>
      </summary>
      <div className="body">
        <p>{flag.message}</p>

        {flag.calculation ? (
          <>
            <h3>Regnestykket</h3>
            <p className="calc">{flag.calculation.expression}</p>
          </>
        ) : null}

        {flag.evidence.length > 0 ? (
          <>
            <h3>Dette leste vi</h3>
            <dl className="evidence">
              {flag.evidence.map((item, index) => (
                <div key={`${item.label}-${index}`} style={{ display: 'contents' }}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}

        {flag.documentRefs.length > 0 ? (
          <>
            <h3>Hentet fra</h3>
            <ul className="sources">
              {flag.documentRefs.map((ref) => (
                <li key={`${ref.docId}-${ref.page ?? 0}`}>
                  {ref.docName}
                  {ref.page !== null ? `, side ${ref.page}` : ''} <span className="muted">({ref.kind})</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {flag.sources.length > 0 ? (
          <>
            <h3>Regelen</h3>
            <ul className="sources">
              {flag.sources.map((source, index) => (
                <li key={`${source.law}-${source.paragraph}-${index}`}>
                  <strong>
                    {source.law} {source.paragraph}
                  </strong>
                  {source.note ? ` — ${source.note}` : ''}
                  {source.url ? (
                    <>
                      {' '}
                      <a href={source.url} target="_blank" rel="noreferrer noopener">
                        les paragrafen
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  );
}
