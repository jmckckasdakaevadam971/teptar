import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal/Reveal";

/** Секция «Хранители тептара» — призыв знатокам тейпов на главной. */
export function KeepersSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
      <div className="relative isolate overflow-hidden rounded-3xl border border-primary/40 bg-card px-6 py-14 text-center md:px-12 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(70% 90% at 50% 0%, rgba(201,162,39,0.14) 0%, transparent 70%)",
          }}
        />

        <Reveal>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-primary/40 bg-secondary text-primary">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
          </div>
        </Reveal>

        <Reveal delay={90}>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-primary md:text-sm">
            Хранители тептара
          </p>
        </Reveal>

        <Reveal delay={160}>
          <h2 className="mt-5 font-serif text-3xl font-bold text-balance text-foreground md:text-4xl lg:text-5xl">
            Знаете свой тейп?
            <br />
            Станьте его хранителем
          </h2>
        </Reveal>

        <Reveal delay={240}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Хранители — знатоки своих тейпов. Они проверяют родословные,
            сверяют имена и даты и берегут память рода от ошибок. Каждый тейп
            заслуживает своего хранителя.
          </p>
        </Reveal>

        <Reveal delay={320}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/keepers/apply"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
            >
              Стать хранителем
            </Link>
            <Link
              href="/keepers"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-base font-semibold text-foreground transition-colors hover:border-primary hover:text-primary sm:w-auto"
            >
              Кто такие хранители
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
