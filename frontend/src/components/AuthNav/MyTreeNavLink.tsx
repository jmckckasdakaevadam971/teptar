'use client';

import { useAuth } from '@/lib/auth';
import { NAV_LINK } from '@/lib/ui';

/** Ссылка «Моё древо» — видна только вошедшим пользователям. */
export function MyTreeNavLink() {
  const { user, ready } = useAuth();
  if (!ready || !user) return null;
  return (
    <a className={NAV_LINK} href="/my">
      Моё древо
    </a>
  );
}
