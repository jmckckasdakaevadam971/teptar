'use client';

import { clearAuth, useAuth } from '@/lib/auth';
import { NAV_LINK, LINK_BTN } from '@/lib/ui';

/** Блок в шапке: имя пользователя и выход, либо ссылка на вход. */
export function AuthNav() {
  const { user, ready } = useAuth();

  if (!ready) return <span className="ml-[18px] inline-flex items-center gap-3" />;

  if (!user) {
    return (
      <span className="inline-flex items-center">
        <a className={NAV_LINK} href="/login">
          Войти
        </a>
      </span>
    );
  }

  return (
    <span className="ml-[18px] inline-flex items-center gap-3">
      <a href="/profile" className="text-sm font-semibold text-cream" title="Личный кабинет">
        {user.display_name}
      </a>
      <button
        type="button"
        className={LINK_BTN}
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
