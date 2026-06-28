import { TreeDeciduous, Link2, BookOpen } from 'lucide-react'
import { Reveal } from '@/components/Reveal/Reveal'

const FEATURES = [
  {
    icon: TreeDeciduous,
    title: 'Моё древо',
    text: 'Постройте родословную своей семьи и сохраните её для потомков.',
  },
  {
    icon: Link2,
    title: 'Родство',
    text: 'Узнайте, кем приходятся друг другу два человека и кто их общий предок.',
  },
  {
    icon: BookOpen,
    title: 'Справочник',
    text: 'Тейпы, тукхумы и сёла Чечни в едином структурированном справочнике.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-3xl font-bold text-balance text-foreground md:text-4xl lg:text-5xl">
          Что можно сделать
        </h2>
        <div className="mt-5 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-primary/60" />
          <span className="text-primary">◆</span>
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-primary/60" />
        </div>
      </Reveal>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 110}>
            <article className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/50">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-secondary text-primary transition-colors group-hover:border-primary/50">
                <feature.icon className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 font-serif text-2xl font-bold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {feature.text}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
