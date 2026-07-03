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
  metadataBase: new URL('https://vorhda.ru'),
  title: {
    default: 'Vorhda · Ворх Да — Родовое древо чеченских тейпов онлайн',
    template: '%s — Vorhda · Ворх Да',
  },
  description:
    'Постройте родовое древо онлайн бесплатно. Справочник чеченских тейпов, гаров и сёл, поиск предков, объединение семейных древ с родственниками. Ворх Да — платформа родовой памяти.',
  keywords: [
    'родовое древо',
    'семейное древо',
    'генеалогическое древо',
    'построить древо онлайн',
    'чеченские тейпы',
    'справочник тейпов',
    'тейпы и гары',
    'найти предков',
    'генеалогия',
    'история рода',
    'тептар',
    'ворх да',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://vorhda.ru',
    siteName: 'Vorhda · Ворх Да',
    title: 'Vorhda — Родовое древо чеченских тейпов онлайн',
    description:
      'Постройте родовое древо, найдите общих предков и сохраните историю рода. Справочник тейпов, гаров и сёл — бесплатно.',
    images: [
      {
        url: '/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Vorhda — родовая память чеченских тейпов',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vorhda — Родовое древо чеченских тейпов онлайн',
    description:
      'Постройте родовое древо, найдите общих предков и сохраните историю рода.',
    images: ['/og.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // Коды подтверждения прав в Яндекс.Вебмастере / Google Search Console
  // задаются переменными окружения при сборке (пустые — тег не выводится).
  verification: {
    ...(process.env.NEXT_PUBLIC_YANDEX_VERIFICATION
      ? { yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION }
      : {}),
  },
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
