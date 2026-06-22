import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthNav } from '@/components/AuthNav/AuthNav';
import { AdminNavLink } from '@/components/AuthNav/AdminNavLink';
import { MyTreeNavLink } from '@/components/AuthNav/MyTreeNavLink';

export const metadata: Metadata = {
  title: 'Vorhda — Ворх Да · Семь Отцов',
  description: 'Сохраняем родовую память чеченских тейпов',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0e0b08',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="ornament-band" />
        <header className="header">
          <div className="container header-inner">
            <a href="/" className="logo" aria-label="Vorhda — Ворх Да">
              <img className="logo-img" src="/logo-full.svg" alt="Vorhda — Ворх Да" />
            </a>
            <nav className="nav">
              <a href="/">Главная</a>
              <MyTreeNavLink />
              <a href="/relatives">Родство</a>
              <a href="/reference">Справочник</a>
              <AdminNavLink />
              <AuthNav />
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
        <div className="ornament-band" />
        <footer className="footer">
          <div className="container">© Тептар — родовая память · Ворх Да</div>
        </footer>
      </body>
    </html>
  );
}
