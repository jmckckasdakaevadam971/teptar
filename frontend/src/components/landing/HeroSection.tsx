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
      {/* Плёнка в цвет фона поверх фото — для читаемости текста в обеих темах
          (переменная --hero-wash: тёмная в .dark, кремовая в светлой) */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--hero-wash) / var(--hero-film-top)) 0%, rgb(var(--hero-wash) / var(--hero-film-mid)) 40%, rgb(var(--hero-wash) / var(--hero-film-mid)) 62%, rgb(var(--hero-wash) / var(--hero-film-top)) 86%, rgb(var(--hero-wash) / 1) 100%)",
        }}
      />

      {/* Контент центрируется в свободном пространстве первого экрана */}
      <div className="mx-auto flex max-w-4xl flex-1 flex-col justify-center px-5 text-center md:px-8">
        {/* Анонс программы хранителей — сразу на виду */}
        <Reveal>
          <div className="flex justify-center">
            <Link
              href="/keepers"
              className="group inline-flex items-center gap-2 rounded-full border border-primary/60 bg-background/80 px-4 py-1.5 text-xs font-semibold text-primary shadow-md backdrop-blur transition-colors hover:border-primary hover:bg-background md:text-sm"
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

        <Reveal delay={120}>
          <h1 className="hero-text mt-8 font-serif text-4xl font-bold leading-[1.08] text-balance sm:text-5xl md:text-6xl lg:text-7xl">
            Родовая память
            <br />
            <span className="hero-text-gold">чеченских тейпов</span>
          </h1>
        </Reveal>

        <Reveal delay={200}>
          <p className="hero-subtext mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed md:text-lg">
            Постройте родовое древо своей семьи, найдите общих предков и
            сохраните историю рода. Справочник тейпов, гаров и сёл чеченского
            народа — в одном месте.
          </p>
        </Reveal>

        {/* CTA */}
        <Reveal delay={280}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/reference"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-gold-lg transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
            >
              Открыть справочник
            </a>
            <Link
              href="/keepers/apply"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-background/85 px-6 py-3 text-base font-semibold text-foreground shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-background hover:text-primary sm:w-auto"
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
