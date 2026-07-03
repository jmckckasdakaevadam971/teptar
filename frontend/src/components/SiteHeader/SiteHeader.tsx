"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, clearAuth, canModerate } from "@/lib/auth";

const BASE_LINKS = [
  { label: "Главная", href: "/" },
  { label: "Древа", href: "/trees" },
  { label: "Справочник", href: "/reference" },
  { label: "Хранители", href: "/keepers" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, ready } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    ...BASE_LINKS,
    // ⚠️ ВРЕМЕННО: показываем «Моё древо» всем для предпросмотра без входа.
    // Верните условие `ready && user`, когда заработают вход и API.
    { label: "Моё древо", href: "/my" },
    ...(canModerate(user?.role) ? [{ label: "Админ", href: "/admin" }] : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const accountHref = ready && user ? "/profile" : "/login";
  const accountLabel = ready && user ? "Профиль" : "Войти";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || pathname !== "/"
          ? "border-b border-border bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link
          href="/"
          className="font-serif text-3xl font-bold tracking-tight text-primary md:text-4xl"
        >
          Vorhda
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-foreground",
                isActive(link.href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href={accountHref}
            className={cn(
              "rounded-xl border px-6 py-2.5 text-base font-medium transition-colors",
              isActive("/profile")
                ? "border-primary text-primary"
                : "border-border text-foreground hover:border-primary hover:text-primary",
            )}
          >
            {accountLabel}
          </Link>
          {ready && user ? (
            <button
              type="button"
              onClick={clearAuth}
              className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Выйти
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground md:hidden"
          aria-label="Меню"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl transition-[max-height] duration-300 md:hidden",
          open ? "max-h-96" : "max-h-0 border-t-transparent",
        )}
      >
        <nav className="flex flex-col gap-1 px-5 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-secondary hover:text-foreground",
                isActive(link.href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={accountHref}
            onClick={() => setOpen(false)}
            className="mt-2 rounded-xl border border-primary px-3 py-3 text-center text-base font-medium text-primary"
          >
            {accountLabel}
          </Link>
          {ready && user ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                clearAuth();
              }}
              className="rounded-lg px-3 py-3 text-center text-base font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Выйти
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
