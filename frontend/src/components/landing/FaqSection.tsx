/**
 * FAQ на главной: живой контент под ключевые поисковые запросы
 * («как построить родовое древо», «что такое тейп» и т.д.).
 * Вопросы дублируются в JSON-LD (FAQPage) на странице — see page.tsx.
 */
export const FAQ_ITEMS = [
  {
    q: "Как построить родовое древо на Vorhda?",
    a: "Зарегистрируйтесь, откройте раздел «Моё древо» и добавляйте родственников: родителей, дедов и прадедов. Конструктор сам выстроит схему семейного древа от старшего предка к потомкам. Это бесплатно.",
  },
  {
    q: "Что такое тейп?",
    a: "Тейп — род у чеченцев, объединение семей с общим предком и общей историей. Тейпы делятся на гары (ветви) и некъи. На Vorhda собран справочник чеченских тейпов, гаров и родовых сёл.",
  },
  {
    q: "Можно ли найти общих предков с другими семьями?",
    a: "Да. Когда в опубликованных древах встречается один и тот же предок, платформа предлагает объединить ветви в общее древо — так восстанавливаются связи между семьями одного рода.",
  },
  {
    q: "Сколько это стоит?",
    a: "Vorhda полностью бесплатна: построение генеалогического древа, справочник тейпов, поиск предков и объединение древ не требуют оплаты.",
  },
  {
    q: "Кто видит моё семейное древо?",
    a: "Пока вы работаете над древом, его видите только вы. После отправки на модерацию и одобрения хранителями древо публикуется в общей базе, где его могут найти родственники.",
  },
] as const;

export function FaqSection() {
  return (
    <section
      id="faq"
      className="border-t border-border bg-background"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-4xl px-5 py-20 md:px-8 md:py-28">
        <p className="text-center font-mono text-xs uppercase tracking-[0.25em] text-primary">
          Хаттарш · Вопросы
        </p>
        <h2
          id="faq-heading"
          className="mt-4 text-center font-serif text-3xl font-bold text-foreground md:text-4xl"
        >
          Частые вопросы о родовом древе
        </h2>

        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-border bg-card/60 px-5 py-4 transition-colors hover:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-primary transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
