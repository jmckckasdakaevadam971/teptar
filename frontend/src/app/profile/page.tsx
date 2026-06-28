'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, clearAuth, patchStoredUser } from '@/lib/auth';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, ERR_TEXT, FIELD, INPUT, LABEL, OK_TEXT } from '@/lib/ui';
import type { UserProfile, UserRole } from '@/lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  viewer: 'Читатель',
  editor: 'Редактор',
  teip_admin: 'Админ тейпа',
  super_admin: 'Супер-админ',
};

/** Инициалы для аватара: первые буквы первых двух слов имени. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Редактирование данных профиля.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: '', phone: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // Смена пароля.
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api.auth.profile();
      setProfile(p);
      setForm({ display_name: p.display_name, phone: p.phone ?? '', email: p.email ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && user) void load();
    else if (ready) setLoading(false);
  }, [ready, user, load]);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const updated = await api.auth.updateProfile({
        display_name: form.display_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      setProfile(updated);
      patchStoredUser({
        display_name: updated.display_name,
        phone: updated.phone,
        email: updated.email,
      });
      setEditing(false);
      setProfileMsg('Данные сохранены.');
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setPwErr(null);
    setPwMsg(null);
    if (pw.next.length < 8) {
      setPwErr('Новый пароль не короче 8 символов.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwErr('Пароли не совпадают.');
      return;
    }
    setSavingPw(true);
    try {
      await api.auth.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwOpen(false);
      setPwMsg('Пароль изменён.');
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : 'Не удалось сменить пароль');
    } finally {
      setSavingPw(false);
    }
  }

  if (!ready || loading) return <div className={CARD}>Загрузка…</div>;

  if (!user) {
    return (
      <div className={`${CARD} text-center`}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Личный кабинет</h1>
        <p className="text-sand">Войдите, чтобы увидеть свой профиль и древо.</p>
        <a className={`${BTN_PRIMARY} mt-3`} href="/login">
          Войти
        </a>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={CARD}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Личный кабинет</h1>
        <p className={ERR_TEXT}>{error ?? 'Профиль недоступен.'}</p>
        <button type="button" className={`${BTN_SECONDARY} mt-3`} onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-[18px]">
      {/* Шапка профиля */}
      <div className={`${CARD} flex flex-wrap items-center gap-5`}>
        <div className="grid h-[76px] w-[76px] flex-shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-light to-gold text-[28px] font-bold text-stone-900 shadow-[0_6px_18px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)]">
          {initials(profile.display_name)}
        </div>
        <div className="min-w-[200px] flex-1">
          <h1 className="mb-1.5 mt-0 text-[26px] font-bold text-cream">{profile.display_name}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full border border-gold-soft bg-gold/15 px-2.5 py-0.5 text-xs text-gold-light">
              {ROLE_LABELS[profile.role]}
            </span>
            <span className="text-[13px] text-sand">в проекте с {formatDate(profile.created_at)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-cream">
            {profile.phone && <span>📞 {profile.phone}</span>}
            {profile.email && <span>✉️ {profile.email}</span>}
          </div>
        </div>
        <button
          type="button"
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] text-[#e08a7a] hover:underline"
          onClick={() => {
            clearAuth();
            window.location.href = '/';
          }}
        >
          Выйти
        </button>
      </div>

      {profileMsg && <p className={OK_TEXT}>{profileMsg}</p>}

      {/* Быстрый переход к древу */}
      <a
        className={`${CARD} flex items-center justify-between gap-4 no-underline transition hover:-translate-y-0.5 hover:border-gold-soft`}
        href="/my"
      >
        <div>
          <h2 className="m-0 text-xl font-semibold text-cream">🌳 Моё древо</h2>
          <p className="mt-1.5 text-sand">
            Стройте родословную, добавляйте родственников и управляйте видимостью.
          </p>
        </div>
        <span className="flex-shrink-0 text-[28px] text-gold-light">→</span>
      </a>

      {/* Данные профиля */}
      <div className={CARD}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold text-cream">Данные профиля</h2>
          {!editing && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)}>
              Редактировать
            </button>
          )}
        </div>

        {profileErr && <p className={ERR_TEXT}>{profileErr}</p>}

        {editing ? (
          <div className="grid max-w-[460px] gap-3.5">
            <label className={FIELD}>
              <span className={LABEL}>Имя</span>
              <input
                className={INPUT}
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Как вас зовут"
              />
            </label>
            <label className={FIELD}>
              <span className={LABEL}>Телефон</span>
              <input
                className={INPUT}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7…"
              />
            </label>
            <label className={FIELD}>
              <span className={LABEL}>E-mail</span>
              <input
                className={INPUT}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.ru"
              />
            </label>
            <div className="flex gap-2.5">
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => void saveProfile()}
                disabled={savingProfile || form.display_name.trim().length < 2}
              >
                {savingProfile ? 'Сохраняю…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setEditing(false);
                  setProfileErr(null);
                  setForm({
                    display_name: profile.display_name,
                    phone: profile.phone ?? '',
                    email: profile.email ?? '',
                  });
                }}
                disabled={savingProfile}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <dl className="m-0 grid gap-0">
            {[
              { dt: 'Имя', dd: profile.display_name },
              { dt: 'Телефон', dd: profile.phone ?? '—' },
              { dt: 'E-mail', dd: profile.email ?? '—' },
              { dt: 'Роль', dd: ROLE_LABELS[profile.role] },
            ].map((row) => (
              <div
                key={row.dt}
                className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
              >
                <dt className="text-sm text-sand">{row.dt}</dt>
                <dd className="m-0 font-semibold text-cream">{row.dd}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Безопасность */}
      <div className={CARD}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold text-cream">Безопасность</h2>
          {!pwOpen && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setPwOpen(true)}>
              Сменить пароль
            </button>
          )}
        </div>

        {pwMsg && <p className={OK_TEXT}>{pwMsg}</p>}
        {pwErr && <p className={ERR_TEXT}>{pwErr}</p>}

        {pwOpen && (
          <div className="grid max-w-[460px] gap-3.5">
            <label className={FIELD}>
              <span className={LABEL}>Текущий пароль</span>
              <input
                className={INPUT}
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                autoComplete="current-password"
              />
            </label>
            <label className={FIELD}>
              <span className={LABEL}>Новый пароль</span>
              <input
                className={INPUT}
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                autoComplete="new-password"
                placeholder="не короче 8 символов"
              />
            </label>
            <label className={FIELD}>
              <span className={LABEL}>Повторите новый</span>
              <input
                className={INPUT}
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <div className="flex gap-2.5">
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => void savePassword()}
                disabled={savingPw || !pw.current || !pw.next}
              >
                {savingPw ? 'Сохраняю…' : 'Обновить пароль'}
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setPwOpen(false);
                  setPwErr(null);
                  setPw({ current: '', next: '', confirm: '' });
                }}
                disabled={savingPw}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
