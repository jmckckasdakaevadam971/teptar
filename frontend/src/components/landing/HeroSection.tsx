"use client";

import { Reveal } from "@/components/Reveal/Reveal";

export function HeroSection() {
  return (
    <section
      id="hero"
      className="grain relative isolate overflow-hidden pt-32 pb-32 md:pt-44 md:pb-44"
    >
      {/* Tower silhouette background */}
      <div
        className="absolute inset-0 -z-10 bg-cover bg-no-repeat"
        style={{
          backgroundImage: "url('/images/towers-sunset.png')",
          backgroundPosition: "center 8%",
        }}
        aria-hidden="true"
      />
      {/* Sunset gradient + dark wash for readability */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(180deg, rgba(12,10,7,0.55) 0%, rgba(12,10,7,0.7) 45%, rgba(12,10,7,0.95) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 -z-10 h-2/3"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 18%, rgba(236,205,99,0.18) 0%, rgba(201,162,39,0.06) 40%, transparent 72%)",
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
            Справочник тейпов, гаров и сёл чеченского народа — в одном месте.
          </p>
        </Reveal>

        {/* CTA */}
        <Reveal delay={240}>
          <div className="mt-10 flex justify-center">
            <a
              href="/reference"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
            >
              Открыть справочник
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
