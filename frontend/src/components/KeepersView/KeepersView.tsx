"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, BookOpenText, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Keeper } from "@/lib/types";
import { CARD, ACCENT_CARD, BTN_PRIMARY } from "@/lib/ui";

const DUTIES = [
  {
    icon: ShieldCheck,
    title: "Проверяет родословные",
    text: "Заявки по его тейпу попадают к нему: он сверяет имена, даты и связи с тем, что знает сам и что говорят старейшины.",
  },
  {
    icon: BookOpenText,
    title: "Бережёт достоверность",
    text: "Одобряет только то, в чём уверен. Спорные записи возвращает автору с пояснением — так база остаётся чистой.",
  },
  {
    icon: Users,
    title: "Отвечает за свой тейп",
    text: "Хранитель — публичное лицо своего тейпа на Vorhda. Его имя видят все: это статус и ответственность.",
  },
];

function keeperSince(since: string): string {
  const year = new Date(since).getFullYear();
  return Number.isFinite(year) ? `Хранитель с ${year} года` : "Хранитель";
}

export function KeepersView() {
  const [keepers, setKeepers] = useState<Keeper[] | null>(null);

  useEffect(() => {
    api.keepers
      .list()
      .then(setKeepers)
      .catch(() => setKeepers([]));
  }, []);

  return (
    <div className="grid gap-12">
      {/* Что делает хранитель */}
      <section>
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Что делает хранитель
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {DUTIES.map((d) => (
            <div key={d.title} className={CARD}>
              <d.icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-semibold text-foreground">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {d.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Список хранителей */}
      <section>
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Хранители
        </h2>
        {keepers === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Загрузка…</p>
        ) : keepers.length === 0 ? (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Список хранителей пока пуст — программа только начинается. Станьте
            первым, кто возьмёт под опеку родословные своего тейпа.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {keepers.map((k) => (
              <div key={k.user_id} className={CARD}>
                <p className="font-serif text-lg font-bold text-foreground">
                  {k.display_name}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {k.teips.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {keeperSince(k.since)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className={ACCENT_CARD}>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Знаете свой тейп?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Если вы знаете родословные, сёла и историю своего тейпа —
              расскажите о себе. Мы дадим вам права хранителя, и заявки по
              вашему тейпу будут проходить через вас.
            </p>
          </div>
          <Link href="/keepers/apply" className={BTN_PRIMARY}>
            Стать хранителем
          </Link>
        </div>
      </section>
    </div>
  );
}
