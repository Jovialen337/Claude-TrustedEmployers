/**
 * pdfjs for the offline edition.
 *
 * `src/extraction/pdfText.ts` does `await import('pdfjs-dist/legacy/build/pdf.mjs')`. The build
 * points that specifier here (and `pdfjs-real` at the real module), so reading a PDF works
 * without that file knowing anything about this edition — and without a race, because this
 * module is evaluated before any caller can use what it exports.
 *
 * What has to be arranged is pdfjs's worker. Normally it is fetched from a URL, and a single
 * file has no URL to serve one from. pdfjs's own answer to that is
 * `globalThis.pdfjsWorker.WorkerMessageHandler`: when that is set it uses it directly on the
 * main thread and never looks at `workerSrc`. So the worker module is imported statically —
 * the bundler puts it in the file and minifies it — and handed over.
 *
 * The alternatives were worse. Leaving it unset makes pdfjs throw
 * `No "GlobalWorkerOptions.workerSrc" specified.` before it will consider any fallback.
 * Pointing `workerSrc` at a blob happens to work, because pdfjs falls back to importing that
 * URL as a module, but it works by way of a failed worker load on a null origin — a quiet
 * dependency on a failure path, in the one feature a phone user is most likely to need. This
 * way is what pdfjs documents, and `npm run smoke:offline` reads a real PDF through the built
 * file so an upgrade that changes it cannot pass unnoticed.
 *
 * The cost is that parsing runs on the main thread: the page is busy for a moment instead of a
 * background worker doing it. Measured well under a second for a one-page schedule.
 */
import * as pdfjsWorker from 'pdfjs-worker-real';
import * as pdfjs from 'pdfjs-real';

// Must be in place before the first `getDocument`, which is why this is module-level.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export * from 'pdfjs-real';
export default pdfjs;
