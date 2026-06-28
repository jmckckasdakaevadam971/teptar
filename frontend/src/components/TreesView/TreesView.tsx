'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Users, MapPin, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import type { PublicTree, Teip, Village } from '@/lib/types'

function yearRange(t: PublicTree): string {
  if (t.min_year == null && t.max_year == null) return 'Годы не указаны'
  const a = t.min_year != null ? String(t.min_year) : '…'
  const b = t.max_year != null ? String(t.max_year) : '…'
  return `${a}–${b}`
}

export function TreesView() {
  const [trees, setTrees] = useState<PublicTree[]>([])
  const [teips, setTeips] = useState<Teip[]>([])
  const [villages, setVillages] = useState<Village[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [teipId, setTeipId] = useState<number | ''>('')
  const [villageId, setVillageId] = useState<number | ''>('')

  // Справочники для фильтров — один раз.
  useEffect(() => {
    api.teips.list().then(setTeips).catch(() => undefined)
    api.villages.list().then(setVillages).catch(() => undefined)
  }, [])

  // Каталог древ — перезагрузка при смене фильтров (поиск с задержкой).
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true)
      setError(null)
      api.persons
        .publicTrees({
          q: query.trim() || undefined,
          teip_id: teipId || undefined,
          village_id: villageId || undefined,
        })
        .then(setTrees)
        .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, teipId, villageId])

  const teipsSorted = useMemo(
    () => [...teips].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [teips],
  )
  const villagesSorted = useMemo(
    () => [...villages].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [villages],
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Фильтры */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по фамилии или имени"
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <select
          value={teipId}
          onChange={(e) => setTeipId(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary md:max-w-[220px]"
        >
          <option value="">Все тейпы</option>
          {teipsSorted.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={villageId}
          onChange={(e) => setVillageId(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary md:max-w-[220px]"
        >
          <option value="">Все сёла и города</option>
          {villagesSorted.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
      ) : error ? (
        <p className="py-12 text-center text-[#f08a7a]">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {trees.map((t) => (
              <article
                key={t.owner_id}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-2xl font-bold text-foreground">
                    {t.root_person_name ?? t.owner_name}
                  </h3>
                  {t.teip_name ? (
                    <span className="shrink-0 rounded-full border border-primary/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {t.teip_name}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  Составитель: {t.owner_name}
                </p>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    {t.count} чел.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {yearRange(t)}
                  </span>
                </div>

                {t.root_person_id != null ? (
                  <a
                    href={`/person/${t.root_person_id}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-foreground"
                  >
                    Открыть древо
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>

          {trees.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              Древа по заданным условиям не найдены.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
