'use client'

import { useEffect, useState } from 'react'
import { PageShell } from '@/components/PageShell/PageShell'
import { RelationsView } from '@/components/RelationsView/RelationsView'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

type State = 'loading' | 'guest' | 'empty' | 'ready'

export default function RelativesPage() {
  const { user, ready } = useAuth()
  const [rootId, setRootId] = useState<number | null>(null)
  const [rootName, setRootName] = useState('Вы')
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    if (!ready) return
    if (!user) {
      setState('guest')
      return
    }
    setRootName(user.display_name)
    setState('loading')
    api.auth
      .profile()
      .then((p) => {
        if (p.root_person_id) {
          setRootId(p.root_person_id)
          setState('ready')
        } else {
          setState('empty')
        }
      })
      .catch(() => setState('empty'))
  }, [ready, user])

  return (
    <PageShell
      eyebrow="Гергарло · Степени родства"
      title="Родство"
      description="Кем приходятся вам люди из вашего древа. Степени отсчитываются от вас как от точки отсчёта."
    >
      {state === 'loading' ? (
        <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
      ) : state === 'guest' ? (
        <p className="py-12 text-center text-muted-foreground">
          Войдите, чтобы увидеть степени родства.{' '}
          <a href="/login" className="text-primary hover:underline">
            Войти
          </a>
        </p>
      ) : state === 'empty' ? (
        <p className="py-12 text-center text-muted-foreground">
          Сначала добавьте людей в своё древо.{' '}
          <a href="/persons/new" className="text-primary hover:underline">
            Добавить человека
          </a>
        </p>
      ) : rootId != null ? (
        <RelationsView rootId={rootId} rootName={rootName} />
      ) : null}
    </PageShell>
  )
}
