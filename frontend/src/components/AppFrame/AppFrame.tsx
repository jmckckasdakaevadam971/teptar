import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/SiteHeader/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter/SiteFooter'

/**
 * Лёгкий каркас страницы: фиксированная шапка v0 сверху, контент с отступом
 * под неё и футер снизу. Для страниц, которым не нужен «титульный» блок PageShell
 * (вход, админка, формы, карточка человека).
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-28 md:px-8 md:pb-20 md:pt-32">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
