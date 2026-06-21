'use client';

import { useAuth } from '@/lib/auth';

/** Ссылка на админ-панель в шапке — видна только супер-администратору. */
export function AdminNavLink() {
  const { user, ready } = useAuth();
  if (!ready || user?.role !== 'super_admin') return null;
  return <a href="/admin">Админ</a>;
}
