import type { Metadata } from 'next';
import './globals.css';
import ErudaLoader from './components/ErudaLoader';

export const metadata: Metadata = {
  title: 'TileCraft',
  description: 'Tool that generates stunning portrait game tiles from casino game provider assets using Nano Banana and Canvas',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ErudaLoader />
      </body>
    </html>
  );
}
