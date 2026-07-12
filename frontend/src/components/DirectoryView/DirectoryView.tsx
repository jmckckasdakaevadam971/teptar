"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Teip, Tukhum } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { TeipMapModal } from "./TeipMapModal";

export function DirectoryView() {
  const [teips, setTeips] = useState<Teip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tukkhum, setTukkhum] = useState("Все");
  const [selected, setSelected] = useState<Teip | null>(null);
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  // Форма добавления тейпа (только super_admin).
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTukhumId, setNewTukhumId] = useState("");
  const [tukhumOptions, setTukhumOptions] = useState<Tukhum[] | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    api.teips
      .list()
      .then(setTeips)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (adding && tukhumOptions === null) {
      api.tukhums
        .list()
        .then(setTukhumOptions)
        .catch(() => setTukhumOptions([]));
    }
  }, [adding, tukhumOptions]);

  async function createTeip() {
    setAddSaving(true);
    setAddError(null);
    try {
      if (newName.trim().length < 2) throw new Error("Укажите название");
      await api.teips.create({
        name: newName.trim(),
        description: newDesc.trim() || null,
        tukhum_id: newTukhumId ? Number(newTukhumId) : null,
      });
      // Перезагружаем список — сразу с tukhum_name и алиасами.
      setTeips(await api.teips.list());
      setAdding(false);
      setNewName("");
      setNewDesc("");
      setNewTukhumId("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setAddSaving(false);
    }
  }

  const tukkhums = useMemo(
    () => [
      "Все",
      ...Array.from(
        new Set(teips.map((t) => t.tukhum_name).filter(Boolean) as string[]),
      ),
    ],
    [teips],
  );

  const filtered = useMemo(() => {
    return teips.filter((t) => {
      const matchesQuery =
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesTukkhum = tukkhum === "Все" || t.tukhum_name === tukkhum;
      return matchesQuery && matchesTukkhum;
    });
  }, [teips, query, tukkhum]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск тейпа или района"
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {tukkhums.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTukkhum(t)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                tukkhum === t
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить тейп
            </button>
          ) : null}
        </div>
      </div>

      {isSuperAdmin && adding ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground">Новый тейп</h3>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название тейпа"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <select
              value={newTukhumId}
              onChange={(e) => setNewTukhumId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary md:w-56"
            >
              <option value="">Без тукхума</option>
              {(tukhumOptions ?? []).map((tk) => (
                <option key={tk.id} value={String(tk.id)}>
                  {tk.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={3}
            placeholder="Описание (необязательно)"
            className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          {addError ? <p className="text-sm text-danger">{addError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={addSaving}
              onClick={() => void createTeip()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {addSaving ? "Создаю…" : "Создать"}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
      ) : error ? (
        <p className="py-12 text-center text-danger">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <article
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(t);
                  }
                }}
                className="group flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-2xl font-bold text-foreground">
                    {t.name}
                  </h3>
                  {t.tukhum_name ? (
                    <span className="shrink-0 rounded-full border border-primary/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {t.tukhum_name}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t.description ?? "Описание появится позже."}
                </p>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {t.tukhum_name
                      ? `Тукхум ${t.tukhum_name}`
                      : "Место основания на карте"}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              Тейпы по заданным условиям не найдены.
            </p>
          ) : null}
        </>
      )}

      {mounted && selected
        ? (() => {
            const current = teips.find((t) => t.id === selected.id) ?? selected;
            return (
              <TeipMapModal
                teip={current}
                canEdit={isSuperAdmin}
                onClose={() => setSelected(null)}
                onSaved={(updated) =>
                  setTeips((prev) =>
                    prev.map((t) =>
                      t.id === updated.id ? { ...t, ...updated } : t,
                    ),
                  )
                }
                onDeleted={(id) => {
                  setTeips((prev) => prev.filter((t) => t.id !== id));
                  setSelected(null);
                }}
              />
            );
          })()
        : null}
    </div>
  );
}
