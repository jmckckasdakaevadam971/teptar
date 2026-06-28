import type { ReactNode } from 'react';
import { Reveal } from '@/components/Reveal/Reveal';

/**
 * Каркас внутренней страницы в стиле v0: заголовочный блок (eyebrow + title +
 * description + actions) и контентная область. Хедер и футер — глобальные.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(60% 80% at 80% -10%, rgba(201,162,39,0.18), transparent 60%)',
          }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-16 md:px-8 md:pb-16 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            {eyebrow}
          </p>
          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-balance font-serif text-4xl font-bold leading-tight text-foreground md:text-5xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        <Reveal>{children}</Reveal>
      </div>
    </div>
  );
}
