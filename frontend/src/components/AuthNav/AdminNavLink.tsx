'use client';

import { useAuth } from '@/lib/auth';
import { NAV_LINK } from '@/lib/ui';

/** Ссылка на админ-панель в шапке — видна админам (тейпа и супер). */
export function AdminNavLink() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user?.role !== 'super_admin' && user?.role !== 'teip_admin') return null;
  return (
    <a className={NAV_LINK} href="/admin">
      {user.role === 'super_admin' ? 'Админ' : 'Модерация'}
    </a>
  );
}
