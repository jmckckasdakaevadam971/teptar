"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { KeeperStatus, Teip } from "@/lib/types";
import {
  CARD,
  ACCENT_CARD,
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT,
  LABEL,
  FIELD,
  FORM_GRID,
  ERR_TEXT,
} from "@/lib/ui";

const OTHER_TEIP = "__other__";

export function KeeperApplyForm() {
  const { user, ready } = useAuth();
  const [status, setStatus] = useState<KeeperStatus | null>(null);
  const [teips, setTeips] = useState<Teip[]>([]);
  const [loading, setLoading] = useState(true);

  // Поля формы
  const [teipChoice, setTeipChoice] = useState<string>("");
  const [customTeip, setCustomTeip] = useState("");
  const [village, setVillage] = useState("");
  const [experience, setExperience] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([api.keepers.my(), api.teips.list()])
      .then(([st, ts]) => {
        setStatus(st);
        setTeips(ts);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [ready, user]);

  const sortedTeips = useMemo(
    () => [...teips].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [teips],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teipChoice) {
      setError("Выберите тейп");
      return;
    }
    if (teipChoice === OTHER_TEIP && customTeip.trim().length < 2) {
      setError("Укажите название тейпа");
      return;
    }
    if (experience.trim().length < 30) {
      setError(
        "Расскажите подробнее, откуда ваши знания — хотя бы пару предложений",
      );
      return;
    }
    setSending(true);
    try {
      await api.keepers.apply({
        teip_id: teipChoice === OTHER_TEIP ? null : Number(teipChoice),
        teip_name: teipChoice === OTHER_TEIP ? customTeip.trim() : undefined,
        village: village.trim() || undefined,
        experience: experience.trim(),
        contact: contact.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  if (!ready || loading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  // Не вошёл в аккаунт
  if (!user) {
    return (
      <div className={`${ACCENT_CARD} max-w-xl`}>
        <h2 className="font-serif text-xl font-bold text-foreground">
          Сначала войдите в аккаунт
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Заявку на роль хранителя может подать только зарегистрированный
          пользователь — так мы будем знать, кому давать права.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/login" className={BTN_PRIMARY}>
            Войти или зарегистрироваться
          </Link>
          <Link href="/keepers" className={BTN_SECONDARY}>
            К хранителям
          </Link>
        </div>
      </div>
    );
  }

  // Уже хранитель
  if (status?.is_keeper) {
    return (
      <div className={`${ACCENT_CARD} max-w-xl`}>
        <h2 className="font-serif text-xl font-bold text-foreground">
          Вы уже хранитель
        </h2>
        {status.teips.length > 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              За вами закреплены тейпы:
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {status.teips.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Вы модератор общей базы — видите заявки всех тейпов.
          </p>
        )}
        <div className="mt-5">
          <Link href="/admin" className={BTN_PRIMARY}>
            К модерации
          </Link>
        </div>
      </div>
    );
  }

  // Заявка уже отправлена (сейчас или ранее)
  if (sent || status?.application?.status === "pending") {
    return (
      <div className={`${ACCENT_CARD} max-w-xl`}>
        <h2 className="font-serif text-xl font-bold text-foreground">
          Заявка на рассмотрении
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Мы получили вашу заявку
          {status?.application?.teip_name || sent
            ? ` по тейпу «${
                sent
                  ? teipChoice === OTHER_TEIP
                    ? customTeip.trim()
                    : (sortedTeips.find((t) => String(t.id) === teipChoice)
                        ?.name ?? "")
                  : status?.application?.teip_name
              }»`
            : ""}
          . Когда админ её рассмотрит, вам придёт письмо на почту.
        </p>
        <div className="mt-5">
          <Link href="/keepers" className={BTN_SECONDARY}>
            К хранителям
          </Link>
        </div>
      </div>
    );
  }

  const wasRejected = status?.application?.status === "rejected";

  return (
    <div className="max-w-xl">
      {wasRejected ? (
        <div className={`${CARD} mb-6 border-[#5b2c25]`}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ваша прошлая заявка была отклонена. Вы можете подать новую —
            расскажите о своих знаниях подробнее.
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} className={FORM_GRID}>
        <div className={FIELD}>
          <label htmlFor="keeper-teip" className={LABEL}>
            Ваш тейп *
          </label>
          <select
            id="keeper-teip"
            className={INPUT}
            value={teipChoice}
            onChange={(e) => setTeipChoice(e.target.value)}
          >
            <option value="">— выберите тейп —</option>
            {sortedTeips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={OTHER_TEIP}>Моего тейпа нет в списке</option>
          </select>
        </div>

        {teipChoice === OTHER_TEIP ? (
          <div className={FIELD}>
            <label htmlFor="keeper-custom-teip" className={LABEL}>
              Название тейпа *
            </label>
            <input
              id="keeper-custom-teip"
              className={INPUT}
              value={customTeip}
              onChange={(e) => setCustomTeip(e.target.value)}
              placeholder="Например: ЦӀечой"
              maxLength={120}
            />
          </div>
        ) : null}

        <div className={FIELD}>
          <label htmlFor="keeper-village" className={LABEL}>
            Родовое село (необязательно)
          </label>
          <input
            id="keeper-village"
            className={INPUT}
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            placeholder="Например: Итум-Кали"
            maxLength={200}
          />
        </div>

        <div className={FIELD}>
          <label htmlFor="keeper-experience" className={LABEL}>
            Откуда ваши знания о тейпе? *
          </label>
          <textarea
            id="keeper-experience"
            className={`${INPUT} min-h-32 resize-y`}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Расскажите: чьи родословные вы знаете, от кого — от старейшин, из книг, из семейных записей? Занимались ли вы историей тейпа?"
            maxLength={4000}
          />
          <p className="text-xs text-muted-foreground">
            Минимум 30 символов. Чем подробнее — тем быстрее одобрим.
          </p>
        </div>

        <div className={FIELD}>
          <label htmlFor="keeper-contact" className={LABEL}>
            Как с вами связаться (необязательно)
          </label>
          <input
            id="keeper-contact"
            className={INPUT}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Telegram, WhatsApp или телефон"
            maxLength={200}
          />
        </div>

        {error ? <p className={ERR_TEXT}>{error}</p> : null}

        <div>
          <button type="submit" className={BTN_PRIMARY} disabled={sending}>
            {sending ? "Отправка…" : "Отправить заявку"}
          </button>
        </div>
      </form>
    </div>
  );
}
