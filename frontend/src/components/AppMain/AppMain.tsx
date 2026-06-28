'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Обёртка основного контента. На главной hero уходит под прозрачный
 * фиксированный хедер, на остальных страницах добавляется отступ сверху.
 */
export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  return <main className={isHome ? 'min-h-[60vh]' : 'min-h-[60vh] pt-[72px]'}>{children}</main>;
}
