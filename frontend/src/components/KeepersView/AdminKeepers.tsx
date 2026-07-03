"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KeeperApplication, Teip } from "@/lib/types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, ERR_TEXT, ROLE_SELECT } from "@/lib/ui";

// ============================================================================
//  Админ-компоненты программы «Хранители»: очередь заявок и редактор тейпов.
// ============================================================================

/** Секция «Заявки в хранители» (только super_admin). */
export function KeeperApplicationsCard({
  onApproved,
}: {
  onApproved?: () => void;
}) {
  const [apps, setApps] = useState<KeeperApplication[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await api.keepers.applications());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки заявок");
      setApps([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: number, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") {
        await api.keepers.approveApplication(id);
        onApproved?.();
      } else {
        await api.keepers.rejectApplication(id);
      }
      setApps((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обработать заявку");
    } finally {
      setBusyId(null);
    }
  }

  if (apps === null) {
    return (
      <div className={CARD}>
        <h2 className="m-0 font-serif text-xl font-semibold text-foreground">
          Заявки в хранители
        </h2>
        <p className="mt-2 text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="m-0 font-serif text-xl font-semibold text-foreground">
          Заявки в хранители
          {apps.length > 0 ? (
            <span className="ml-2 rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-medium text-primary">
              {apps.length}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => void load()}
        >
          Обновить
        </button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Люди, которые хотят проверять родословные своего тейпа. При одобрении
        человек получит роль «Админ тейпа», а тейп закрепится за ним.
      </p>

      {error ? <p className={ERR_TEXT}>{error}</p> : null}

      {apps.length === 0 ? (
        <p className="text-muted-foreground">Новых заявок нет.</p>
      ) : (
        <div className="grid gap-4">
          {apps.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border bg-background p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold text-accent">
                  {a.display_name}
                </span>
                {a.email ? (
                  <span className="text-sm text-muted-foreground">
                    {a.email}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("ru-RU", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-medium text-primary">
                  Тейп: {a.teip_name}
                  {a.teip_id == null ? " (нет в справочнике)" : ""}
                </span>
                {a.village ? (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">
                    Село: {a.village}
                  </span>
                ) : null}
                {a.contact ? (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">
                    Контакт: {a.contact}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {a.experience}
              </p>

              {a.teip_id == null ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Тейпа нет в справочнике — при одобрении закрепление не
                  произойдёт автоматически. Добавьте тейп в справочник и
                  закрепите его вручную в таблице пользователей.
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busyId === a.id}
                  onClick={() => void decide(a.id, "approve")}
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={busyId === a.id}
                  onClick={() => void decide(a.id, "reject")}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Чипы закреплённых тейпов + добавление, для строки пользователя. */
export function UserTeipsEditor({
  userId,
  teips,
  allTeips,
  onChange,
}: {
  userId: number;
  teips: { id: number; name: string }[];
  allTeips: Teip[];
  onChange: (teips: { id: number; name: string }[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function save(next: number[]) {
    setBusy(true);
    try {
      const res = await api.keepers.setUserTeips(userId, next);
      onChange(res.teips);
    } catch {
      // Ошибку покажет общий баннер страницы при следующей загрузке.
    } finally {
      setBusy(false);
    }
  }

  const ids = teips.map((t) => t.id);
  const available = allTeips.filter((t) => !ids.includes(t.id));

  return (
    <div className="flex max-w-64 flex-wrap items-center gap-1.5">
      {teips.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {t.name}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-primary/70 hover:text-primary"
            disabled={busy}
            title={`Открепить тейп ${t.name}`}
            onClick={() => void save(ids.filter((id) => id !== t.id))}
          >
            ×
          </button>
        </span>
      ))}
      <select
        className={`${ROLE_SELECT} px-2 py-1 text-xs`}
        value=""
        disabled={busy}
        title="Закрепить тейп"
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) void save([...ids, id]);
        }}
      >
        <option value="">+ тейп</option>
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
