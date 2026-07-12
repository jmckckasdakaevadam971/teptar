"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Tukhum } from "@/lib/types";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";

/**
 * Диалог выбора тукхума при добавлении тейпа в справочник.
 * Используется при одобрении заявок (на тейп и в хранители).
 * Тукхум необязателен — можно добавить тейп «Без тукхума».
 */
export function TukhumPickDialog({
  teipName,
  busy,
  onConfirm,
  onCancel,
}: {
  teipName: string;
  busy: boolean;
  onConfirm: (tukhumId: number | null) => void;
  onCancel: () => void;
}) {
  const [tukhums, setTukhums] = useState<Tukhum[] | null>(null);
  const [tukhumId, setTukhumId] = useState("");

  useEffect(() => {
    let alive = true;
    api.tukhums
      .list()
      .then((list) => {
        if (alive) setTukhums(list);
      })
      .catch(() => {
        if (alive) setTukhums([]);
      });
    return () => {
      alive = false;
    };
  }, []);

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
          Добавить тейп в справочник
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Тейп «{teipName}» будет добавлен в справочник. Укажите тукхум, к
          которому он относится (необязательно).
        </p>
        <select
          value={tukhumId}
          onChange={(e) => setTukhumId(e.target.value)}
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          <option value="">Без тукхума</option>
          {(tukhums ?? []).map((tk) => (
            <option key={tk.id} value={String(tk.id)}>
              {tk.name}
            </option>
          ))}
        </select>
        {tukhums === null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Загрузка тукхумов…
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy}
            onClick={() => onConfirm(tukhumId ? Number(tukhumId) : null)}
          >
            {busy ? "Добавляю…" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}
