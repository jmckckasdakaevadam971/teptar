import { Reveal } from '@/components/Reveal/Reveal';

const STATS = [
  { value: '136', label: 'тейпов' },
  { value: '9', label: 'тукхумов' },
  { value: '283', label: 'села' },
  { value: '∞', label: 'поколений' },
];

export function StatsStrip() {
  return (
    <section className="mx-auto max-w-6xl px-5 md:px-8">
      <Reveal>
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-4">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={[
                'flex flex-col items-center justify-center gap-2 px-4 py-8 md:py-10',
                'border-border',
                i % 2 === 0 ? 'border-r' : '',
                i < 2 ? 'border-b md:border-b-0' : '',
                'md:border-r md:last:border-r-0',
              ].join(' ')}
            >
              <span className="font-serif text-4xl font-bold text-primary md:text-5xl">
                {stat.value}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground md:text-sm">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
