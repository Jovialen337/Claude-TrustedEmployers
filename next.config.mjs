/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit and pdfjs-dist are Node-only and must not be bundled for the browser.
  serverExternalPackages: ['pdfkit', 'pdfjs-dist'],
  // Next writes its own AGENTS.md/CLAUDE.md on dev startup; this project keeps its
  // documentation in README.md, PLAN.md, DECISIONS.md and PROGRESS.md instead.
  agentRules: false,
};

export default nextConfig;
