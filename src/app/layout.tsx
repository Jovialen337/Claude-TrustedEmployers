import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Shell } from './_components/Shell';

export const metadata: Metadata = {
  title: 'Lønnssjekk — får du det kontrakten din sier?',
  description:
    'Lokalt verktøy som sammenligner arbeidskontrakt, vaktplan og lønnsslipper, og viser hvor de ikke stemmer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
