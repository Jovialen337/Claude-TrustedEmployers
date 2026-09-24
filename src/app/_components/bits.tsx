'use client';

import { cloneElement, isValidElement, useId, type ReactElement } from 'react';
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

const LABELABLE = new Set(['input', 'select', 'textarea']);

/**
 * A labelled form field.
 *
 * When the field wraps a single control, the label is tied to it with `htmlFor` and a
 * generated id, so screen readers announce the two together and clicking the label focuses
 * the control. Fields that hold a *group* of controls (radio buttons, checkboxes) keep their
 * own labels on each control and get a plain heading instead — nesting or mis-pointing a
 * label there would be worse than none.
 */
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
  const id = useId();
  const single = isValidElement(children) && LABELABLE.has(String(children.type));
  const describedBy = help ? `${id}-help` : undefined;

  const control = single
    ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
        id,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className="field">
      {single ? <label htmlFor={id}>{label}</label> : <span className="field-label">{label}</span>}
      {help ? (
        <p className="help" id={describedBy}>
          {help}
        </p>
      ) : null}
      {control}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function Spinner({ text = 'Laster …' }: { text?: string }) {
  return <p className="spinner">{text}</p>;
}
