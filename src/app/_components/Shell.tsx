'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWorkspace } from '../_lib/client';

const STEPS = [
  { href: '/', label: 'Start' },
  { href: '/kontrakt', label: '1. Kontrakt' },
  { href: '/vakter', label: '2. Vakter' },
  { href: '/lonnsslipper', label: '3. Lønnsslipper' },
  { href: '/sjekk', label: '4. Sjekk' },
  { href: '/rapport', label: '5. Rapport' },
  { href: '/innstillinger', label: 'Innstillinger' },
] as const;

/** A tick next to the steps that are already filled in, so the next step is obvious. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetchWorkspace()
      .then((workspace) => {
        if (cancelled) return;
        setDone({
          '/kontrakt': workspace.contract !== null,
          '/vakter': workspace.shifts.length > 0,
          '/lonnsslipper': workspace.payslips.length > 0,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#innhold">Gå til innholdet</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            Lønns<span>sjekk</span>
          </Link>
          <nav className="steps" aria-label="Stegene i sjekken">
            {STEPS.map((step) => (
              <Link
                key={step.href}
                href={step.href}
                aria-current={pathname === step.href ? 'page' : undefined}
              >
                {step.label}
                {done[step.href] ? <span className="tick" aria-label=" (fylt ut)"> ✓</span> : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="page" id="innhold">
        {children}
      </main>
      <footer className="footer">
        <p>
          Lønnssjekk kjører lokalt på din egen maskin. Dataene dine ligger bare her, uten konto og uten
          skylagring. Du kan slette alt under <Link href="/innstillinger">Innstillinger</Link>.
        </p>
        <p>
          Dette er ikke juridisk rådgivning. Kontakt fagforeningen din eller Arbeidstilsynet for hjelp.
        </p>
      </footer>
    </>
  );
}
