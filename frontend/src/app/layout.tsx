import type { ReactNode } from 'react';
import './globals.css';
import { AuthNav } from '@/components/AuthNav/AuthNav';

export const metadata = {
  title: 'Тептар — родословные чеченских тейпов',
  description: 'Генеалогическое древо по тейпам, поиск общих предков.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="header">
          <div className="container header-inner">
            <a href="/" className="logo">
              Тептар
            </a>
            <nav className="nav">
              <a href="/">Поиск</a>
              <a href="/tree">Древо</a>
              <a href="/persons/new">Добавить</a>
              <a href="/reference">Справочник</a>
              <a href="/admin">Модерация</a>
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
