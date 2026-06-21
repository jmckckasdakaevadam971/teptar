import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthNav } from '@/components/AuthNav/AuthNav';
import { AdminNavLink } from '@/components/AuthNav/AdminNavLink';

export const metadata: Metadata = {
  title: 'Vorhda — Ворх Да · Семь Отцов',
  description: 'Сохраняем родовую память чеченских тейпов',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#1B5E20',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="header">
          <div className="container header-inner">
            <a href="/" className="logo" aria-label="Vorhda — Ворх Да">
              <img className="logo-img" src="/logo-full.svg" alt="Vorhda — Ворх Да" />
            </a>
            <nav className="nav">
              <a href="/">Поиск</a>
              <a href="/tree">Древо</a>
              <a href="/persons/new">Добавить</a>
              <a href="/reference">Справочник</a>
              <AdminNavLink />
              <AuthNav />
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="footer">
          <div className="container">© Тептар — родовая память</div>
        </footer>
      </body>
    </html>
  );
}
