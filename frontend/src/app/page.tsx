'use client'

import { useRef, useState } from 'react'
import { SiteHeader } from '@/components/SiteHeader/SiteHeader'
import { HeroSection } from '@/components/landing/HeroSection'
import { StatsStrip } from '@/components/landing/StatsStrip'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { AboutSection } from '@/components/landing/AboutSection'
import { SiteFooter } from '@/components/SiteFooter/SiteFooter'
import { PersonCard } from '@/components/PersonCard/PersonCard'
import { api } from '@/lib/api'
import type { Person } from '@/lib/types'

export default function Page() {
  const [results, setResults] = useState<Person[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  async function handleSearch(q: string) {
    if (!q) return
    setError(null)
    setSearched(true)
    try {
      setResults(await api.persons.search({ q }))
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска')
    }
  }

  function openTree(id: number) {
    window.location.href = `/person/${id}`
  }

  return (
    <main className="relative min-h-screen bg-background">
      <SiteHeader />
      <HeroSection onSearch={handleSearch} />
      <div className="relative z-10 -mt-10 md:-mt-14">
        <StatsStrip />
      </div>

      {/* Результаты поиска — наша логика поверх визуала v0 */}
      <div ref={resultsRef} className="mx-auto max-w-6xl px-5 md:px-8">
        {error ? (
          <p className="mt-12 text-center text-[#f08a7a]">{error}</p>
        ) : null}
        {searched && results.length === 0 && !error ? (
          <p className="mt-12 text-center text-muted-foreground">
            Ничего не найдено.
          </p>
        ) : null}
        {results.length > 0 ? (
          <section className="mt-16">
            <h2 className="text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
              Результаты
            </h2>
            <div
              className="mt-5 flex items-center justify-center gap-3 text-primary"
              aria-hidden
            >
              <span className="h-px w-[110px] bg-gradient-to-r from-transparent to-primary/60" />
              <span>◆</span>
              <span className="h-px w-[110px] bg-gradient-to-l from-transparent to-primary/60" />
            </div>
            <div className="mt-8 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {results.map((p) => (
                <PersonCard key={p.id} person={p} onOpenTree={openTree} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <FeaturesSection />
      <AboutSection />
      <SiteFooter />
    </main>
  )
}
