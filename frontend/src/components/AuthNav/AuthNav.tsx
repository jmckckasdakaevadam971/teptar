'use client';

import { clearAuth, useAuth } from '@/lib/auth';

/** Блок в шапке: имя пользователя и выход, либо ссылка на вход. */
export function AuthNav() {
  const { user, ready } = useAuth();

  if (!ready) return <span className="auth-nav" />;

  if (!user) {
    return (
      <span className="auth-nav">
        <a href="/login">Войти</a>
      </span>
    );
  }

  return (
    <span className="auth-nav">
      <a href="/profile" className="user-name" title="Личный кабинет">
        {user.display_name}
      </a>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          clearAuth();
          window.location.href = '/';
        }}
      >
        Выйти
      </button>
    </span>
  );
}
