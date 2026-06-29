'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageShell } from '@/components/PageShell/PageShell'
import { TreeView } from '@/components/TreeView/TreeView'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import type { Gender } from '@/lib/types'

type State = 'loading' | 'guest' | 'empty' | 'ready'

export default function MyTreePage() {
  const { user, ready } = useAuth()
  const [rootId, setRootId] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<State>('loading')

  // Перечитать корень своего древа (корень мог «подняться» при добавлении предка).
  const refresh = useCallback(async () => {
    try {
      const p = await api.auth.profile()
      if (p.root_person_id) {
        setRootId(p.root_person_id)
        setState('ready')
      } else {
        setState('empty')
      }
    } catch {
      setState('empty')
    }
    setReloadToken((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!user) {
      setState('guest')
      return
    }
    setState('loading')
    void refresh()
  }, [ready, user, refresh])

  return (
    <PageShell
      eyebrow="Дезал · Родовое древо"
      title="Моё древо"
      description="Стройте древо прямо здесь: добавьте старшего предка, затем нажимайте на любого человека, чтобы добавить к нему отца, мать, сына, дочь, брата или сестру."
    >
      <div className="rounded-3xl border border-border bg-card/40 p-4 md:p-8">
        {state === 'loading' ? (
          <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
        ) : state === 'guest' ? (
          <p className="py-12 text-center text-muted-foreground">
            Войдите, чтобы строить своё древо.{' '}
            <a href="/login" className="text-primary hover:underline">
              Войти
            </a>
          </p>
        ) : state === 'empty' ? (
          <FirstAncestorForm onCreated={refresh} />
        ) : rootId != null ? (
          <TreeView
            rootId={rootId}
            direction="down"
            buildable
            reloadToken={reloadToken}
            onChanged={refresh}
          />
        ) : null}
      </div>
    </PageShell>
  )
}

/**
 * Первый шаг построения: создаём самого старшего известного предка —
 * он становится корнем древа. Дальше дерево растёт от него.
 */
function FirstAncestorForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('m')
  const [birth, setBirth] = useState('')
  const [death, setDeath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const full_name = name.trim()
    if (full_name.length < 2) {
      setError('Укажите ФИО предка (минимум 2 символа).')
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
      await api.persons.create({
        full_name,
        gender,
        birth_year: by,
        death_year: dy,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать предка')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="text-center">
        <span className="text-4xl">🌳</span>
        <h2 className="mt-3 font-serif text-2xl font-bold text-foreground">
          Начните своё древо
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Добавьте самого старшего известного предка — он станет корнем древа.
          Потом нажмёте на него и добавите детей, родителей, братьев и сестёр.
        </p>
      </div>

      <div className="mt-6 grid gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ФИО предка"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className={inputCls}
        />
        <div className="flex gap-2">
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            className={`${inputCls} flex-1`}
          >
            <option value="m">муж.</option>
            <option value="f">жен.</option>
          </select>
          <input
            type="number"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            placeholder="г.р."
            className={`${inputCls} w-28`}
          />
          <input
            type="number"
            value={death}
            onChange={(e) => setDeath(e.target.value)}
            placeholder="г.с."
            className={`${inputCls} w-28`}
          />
        </div>

        {error ? <p className="m-0 text-sm text-[#f08a7a]">{error}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || name.trim().length < 2}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Создаю…' : 'Создать корень древа'}
        </button>
      </div>
    </div>
  )
}
