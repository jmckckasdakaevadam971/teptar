"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TreePine, Users, MapPin, RotateCcw, GitMerge } from "lucide-react";
import { api } from "@/lib/api";
import type { PublicTree, TreeMerge, Teip, Village } from "@/lib/types";
import { CARD, FIELD, LABEL, ERR_TEXT } from "@/lib/ui";

const SELECT =
  "w-full cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors hover:border-primary focus:border-primary";

/** Диапазон лет древа в читаемом виде. */
function yearsLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}`;
  return String(min ?? max);
}

export function PublicTreesView() {
  const [teips, setTeips] = useState<Teip[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [teipId, setTeipId] = useState("");
  const [villageId, setVillageId] = useState("");

  const [trees, setTrees] = useState<PublicTree[]>([]);
  const [merges, setMerges] = useState<TreeMerge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Справочники для выпадающих списков.
  useEffect(() => {
    Promise.all([api.teips.list(), api.villages.list()])
      .then(([t, v]) => {
        setTeips(t);
        setVillages(v);
      })
      .catch(() => {
        /* справочники не критичны для показа списка */
      });
  }, []);

  // Общие (объединённые) древа — загружаются один раз.
  useEffect(() => {
    api.persons
      .publicMerges()
      .then(setMerges)
      .catch(() => {
        /* общие древа необязательны */
      });
  }, []);

  // Перезагрузка списка древ при смене фильтров.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.persons
      .publicTrees({
        teip_id: teipId ? Number(teipId) : undefined,
        village_id: villageId ? Number(villageId) : undefined,
      })
      .then((data) => {
        if (!cancelled) setTrees(data);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить древа",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teipId, villageId]);

  const hasFilters = teipId !== "" || villageId !== "";

  return (
    <div className="grid gap-8">
      {/* Фильтры */}
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className={FIELD}>
          <label className={LABEL} htmlFor="filter-teip">
            Тейп
          </label>
          <select
            id="filter-teip"
            className={SELECT}
            value={teipId}
            onChange={(e) => setTeipId(e.target.value)}
          >
            <option value="">Все тейпы</option>
            {teips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="filter-village">
            Поселение
          </label>
          <select
            id="filter-village"
            className={SELECT}
            value={villageId}
            onChange={(e) => setVillageId(e.target.value)}
          >
            <option value="">Все поселения</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.district ? ` · ${v.district}` : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setTeipId("");
            setVillageId("");
          }}
          disabled={!hasFilters}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Сбросить
        </button>
      </div>

      {/* Общие (объединённые) древа */}
      {merges.length > 0 && (
        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            <h2 className="m-0 font-serif text-lg font-bold text-foreground">
              Общие древа
            </h2>
            <span className="text-sm text-muted-foreground">
              объединены по общему предку
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {merges.map((m) => (
              <Link
                key={m.id}
                href={`/trees/merged/${m.id}`}
                className={`${CARD} flex flex-col gap-3 transition-colors hover:border-primary`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <GitMerge className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-serif text-lg font-bold text-foreground">
                      {m.merged_name}
                    </h3>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.branch_a.owner_name ?? "—"} +{" "}
                      {m.branch_b.owner_name ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    {m.total} чел.
                  </span>
                  {m.merged_birth_year != null ? (
                    <span className="rounded-lg border border-border bg-card px-2.5 py-1">
                      {m.merged_birth_year}
                      {m.merged_death_year != null
                        ? `–${m.merged_death_year}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Результаты */}
      {error ? (
        <p className={ERR_TEXT}>{error}</p>
      ) : loading ? (
        <p className="py-10 text-center text-muted-foreground">Загрузка…</p>
      ) : trees.length === 0 ? (
        <div className={`${CARD} text-center`}>
          <TreePine className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-serif text-lg font-semibold text-foreground">
            Одобренных древ не найдено
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Попробуйте изменить фильтры по тейпу или поселению."
              : "Пока ни одно древо не прошло модерацию."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Найдено древ: {trees.length}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trees.map((tree) => {
              const years = yearsLabel(tree.min_year, tree.max_year);
              const inner = (
                <>
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <TreePine className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-serif text-lg font-bold text-foreground">
                        {tree.root_person_name ?? tree.owner_name}
                      </h3>
                      <p className="truncate text-sm text-muted-foreground">
                        Хранитель: {tree.owner_name}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {tree.teip_name ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {tree.teip_name}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {tree.count} чел.
                    </span>
                    {years ? (
                      <span className="rounded-lg border border-border bg-card px-2.5 py-1">
                        {years}
                      </span>
                    ) : null}
                  </div>
                </>
              );

              const cardClass = `${CARD} flex flex-col gap-3`;

              return tree.root_person_id != null ? (
                <Link
                  key={tree.owner_id}
                  href={`/trees/${tree.root_person_id}`}
                  className={`${cardClass} transition-colors hover:border-primary`}
                >
                  {inner}
                </Link>
              ) : (
                <article key={tree.owner_id} className={cardClass}>
                  {inner}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
