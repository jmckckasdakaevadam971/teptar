'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
} from 'lucide-react'
import { PageShell } from '@/components/PageShell/PageShell'
import { api } from '@/lib/api'
import { useAuth, clearAuth, patchStoredUser } from '@/lib/auth'
import type { UserProfile, UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  viewer: 'Читатель',
  editor: 'Редактор',
  teip_admin: 'Админ тейпа',
  super_admin: 'Супер-админ',
}

const INPUT =
  'w-full rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'
const BTN_PRIMARY =
  'rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60'
const BTN_SECONDARY =
  'rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? '?'
  const b = parts[1]?.[0] ?? ''
  return (a + b).toUpperCase()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default function ProfilePage() {
  const { user, ready } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', phone: '', email: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)

  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await api.auth.profile()
      setProfile(p)
      setForm({
        display_name: p.display_name,
        phone: p.phone ?? '',
        email: p.email ?? '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready && user) void load()
    else if (ready) setLoading(false)
  }, [ready, user, load])

  async function saveProfile() {
    setSavingProfile(true)
    setProfileErr(null)
    setProfileMsg(null)
    try {
      const updated = await api.auth.updateProfile({
        display_name: form.display_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      setProfile(updated)
      patchStoredUser({
        display_name: updated.display_name,
        phone: updated.phone,
        email: updated.email,
      })
      setEditing(false)
      setProfileMsg('Данные сохранены.')
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    setPwErr(null)
    setPwMsg(null)
    if (pw.next.length < 8) {
      setPwErr('Новый пароль не короче 8 символов.')
      return
    }
    if (pw.next !== pw.confirm) {
      setPwErr('Пароли не совпадают.')
      return
    }
    setSavingPw(true)
    try {
      await api.auth.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '', confirm: '' })
      setPwOpen(false)
      setPwMsg('Пароль изменён.')
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : 'Не удалось сменить пароль')
    } finally {
      setSavingPw(false)
    }
  }

  if (ready && !user) {
    return (
      <PageShell
        eyebrow="Профиль"
        title="Личный кабинет"
        description="Войдите, чтобы увидеть свой профиль."
      >
        <a href="/login" className={BTN_PRIMARY}>
          Войти
        </a>
      </PageShell>
    )
  }

  if (!ready || loading) {
    return (
      <PageShell eyebrow="Профиль" title="Профиль">
        <p className="py-12 text-center text-muted-foreground">Загрузка…</p>
      </PageShell>
    )
  }

  if (error || !profile) {
    return (
      <PageShell eyebrow="Профиль" title="Профиль">
        <p className="py-6 text-center text-[#f08a7a]">
          {error ?? 'Профиль недоступен.'}
        </p>
        <div className="text-center">
          <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
            Повторить
          </button>
        </div>
      </PageShell>
    )
  }

  const INFO = [
    { icon: Mail, label: 'Эл. почта', value: profile.email ?? '—' },
    { icon: Phone, label: 'Телефон', value: profile.phone ?? '—' },
    { icon: ShieldCheck, label: 'Роль', value: ROLE_LABELS[profile.role] },
    { icon: Calendar, label: 'С нами с', value: formatDate(profile.created_at) },
  ]

  return (
    <PageShell
      eyebrow="Профиль"
      title={profile.display_name}
      description="Здесь — сведения о вашей учётной записи и роде."
      actions={
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v)
            setProfileMsg(null)
            setProfileErr(null)
          }}
          className={BTN_SECONDARY}
        >
          {editing ? 'Отмена' : 'Редактировать'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Левая колонка — карточка пользователя */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center rounded-3xl border border-border bg-card p-8 text-center">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary font-serif text-4xl font-bold text-primary-foreground">
              {initials(profile.display_name)}
            </span>
            <h2 className="mt-4 font-serif text-2xl font-bold text-foreground">
              {profile.display_name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              в проекте с {formatDate(profile.created_at)}
            </p>
            <span className="mt-4 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              {ROLE_LABELS[profile.role]}
            </span>
            <button
              type="button"
              onClick={() => {
                clearAuth()
                window.location.href = '/'
              }}
              className="mt-5 text-xs text-[#e08a7a] transition-colors hover:underline"
            >
              Выйти из аккаунта
            </button>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6">
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Сведения
            </h3>
            <dl className="mt-4 flex flex-col gap-4">
              {INFO.map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                    <item.icon className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="font-medium text-foreground">{item.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Правая колонка */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Управление учётной записью */}
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Управление
            </h3>

            {profileMsg ? (
              <p className="mt-4 text-sm text-primary">{profileMsg}</p>
            ) : null}

            {editing ? (
              <div className="mt-6 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Имя
                  </label>
                  <input
                    className={INPUT}
                    value={form.display_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, display_name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Телефон
                  </label>
                  <input
                    className={INPUT}
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Эл. почта
                  </label>
                  <input
                    className={INPUT}
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                {profileErr ? (
                  <p className="text-sm text-[#f08a7a]">{profileErr}</p>
                ) : null}
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={savingProfile}
                    onClick={() => void saveProfile()}
                  >
                    {savingProfile ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    onClick={() => setEditing(false)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Измените свои данные или пароль.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-6">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setPwOpen((v) => !v)
                  setPwMsg(null)
                  setPwErr(null)
                }}
              >
                {pwOpen ? 'Скрыть смену пароля' : 'Сменить пароль'}
              </button>
            </div>

            {pwMsg ? <p className="mt-4 text-sm text-primary">{pwMsg}</p> : null}

            {pwOpen ? (
              <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Текущий пароль
                  </label>
                  <input
                    type="password"
                    className={INPUT}
                    value={pw.current}
                    onChange={(e) =>
                      setPw((s) => ({ ...s, current: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Новый пароль
                  </label>
                  <input
                    type="password"
                    className={INPUT}
                    value={pw.next}
                    onChange={(e) =>
                      setPw((s) => ({ ...s, next: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Повторите новый пароль
                  </label>
                  <input
                    type="password"
                    className={INPUT}
                    value={pw.confirm}
                    onChange={(e) =>
                      setPw((s) => ({ ...s, confirm: e.target.value }))
                    }
                  />
                </div>
                {pwErr ? (
                  <p className="text-sm text-[#f08a7a]">{pwErr}</p>
                ) : null}
                <div>
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={savingPw}
                    onClick={() => void savePassword()}
                  >
                    {savingPw ? 'Сохранение…' : 'Изменить пароль'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
