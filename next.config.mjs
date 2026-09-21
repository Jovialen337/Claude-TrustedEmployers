/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit and pdfjs-dist are Node-only and must not be bundled for the browser.
  serverExternalPackages: ['pdfkit', 'pdfjs-dist'],
};

export default nextConfig;
