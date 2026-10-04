/**
 * Builds the offline single-file edition: `dist/Lonnssjekk.html`.
 *
 * One file, no server, no Node, no install. Open it in a browser — including a phone's — and
 * the whole app runs in the page, with the data in that browser's localStorage.
 *
 * It is the project's own code, not a second implementation. Four edges are swapped by the
 * aliases below, and everything else — the pages, the shell, the sixteen rules, the report,
 * the schedule parser, the masking — is the same source the Next build uses. That is
 * deliberate: a parallel implementation would drift, and the rules are the part that must not.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const src = (...parts) => path.join(root, 'src', ...parts);

/** The four swapped edges. Everything else resolves normally. */
const alias = {
  // A JSON file on disk → this browser's localStorage.
  '@/storage/workspaceStore': src('offline', 'browserStore.ts'),
  // Reading documents with the AI is not in this edition; the UI already handles "no key".
  '@/extraction/claude': src('offline', 'shims', 'claude.ts'),
  // Next's own three modules, which only the shell, the links and the routes touch.
  'next/server': src('offline', 'shims', 'nextServer.ts'),
  'next/link': src('offline', 'shims', 'nextLink.tsx'),
  'next/navigation': src('offline', 'shims', 'nextNavigation.ts'),
  // pdfkit ships a browser build; the Node one reaches for fs and streams.
  pdfkit: path.join(root, 'node_modules', 'pdfkit', 'js', 'pdfkit.standalone.js'),
  // pdfjs, wrapped so its worker runs on the main thread from inside the file. `pdfjs-real`
  // and `pdfjs-worker-real` are how the wrapper reaches the real modules without these
  // aliases catching it again.
  'pdfjs-dist/legacy/build/pdf.mjs': src('offline', 'shims', 'pdfjs.ts'),
  'pdfjs-real': path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'),
  'pdfjs-worker-real': path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
};

/**
 * pdfjs is left to run on the main thread.
 *
 * It wants to start its worker from a URL, and a single file has none to offer. A blob worker
 * was tried: on a `file://` page the blob gets a null origin, the worker fails to load, and
 * pdfjs falls back to the main thread anyway — after the worker's 1.3 MiB had been carried
 * inside the file for nothing, a third of the download on a phone. So it is not carried.
 * Reading a schedule PDF then blocks the page for a moment instead of a worker; measured at
 * well under a second for a one-page plan, which is what this is for.
 */

async function bundle() {
  const result = await esbuild.build({
    entryPoints: [src('offline', 'entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    jsx: 'automatic',
    alias,
    // The app must behave as a production React build, and `process` does not exist in a page.
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.LONNSSJEKK_DATA_DIR': 'undefined',
      'process.env.ANTHROPIC_API_KEY': 'undefined',
      'process.env.CLAUDE_MODEL': 'undefined',
      'process.platform': '"browser"',
      global: 'globalThis',
    },
    loader: { '.css': 'text' },
    legalComments: 'none',
    outfile: path.join(out, 'offline-bundle.js'),
    metafile: true,
    write: false,
    logLevel: 'warning',
  });

  const js = result.outputFiles.find((file) => file.path.endsWith('.js'));
  if (js === undefined) {
    throw new Error(
      `esbuild produced no JavaScript (got: ${result.outputFiles.map((f) => f.path).join(', ') || 'nothing'}).`,
    );
  }
  return { code: js.text, metafile: result.metafile };
}

function shell({ css, js }) {
  // The script is inlined as a module-free IIFE; `</script>` inside a string would end the
  // element early, so it is escaped. Same for the CSS.
  const safe = (text) => text.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lønnssjekk — får du det kontrakten din sier?</title>
<meta name="description" content="Lokalt verktøy som sammenligner arbeidskontrakt, vaktplan og lønnsslipper, og viser hvor de ikke stemmer. Alt skjer i nettleseren din.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1d4ed8"/><text x="16" y="23" font-family="system-ui,sans-serif" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">L</text></svg>',
  )}">
<style>
${css}
</style>
</head>
<body>
<div id="app">
<noscript>
<div style="margin:2rem auto;max-width:34rem;padding:0 1rem;font:16px/1.5 system-ui,sans-serif">
<h1>Lønnssjekk trenger JavaScript</h1>
<p>Hele programmet kjører i nettleseren din, så det må være slått på. Ingenting sendes noe sted.</p>
</div>
</noscript>
</div>
<script>
${safe(js)}
</script>
</body>
</html>
`;
}

const { code, metafile } = await bundle();
const css = await readFile(src('app', 'globals.css'), 'utf8');
const html = shell({ css, js: code });

await mkdir(out, { recursive: true });
const target = path.join(out, 'Lonnssjekk.html');
await writeFile(target, html, 'utf8');

const bytes = Buffer.byteLength(html, 'utf8');
const biggest = Object.entries(metafile.inputs)
  .sort(([, a], [, b]) => b.bytes - a.bytes)
  .slice(0, 5)
  .map(([file, info]) => `    ${(info.bytes / 1024).toFixed(0).padStart(5)} KiB  ${file}`)
  .join('\n');

console.log(`dist/Lonnssjekk.html   ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`sha256                 ${createHash('sha256').update(html).digest('hex').slice(0, 16)}…`);
console.log(`largest inputs:\n${biggest}`);
