/** Aliases set up in `scripts/build-offline.mjs`, so the wrapper can reach the real modules. */
declare module 'pdfjs-real' {
  export * from 'pdfjs-dist/legacy/build/pdf.mjs';
}
declare module 'pdfjs-worker-real' {
  export const WorkerMessageHandler: unknown;
}
