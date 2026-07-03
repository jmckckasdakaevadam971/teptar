"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal/Reveal";
import { StatsStrip } from "@/components/landing/StatsStrip";

export function HeroSection() {
  return (
    <section
      id="hero"
      className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden pt-28 md:pt-32"
    >
      {/* Tower silhouette background — <img> вместо CSS-фона, чтобы
          preload-сканер браузера начал загрузку сразу (LCP). */}
      <img
        src="/images/towers-sunset.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
        style={{ objectPosition: "center 26%" }}
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

      {/* Контент центрируется в свободном пространстве первого экрана */}
      <div className="mx-auto flex max-w-4xl flex-1 flex-col justify-center px-5 text-center md:px-8">
        {/* Анонс программы хранителей — сразу на виду */}
        <Reveal>
          <div className="flex justify-center">
            <Link
              href="/keepers"
              className="group inline-flex items-center gap-2 rounded-full border border-primary/50 bg-background/40 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur transition-colors hover:border-primary hover:bg-primary/10 md:text-sm"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
              Ищем хранителей тейпов
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-primary md:text-sm">
            Ворх Да · Семь Отцов
          </p>
        </Reveal>

        <Reveal delay={120}>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.08] text-balance text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Родовая память
            <br />
            <span className="text-primary">чеченских тейпов</span>
          </h1>
        </Reveal>

        <Reveal delay={200}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Справочник тейпов, гаров и сёл чеченского народа — в одном месте.
          </p>
        </Reveal>

        {/* CTA */}
        <Reveal delay={280}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/reference"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
            >
              Открыть справочник
            </a>
            <Link
              href="/keepers/apply"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-background/30 px-6 py-3 text-base font-semibold text-foreground backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary sm:w-auto"
            >
              <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />
              Стать хранителем
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Панель статистики прижата к низу первого экрана, фон общий */}
      <div className="w-full pb-8 pt-14 md:pb-10">
        <StatsStrip />
      </div>
    </section>
  );
}
