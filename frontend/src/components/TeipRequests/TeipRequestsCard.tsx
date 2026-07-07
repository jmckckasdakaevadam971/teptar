"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Teip, TeipRequest } from "@/lib/types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, ERR_TEXT } from "@/lib/ui";

// ============================================================================
//  Заявки на добавление тейпа в справочник (только super_admin).
//  Появляются, когда при регистрации указан тейп, которого нет в справочнике.
//  Решение по одной заявке закрывает все одноимённые: заявители автоматически
//  прикрепляются к тейпу.
// ============================================================================

/** Нормализация написания: как на бэке — «палочка» и похожие символы → 1. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[ӏіil|!]/g, "1");
}

/** Группа одноимённых заявок (одно решение закрывает всю группу). */
interface RequestGroup {
  key: string;
  name: string;
  ids: number[];
  requesters: string[];
  latest: string;
}

function groupRequests(list: TeipRequest[]): RequestGroup[] {
  const map = new Map<string, RequestGroup>();
  for (const r of list) {
    const key = normalize(r.name);
    const g = map.get(key);
    const requester = r.requester_name || r.requester_email || null;
    if (g) {
      g.ids.push(r.id);
      if (requester && !g.requesters.includes(requester))
        g.requesters.push(requester);
      if (r.created_at > g.latest) g.latest = r.created_at;
    } else {
      map.set(key, {
        key,
        name: r.name,
        ids: [r.id],
        requesters: requester ? [requester] : [],
        latest: r.created_at,
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.latest < b.latest ? 1 : -1));
}

/** Секция «Заявки на тейпы» в админ-панели. */
export function TeipRequestsCard() {
  const [requests, setRequests] = useState<TeipRequest[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Группа, для которой открыт диалог «Это вариант написания…». */
  const [mapping, setMapping] = useState<RequestGroup | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await api.teips.requests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки заявок");
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Решение по группе: бэк сам закрывает одноимённые заявки. */
  async function decide(
    group: RequestGroup,
    action: "approve" | "reject" | "map",
    teipId?: number,
  ) {
    setBusyKey(group.key);
    setError(null);
    try {
      const id = group.ids[0];
      if (action === "approve") await api.teips.approveRequest(id);
      else if (action === "map" && teipId != null)
        await api.teips.mapRequest(id, teipId);
      else await api.teips.rejectRequest(id);
      setMapping(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обработать заявку");
    } finally {
      setBusyKey(null);
    }
  }

  if (requests === null) {
    return (
      <div className={CARD}>
        <h2 className="m-0 font-serif text-xl font-semibold text-foreground">
          Заявки на тейпы
        </h2>
        <p className="mt-2 text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  const groups = groupRequests(requests);

  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="m-0 font-serif text-xl font-semibold text-foreground">
          Заявки на тейпы
          {groups.length > 0 ? (
            <span className="ml-2 rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-medium text-primary">
              {groups.length}
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
        При регистрации указан тейп, которого нет в справочнике. «Добавить» —
        создаёт новый тейп; «Вариант написания» — привязывает название к
        существующему тейпу как синоним. В обоих случаях заявители будут
        автоматически прикреплены к тейпу.
      </p>

      {error ? <p className={ERR_TEXT}>{error}</p> : null}

      {groups.length === 0 ? (
        <p className="text-muted-foreground">Новых заявок нет.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <div
              key={g.key}
              className="rounded-xl border border-border bg-background p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif text-lg font-semibold text-accent">
                  {g.name}
                </span>
                {g.ids.length > 1 ? (
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                    заявок: {g.ids.length}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {new Date(g.latest).toLocaleDateString("ru-RU", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </span>
              </div>

              {g.requesters.length > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Указали при регистрации: {g.requesters.join(", ")}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busyKey === g.key}
                  onClick={() => void decide(g, "approve")}
                >
                  Добавить в справочник
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={busyKey === g.key}
                  onClick={() => setMapping(g)}
                >
                  Вариант написания…
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={busyKey === g.key}
                  onClick={() => void decide(g, "reject")}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mapping ? (
        <MapToTeipDialog
          requestName={mapping.name}
          busy={busyKey === mapping.key}
          onPick={(teipId) => void decide(mapping, "map", teipId)}
          onCancel={() => setMapping(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Диалог «Это вариант написания существующего тейпа»: выбор тейпа из
 * справочника — название заявки станет его синонимом (алиасом).
 */
function MapToTeipDialog({
  requestName,
  busy,
  onPick,
  onCancel,
}: {
  requestName: string;
  busy: boolean;
  onPick: (teipId: number) => void;
  onCancel: () => void;
}) {
  const [teips, setTeips] = useState<Teip[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.teips
      .list()
      .then((list) => {
        if (alive) setTeips(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const nq = normalize(q);
  const filtered = nq
    ? teips.filter(
        (t) =>
          normalize(t.name).includes(nq) ||
          (t.aliases ?? []).some((a) => normalize(a).includes(nq)),
      )
    : teips;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 font-serif text-lg font-semibold text-foreground">
          Вариант написания
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          «{requestName}» станет синонимом выбранного тейпа: будет находиться в
          поиске, а заявители прикрепятся к этому тейпу.
        </p>
        <input
          type="text"
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          placeholder="Поиск тейпа…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">
              Загрузка тейпов…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Ничего не найдено.
            </p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                  selected === t.id
                    ? "bg-accent text-white"
                    : "bg-transparent text-foreground hover:bg-surface"
                }`}
                onClick={() => setSelected(t.id)}
              >
                {t.name}
                {t.aliases && t.aliases.length > 0 ? (
                  <span
                    className={
                      selected === t.id
                        ? "ml-2 text-xs text-white/70"
                        : "ml-2 text-xs text-muted-foreground"
                    }
                  >
                    ({t.aliases.join(", ")})
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={selected == null || busy}
            onClick={() => selected != null && onPick(selected)}
          >
            Привязать
          </button>
        </div>
      </div>
    </div>
  );
}
