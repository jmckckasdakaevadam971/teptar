import { Reveal } from '@/components/Reveal/Reveal';

export function AboutSection() {
  return (
    <section className="relative isolate overflow-hidden border-y border-border bg-secondary/40 py-24 md:py-32">
      <div
        className="absolute inset-x-0 top-0 -z-10 h-full"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 70% at 50% 0%, rgba(201,162,39,0.10) 0%, transparent 70%)',
        }}
      />
      <div className="mx-auto max-w-3xl px-5 text-center md:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary md:text-sm">
            О проекте
          </p>
        </Reveal>
        <Reveal delay={90}>
          <h2 className="mt-6 font-serif text-3xl font-bold text-balance text-foreground md:text-5xl">
            Семь отцов — одна память
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Ворх Да хранит родословные чеченских тейпов: имена, связи и историю
            поколений. Мы помогаем каждой семье собрать своё древо и передать его
            потомкам.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
