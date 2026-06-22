'use client';

import { useAuth } from '@/lib/auth';

/** Ссылка «Моё древо» — видна только вошедшим пользователям. */
export function MyTreeNavLink() {
  const { user, ready } = useAuth();
  if (!ready || !user) return null;
  return <a href="/my">Моё древо</a>;
}
