# DECISIONS — Lønnssjekk

Choices made without asking, so the build could keep moving. Each entry: what was unclear,
what was chosen, and why.

Format: `YYYY-MM-DD — topic — decision (why)`

## Stack and tooling

- **2026-09-21 — Frontend framework: Next.js instead of Vite+React.** The spec suggested
  "TypeScript + React (Vite) + a Node or Python backend", but the requester explicitly chose
  *TypeScript + Next.js* when asked. Next.js App Router gives the UI and the local backend
  (route handlers for extraction, PDF and storage) in one process and one `npm run dev`,
  which suits a local-first app with no separate server to start.
