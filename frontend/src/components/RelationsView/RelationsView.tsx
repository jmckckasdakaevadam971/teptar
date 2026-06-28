'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, GitBranch } from 'lucide-react'
import { api } from '@/lib/api'
import type { TreeNode } from '@/lib/types'
import { cn } from '@/lib/utils'

const DEGREES = [
  'Все',
  '1-я степень',
  '2-я степень',
  '3-я степень',
  '4-я степень',
  '5-я степень',
  '6-я степень',
]

function relationLabel(depth: number, gender: 'm' | 'f'): string {
  const f = gender === 'f'
  switch (depth) {
    case 1:
      return f ? 'Мать' : 'Отец'
    case 2:
      return f ? 'Бабушка' : 'Дед'
    case 3:
      return f ? 'Прабабушка' : 'Прадед'
    case 4:
      return f ? 'Прапрабабушка' : 'Прапрадед'
    default:
      return `Предок ${depth}-го колена`
  }
}

function lifespan(n: { birth_year: number | null; death_year: number | null }) {
  const b = n.birth_year != null ? String(n.birth_year) : '—'
  return n.death_year != null ? `${b}–${n.death_year}` : b
}

export function RelationsView({
  rootId,
  rootName,
}: {
  rootId: number
  rootName: string
}) {
  const [ancestors, setAncestors] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [degree, setDegree] = useState('Все')

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.tree
      .ancestors(rootId)
      .then((list) => setAncestors(list.filter((n) => n.depth > 0)))
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка загрузки'),
      )
      .finally(() => setLoading(false))
  }, [rootId])

  const items = useMemo(
    () =>
      ancestors.map((a) => ({
        node: a,
        relation: relationLabel(a.depth, a.gender),
        degree: `${a.depth}-я степень`,
      })),
    [ancestors],
  )

  const filtered = useMemo(() => {
    return items.filter((r) => {
      const matchesQuery =
        r.node.full_name.toLowerCase().includes(query.toLowerCase()) ||
        r.relation.toLowerCase().includes(query.toLowerCase())
      const matchesDegree = degree === 'Все' || r.degree === degree
      return matchesQuery && matchesDegree
    })
  }, [items, query, degree])

  return (
    <div className="flex flex-col gap-8">
      {/* Текущий пользователь */}
      <div className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-card p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary font-serif text-xl font-bold text-primary-foreground">
          {rootName.charAt(0)}
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Точка отсчёта
          </p>
          <p className="font-serif text-lg font-semibold text-foreground">
            {rootName}
          </p>
        </div>
      </div>

      {/* Поиск и фильтр */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или родству"
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {DEGREES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDegree(d)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                degree === d
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
      ) : error ? (
        <p className="py-12 text-center text-[#f08a7a]">{error}</p>
      ) : (
        <>
          {/* Список */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filtered.map((r) => (
              <a
                key={r.node.id}
                href={`/person/${r.node.id}`}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-lg font-bold text-primary">
                  {r.node.full_name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-serif text-base font-semibold text-foreground">
                      {r.node.full_name}
                    </p>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {r.degree}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-primary">
                    <GitBranch className="h-3.5 w-3.5" />
                    {r.relation}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Годы жизни: {lifespan(r.node)}
                  </p>
                </div>
              </a>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              Ничего не найдено по заданным условиям.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
