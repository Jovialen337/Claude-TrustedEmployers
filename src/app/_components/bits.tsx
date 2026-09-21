'use client';

import { SEVERITY_LABELS, type Severity } from '@/domain/schemas';

export function Badge({ severity }: { severity: Severity }) {
  return <span className={`badge ${severity}`}>{SEVERITY_LABELS[severity]}</span>;
}

export function Stat({
  label,
  value,
  hint,
  big,
}: {
  label: string;
  value: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div className={big ? 'stat big' : 'stat'}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`notice ${kind}`}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="disclaimer">
      Dette er ikke juridisk rådgivning. Kontakt fagforeningen din eller Arbeidstilsynet for hjelp.
    </p>
  );
}

export function Field({
  label,
  help,
  children,
  error,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {help ? <p className="help">{help}</p> : null}
      {children}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function Spinner({ text = 'Laster …' }: { text?: string }) {
  return <p className="spinner">{text}</p>;
}
