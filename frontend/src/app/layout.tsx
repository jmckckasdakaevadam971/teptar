import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css';

// Современная двухшрифтовая система (обе с кириллицей).
// Вариативные шрифты: один файл на все начертания вместо файла на каждый вес.
const sans = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
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
    <html lang="ru" className={`${sans.variable} ${display.variable} bg-background`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
