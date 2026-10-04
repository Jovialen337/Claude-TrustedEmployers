/**
 * The offline single-file edition's entry point.
 *
 * It mounts the same pages the Next app serves, inside the same shell, with the hash router
 * from `navigation.ts` and the in-page API from `api.ts`. Nothing is reimplemented here: the
 * pages, the shell, the rules and the report are the project's own files.
 */
import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from '../app/_components/Shell';
import InnstillingerPage from '../app/innstillinger/page';
import KontraktPage from '../app/kontrakt/page';
import LesPage from '../app/les/page';
import LonnsslipperPage from '../app/lonnsslipper/page';
import StartPage from '../app/page';
import RapportPage from '../app/rapport/page';
import SjekkPage from '../app/sjekk/page';
import VakterPage from '../app/vakter/page';
import { handleApiRequest, installApiFetch, routePath } from './api';
import { currentPath, subscribe } from './navigation';

const PAGES: Record<string, () => React.JSX.Element> = {
  '/': StartPage,
  '/kontrakt': KontraktPage,
  '/vakter': VakterPage,
  '/lonnsslipper': LonnsslipperPage,
  '/les': LesPage,
  '/sjekk': SjekkPage,
  '/rapport': RapportPage,
  '/innstillinger': InnstillingerPage,
};

function UnknownPage({ path }: { path: string }) {
  return (
    <section>
      <h1>Fant ikke siden</h1>
      <p className="lead">
        Adressen <code>{path}</code> finnes ikke i Lønnssjekk. Gå til <a href="#/">startsiden</a>.
      </p>
    </section>
  );
}

function App() {
  const path = useSyncExternalStore(subscribe, currentPath, () => currentPath());
  const Page = PAGES[path];

  // The pages are written for a server that sets the document title; here it is set once.
  useEffect(() => {
    document.title = 'Lønnssjekk — får du det kontrakten din sier?';
  }, []);

  // Scrolling to the top on each step makes the long pages usable on a phone.
  useEffect(() => {
    globalThis.scrollTo({ top: 0 });
  }, [path]);

  return <Shell>{Page === undefined ? <UnknownPage path={path} /> : <Page />}</Shell>;
}

/**
 * The report page offers the PDF as a plain `<a href="/api/report">`, which a server would
 * answer. Here the click is caught, the PDF is built in the page, and the browser is handed a
 * blob to save — so the page itself stays exactly as the Next build has it.
 */
function installReportDownload(): void {
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest?.('a');
    if (anchor === null || anchor === undefined) return;
    const href = anchor.getAttribute('href');
    if (href === null || routePath(href) !== '/api/report') return;

    event.preventDefault();
    const busy = anchor.textContent;
    anchor.textContent = 'Lager PDF …';
    void (async () => {
      try {
        const response = await handleApiRequest('/api/report', { method: 'GET' });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Rapporten kunne ikke lages (${response.status}).`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lonnssjekk-rapport-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Revoked late: a phone browser may still be opening the blob when the click returns.
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        globalThis.alert((error as Error).message);
      } finally {
        if (busy !== null) anchor.textContent = busy;
      }
    })();
  });
}

/** A blank page tells the user nothing. Any failure to start says so, on the page. */
function showStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'margin:2rem auto;max-width:34rem;padding:0 1rem;font:16px/1.5 system-ui,sans-serif';
  const heading = document.createElement('h1');
  heading.textContent = 'Lønnssjekk klarte ikke å starte';
  const paragraph = document.createElement('p');
  paragraph.textContent =
    'Dette er en feil i programmet, ikke i dataene dine. Prøv å laste siden på nytt. ' +
    'Står det fortsatt her, er det nyttig å ta med meldingen under hvis du melder det videre.';
  const detail = document.createElement('pre');
  detail.style.cssText = 'white-space:pre-wrap;background:#f4f4f5;padding:.75rem;border-radius:.5rem';
  detail.textContent = message;
  box.append(heading, paragraph, detail);
  document.body.appendChild(box);
}

export function start(): void {
  try {
    installApiFetch();
    installReportDownload();
    const mount = document.getElementById('app');
    if (mount === null) throw new Error('Fant ikke <div id="app"> å montere i.');
    createRoot(mount).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    showStartupFailure(error);
  }
}

start();
