import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter/SiteFooter';
import { AppMain } from '@/components/AppMain/AppMain';

// Современная двухшрифтовая система (обе с кириллицей)
const sans = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vorhda · Ворх Да — Родовая память чеченских тейпов',
  description:
    'Ворх Да (Семь Отцов) — платформа родовой памяти чеченских тейпов. Найдите человека, постройте древо и узнайте общих предков.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0c0a07',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <SiteHeader />
        <AppMain>{children}</AppMain>
        <SiteFooter />
      </body>
    </html>
  );
}
