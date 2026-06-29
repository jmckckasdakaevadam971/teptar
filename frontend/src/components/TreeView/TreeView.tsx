'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, MapPin, Calendar, Users } from 'lucide-react'
import { api } from '@/lib/api'
import type { TreeNode, Family, RelativeKind } from '@/lib/types'
import { cn } from '@/lib/utils'

type Line = { x1: number; y1: number; x2: number; y2: number }

function lifespan(n: { birth_year: number | null; death_year: number | null }) {
  const b = n.birth_year != null ? String(n.birth_year) : '—'
  return n.death_year != null ? `${b}–${n.death_year}` : b
}

export function TreeView({
  rootId,
  direction = 'down',
  buildable = false,
  reloadToken = 0,
  onChanged,
}: {
  rootId: number
  direction?: 'down' | 'up'
  /** Режим построения: в панели узла показываются кнопки добавления родни. */
  buildable?: boolean
  /** Внешний триггер перезагрузки древа (меняется родителем после правок). */
  reloadToken?: number
  /** Вызывается после добавления родственника (родитель обновляет корень). */
  onChanged?: () => void
}) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teipNames, setTeipNames] = useState<Record<number, string>>({})

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Family | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  // загрузка древа и справочника тейпов
  useEffect(() => {
    setLoading(true)
    setError(null)
    const fetchTree =
      direction === 'up' ? api.tree.ancestors : api.tree.descendants
    fetchTree(rootId)
      .then(setNodes)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка загрузки древа'),
      )
      .finally(() => setLoading(false))
  }, [rootId, direction, reloadToken])

  useEffect(() => {
    api.teips
      .list()
      .then((list) =>
        setTeipNames(Object.fromEntries(list.map((t) => [t.id, t.name]))),
      )
      .catch(() => {})
  }, [])

  const selected = nodes.find((p) => p.id === selectedId) ?? null

  // подгрузка деталей выбранного узла
  useEffect(() => {
    if (selectedId == null) {
      setDetail(null)
      return
    }
    let cancelled = false
    api.persons
      .family(selectedId)
      .then((f) => {
        if (!cancelled) setDetail(f)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // родитель узла в пределах загруженного набора
  const parentOf = useCallback(
    (n: TreeNode): number | null => {
      if (n.father_id != null && nodes.some((x) => x.id === n.father_id))
        return n.father_id
      if (n.mother_id != null && nodes.some((x) => x.id === n.mother_id))
        return n.mother_id
      return null
    },
    [nodes],
  )

  const generations = Array.from(new Set(nodes.map((p) => p.depth))).sort(
    (a, b) => a - b,
  )

  // координаты связей родитель → ребёнок
  const computeLines = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const box = container.getBoundingClientRect()
    setSize({ w: box.width, h: box.height })

    const next: Line[] = []
    for (const person of nodes) {
      const pid = parentOf(person)
      if (pid == null) continue
      const childEl = nodeRefs.current[person.id]
      const parentEl = nodeRefs.current[pid]
      if (!childEl || !parentEl) continue
      const c = childEl.getBoundingClientRect()
      const p = parentEl.getBoundingClientRect()
      next.push({
        x1: p.left - box.left + p.width / 2,
        y1: p.top - box.top + p.height,
        x2: c.left - box.left + c.width / 2,
        y2: c.top - box.top,
      })
    }
    setLines(next)
  }, [nodes, parentOf])

  useEffect(() => {
    computeLines()
    const ro = new ResizeObserver(() => computeLines())
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', computeLines)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', computeLines)
    }
  }, [computeLines])

  // подсветка предков выбранного узла
  const ancestorIds = new Set<number>()
  if (selected) {
    let cur: TreeNode | undefined = selected
    while (cur) {
      const pid = parentOf(cur)
      if (pid == null) break
      ancestorIds.add(pid)
      cur = nodes.find((p) => p.id === pid)
    }
  }

  if (loading)
    return (
      <p className="py-12 text-center text-muted-foreground">Загрузка древа…</p>
    )
  if (error)
    return <p className="py-12 text-center text-[#f08a7a]">{error}</p>
  if (!nodes.length)
    return (
      <p className="py-12 text-center text-muted-foreground">
        В древе пока нет записей.
      </p>
    )

  const detailPerson = detail?.person ?? null
  const spouseName = detail?.spouses?.[0]?.full_name ?? null
  const teipName =
    detailPerson?.teip_id != null ? teipNames[detailPerson.teip_id] : undefined

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-4">
        <div ref={containerRef} className="relative mx-auto min-w-[680px]">
          {/* SVG связи */}
          <svg
            className="pointer-events-none absolute inset-0 z-0"
            width={size.w}
            height={size.h}
            aria-hidden="true"
          >
            {lines.map((l, i) => {
              const midY = (l.y1 + l.y2) / 2
              return (
                <path
                  key={i}
                  d={`M ${l.x1} ${l.y1} C ${l.x1} ${midY}, ${l.x2} ${midY}, ${l.x2} ${l.y2}`}
                  fill="none"
                  stroke="rgb(var(--border))"
                  strokeWidth={1.5}
                />
              )
            })}
          </svg>

          {/* поколения */}
          <div className="relative z-10 flex flex-col gap-16">
            {generations.map((gen) => {
              const people = nodes.filter((p) => p.depth === gen)
              return (
                <div
                  key={gen}
                  className="flex items-stretch justify-center gap-6"
                >
                  {people.map((person) => {
                    const isSelected = person.id === selectedId
                    const isAncestor = ancestorIds.has(person.id)
                    const isLiving = person.death_year == null
                    return (
                      <button
                        key={person.id}
                        ref={(el) => {
                          nodeRefs.current[person.id] = el
                        }}
                        type="button"
                        onClick={() => setSelectedId(person.id)}
                        className={cn(
                          'group w-44 rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                          isSelected
                            ? 'border-primary shadow-[0_0_0_1px_rgb(var(--primary))]'
                            : isAncestor
                              ? 'border-primary/50'
                              : 'border-border hover:border-primary/40',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-lg font-bold',
                              isSelected || isAncestor
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-primary',
                            )}
                          >
                            {person.full_name.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-serif text-base font-semibold text-foreground">
                              {person.full_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {lifespan(person)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {person.gender === 'f' ? 'Женщина' : 'Мужчина'}
                          </span>
                          {isLiving ? (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                              жив
                            </span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Панель деталей */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Закрыть"
            className="flex-1 bg-background/70 backdrop-blur-sm"
            onClick={() => setSelectedId(null)}
          />
          <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6 md:p-8">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>

            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-serif text-2xl font-bold text-primary-foreground">
              {selected.full_name.charAt(0)}
            </span>
            <h2 className="mt-4 font-serif text-3xl font-bold text-foreground">
              {selected.full_name}
            </h2>
            <p className="mt-1 text-muted-foreground">
              {selected.gender === 'f' ? 'Женщина' : 'Мужчина'}
            </p>

            <dl className="mt-6 flex flex-col gap-4">
              <DetailRow
                icon={<Calendar className="h-4 w-4 text-primary" />}
                label="Годы жизни"
                value={lifespan(selected)}
              />
              {teipName ? (
                <DetailRow
                  icon={<Users className="h-4 w-4 text-primary" />}
                  label="Тейп"
                  value={teipName}
                />
              ) : null}
              {spouseName ? (
                <DetailRow
                  icon={<Users className="h-4 w-4 text-primary" />}
                  label="Супруг(а)"
                  value={spouseName}
                />
              ) : null}
              <DetailRow
                icon={<MapPin className="h-4 w-4 text-primary" />}
                label="Поколение"
                value={`${selected.depth + 1}-е от корня`}
              />
            </dl>

            {detailPerson?.note ? (
              <div className="mt-6 rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {detailPerson.note}
                </p>
              </div>
            ) : null}

            {buildable ? (
              <RelativeQuickAdd
                anchorId={selected.id}
                anchorName={selected.full_name}
                onAdded={() => {
                  setSelectedId(null)
                  onChanged?.()
                }}
              />
            ) : null}

            <a
              href={`/person/${selected.id}`}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Открыть карточку
            </a>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
        {icon}
      </span>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

const RELATIVE_KINDS: { kind: RelativeKind; label: string; icon: string }[] = [
  { kind: 'father', label: 'Отец', icon: '👨' },
  { kind: 'mother', label: 'Мать', icon: '👩' },
  { kind: 'brother', label: 'Брат', icon: '🧑' },
  { kind: 'sister', label: 'Сестра', icon: '👧' },
  { kind: 'son', label: 'Сын', icon: '👦' },
  { kind: 'daughter', label: 'Дочь', icon: '👧' },
]

/**
 * Быстрое добавление родственника к выбранному узлу прямо в панели древа.
 * Кнопка типа связи → мини-форма (ФИО + годы) → создание с привязкой.
 */
function RelativeQuickAdd({
  anchorId,
  anchorName,
  onAdded,
}: {
  anchorId: number
  anchorName: string
  onAdded: () => void
}) {
  const [kind, setKind] = useState<RelativeKind | null>(null)
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [death, setDeath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setKind(null)
    setName('')
    setBirth('')
    setDeath('')
    setError(null)
  }

  async function submit() {
    if (!kind) return
    const full_name = name.trim()
    if (full_name.length < 2) {
      setError('Укажите имя (минимум 2 символа).')
      return
    }
    const by = birth ? Number(birth) : null
    const dy = death ? Number(death) : null
    if (by !== null && dy !== null && dy < by) {
      setError('Год смерти не может быть раньше года рождения.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.persons.addRelative(anchorId, {
        kind,
        full_name,
        birth_year: by,
        death_year: dy,
      })
      reset()
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить родственника')
    } finally {
      setBusy(false)
    }
  }

  const activeLabel = RELATIVE_KINDS.find((o) => o.kind === kind)?.label ?? ''

  return (
    <div className="mt-6 rounded-2xl border border-primary/30 bg-secondary/30 p-4">
      <p className="m-0 text-xs uppercase tracking-wide text-muted-foreground">
        Добавить родственника
      </p>
      <p className="mb-3 mt-0.5 font-serif text-sm font-semibold text-foreground">
        к: {anchorName}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {RELATIVE_KINDS.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => {
              setKind(o.kind)
              setName('')
              setBirth('')
              setDeath('')
              setError(null)
            }}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors',
              kind === o.kind
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-card text-foreground hover:border-primary/40',
            )}
          >
            <span className="text-lg leading-none">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>

      {kind ? (
        <div className="mt-3 grid gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Имя (${activeLabel.toLowerCase()})`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              placeholder="г.р."
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              type="number"
              value={death}
              onChange={(e) => setDeath(e.target.value)}
              placeholder="г.с."
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {error ? <p className="m-0 text-sm text-[#f08a7a]">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || name.trim().length < 2}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Добавляю…' : `Добавить: ${activeLabel}`}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Выберите, кого добавить к этому человеку.
        </p>
      )}
    </div>
  )
}
