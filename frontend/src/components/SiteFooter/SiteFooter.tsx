const SECTION_LINKS = [
  { label: 'Главная', href: '/' },
  { label: 'Моё древо', href: '/my' },
  { label: 'Родство', href: '/relatives' },
  { label: 'Справочник', href: '/reference' },
];

export function SiteFooter() {
  return (
    <footer className="relative bg-background">
      {/* Золотая орнаментальная линия */}
      <div
        className="h-px w-full"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(201,162,39,0.6) 50%, transparent 100%)',
        }}
      />
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <div className="grid gap-12 md:grid-cols-3">
          <div>
            <p className="font-serif text-2xl font-bold text-primary">Vorhda</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Родовая память · Ворх Да
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              Разделы
            </h3>
            <ul className="mt-4 space-y-3">
              {SECTION_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              Контакты
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="mailto:info@vorhda.ru"
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  info@vorhda.ru
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-border pt-8">
          <p className="text-center text-xs leading-relaxed text-muted-foreground md:text-sm">
            © 2026 Тептар — родовая память · Ворх Да. Все права защищены.
          </p>
        </div>
      </div>
    </footer>
  );
}
