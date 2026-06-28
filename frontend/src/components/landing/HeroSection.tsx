'use client'

import { useRef } from 'react'
import { ArrowRight, TreeDeciduous, Link2 } from 'lucide-react'
import { Reveal } from '@/components/Reveal/Reveal'

export function HeroSection({ onSearch }: { onSearch?: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section
      id="hero"
      className="grain relative isolate overflow-hidden pt-32 pb-20 md:pt-44 md:pb-28"
    >
      {/* Tower silhouette background */}
      <div
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/towers-sunset.png')" }}
        aria-hidden="true"
      />
      {/* Sunset gradient + dark wash for readability */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(180deg, rgba(12,10,7,0.55) 0%, rgba(12,10,7,0.7) 45%, rgba(12,10,7,0.95) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 top-0 -z-10 h-2/3"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 18%, rgba(236,205,99,0.18) 0%, rgba(201,162,39,0.06) 40%, transparent 72%)',
        }}
      />

      <div className="mx-auto max-w-4xl px-5 text-center md:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary md:text-sm">
            Ворх Да · Семь Отцов
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.08] text-balance text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Родовая память
            <br />
            <span className="text-primary">чеченских тейпов</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Найдите человека, постройте древо и узнайте общих предков — всё в
            одном месте.
          </p>
        </Reveal>

        {/* Search bar */}
        <Reveal delay={240}>
          <form
            className="mx-auto mt-10 flex max-w-xl items-center gap-2 rounded-2xl border border-primary/40 bg-card/60 p-2 backdrop-blur-md transition-colors focus-within:border-primary"
            onSubmit={(e) => {
              e.preventDefault()
              onSearch?.((inputRef.current?.value ?? '').trim())
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Поиск по ФИО…"
              aria-label="Поиск по ФИО"
              className="flex-1 bg-transparent px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Искать"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        </Reveal>

        {/* CTA buttons */}
        <Reveal delay={320}>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#features"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
            >
              <TreeDeciduous className="h-5 w-5" />
              Моё древо
            </a>
            <a
              href="#features"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-6 py-3 text-base font-semibold text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10 sm:w-auto"
            >
              <Link2 className="h-5 w-5" />
              Кем мы родственники
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
