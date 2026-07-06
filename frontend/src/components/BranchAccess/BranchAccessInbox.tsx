"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { api } from "@/lib/api";
import type { BranchAccessIncoming, BranchAccessMine } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, ERR_TEXT, LINK_BTN } from "@/lib/ui";

/**
 * Блок «Запросы доступа к ветви» в личном кабинете:
 *  • входящие запросы (я — владелец): предоставить / отклонить, просмотр ветви;
 *  • мои исходящие запросы со статусами.
 * Ничего не рендерит, если запросов нет.
 */
export function BranchAccessInbox() {
  const { user, ready } = useAuth();
  const [incoming, setIncoming] = useState<BranchAccessIncoming[]>([]);
  const [mine, setMine] = useState<BranchAccessMine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [inc, my] = await Promise.all([
      api.branchAccess.incoming(),
      api.branchAccess.mine(),
    ]);
    setIncoming(inc);
    setMine(my);
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    load().catch(() => {
      /* блок необязательный — молча скрываем при ошибке */
    });
  }, [ready, user, load]);

  const resolve = useCallback(
    async (id: number, decision: "approve" | "reject") => {
      setBusyId(id);
      setError(null);
      try {
        if (decision === "approve") await api.branchAccess.approve(id);
        else await api.branchAccess.reject(id);
        await load();
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить решение",
        );
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (incoming.length === 0 && mine.length === 0) return null;

  return (
    <section className={`${CARD} grid gap-5`}>
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-lg font-semibold text-foreground">
          Запросы доступа к ветви
        </h2>
      </div>

      {error ? <p className={ERR_TEXT}>{error}</p> : null}

      {incoming.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Пользователи просят доступ к ветвям вашей родословной. Доступ
            позволяет предлагать правки только выбранной ветви; правки
            применяются после проверки модератором.
          </p>
          {incoming.map((r) => (
            <div
              key={r.id}
              className="grid gap-3 rounded-xl border border-border p-4"
            >
              <p className="text-sm text-foreground">
                <strong>{r.requester_name}</strong> просит доступ к ветви,
                начинающейся с <strong>«{r.person_name}»</strong>{" "}
                <span className="text-muted-foreground">
                  (людей в ветви: {r.branch_count})
                </span>
              </p>
              {r.comment ? (
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  {r.comment}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busyId === r.id}
                  onClick={() => void resolve(r.id, "approve")}
                >
                  Предоставить доступ
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={busyId === r.id}
                  onClick={() => void resolve(r.id, "reject")}
                >
                  Отклонить
                </button>
                <Link
                  href={`/trees/${r.tree_root_id}?branch=${r.branch_root_id}`}
                  className={LINK_BTN}
                  target="_blank"
                >
                  Посмотреть ветвь в древе
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {mine.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-foreground">Мои запросы</h3>
          {mine.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"
            >
              <span className="text-foreground">Ветвь «{r.person_name}»</span>
              {r.status === "pending" ? (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Ожидает решения владельца
                </span>
              ) : r.status === "approved" ? (
                <>
                  <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
                    Доступ предоставлен
                  </span>
                  <Link href={`/trees/${r.tree_root_id}`} className={LINK_BTN}>
                    Редактировать ветвь
                  </Link>
                </>
              ) : (
                <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger">
                  Отклонён
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
