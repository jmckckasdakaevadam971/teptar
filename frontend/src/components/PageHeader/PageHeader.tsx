import type { ReactNode } from 'react';

/**
 * Шапка внутренней страницы в стиле v0: надпись-eyebrow (моно, разрядка),
 * крупный серифный заголовок, описание и опциональные действия справа.
 * Сверху — мягкий золотой радиальный градиент. Хедер/футер сайта даёт layout,
 * поэтому здесь только заголовочный блок (без дублирования навигации).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative mb-8 md:mb-10">
      <div
        className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-48"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 80% at 50% 0%, rgb(var(--primary) / 0.12) 0%, transparent 70%)',
        }}
      />
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-balance font-serif text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
