'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, clearAuth, patchStoredUser } from '@/lib/auth';
import { PublishControl } from '@/components/PublishControl/PublishControl';
import type { UserProfile, TreeStatus, UserRole } from '@/lib/types';

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
  const [tree, setTree] = useState<TreeStatus | null>(null);
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
      const [p, t] = await Promise.all([
        api.auth.profile(),
        api.persons.treeStatus().catch(() => null),
      ]);
      setProfile(p);
      setTree(t);
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

  if (!ready || loading) return <div className="card">Загрузка…</div>;

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1>Личный кабинет</h1>
        <p style={{ color: 'var(--muted)' }}>Войдите, чтобы увидеть свой профиль и древо.</p>
        <a className="btn-primary" href="/login">
          Войти
        </a>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="card">
        <h1>Личный кабинет</h1>
        <p className="vis-error">{error ?? 'Профиль недоступен.'}</p>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="profile-wrap">
      {/* Шапка профиля */}
      <div className="card profile-hero">
        <div className="profile-avatar">{initials(profile.display_name)}</div>
        <div className="profile-ident">
          <h1 className="profile-name">{profile.display_name}</h1>
          <div className="profile-tags">
            <span className="role-badge">{ROLE_LABELS[profile.role]}</span>
            <span className="profile-since">в проекте с {formatDate(profile.created_at)}</span>
          </div>
          <div className="profile-contacts">
            {profile.phone && <span>📞 {profile.phone}</span>}
            {profile.email && <span>✉️ {profile.email}</span>}
          </div>
        </div>
        <button
          type="button"
          className="link-btn profile-logout"
          onClick={() => {
            clearAuth();
            window.location.href = '/';
          }}
        >
          Выйти
        </button>
      </div>

      {profileMsg && <p className="vis-notice">{profileMsg}</p>}

      {/* Моё древо */}
      <div className="card">
        <div className="profile-section-head">
          <h2 className="profile-h2">Моё древо</h2>
          <div className="profile-quick">
            {profile.root_person_id && (
              <a className="btn-secondary" href={`/person/${profile.root_person_id}`}>
                Открыть древо
              </a>
            )}
            <a className="btn-primary" href="/persons/new">
              + Добавить человека
            </a>
          </div>
        </div>

        {tree && tree.total > 0 ? (
          <div className="profile-stats">
            <div className="pstat">
              <span className="pstat-num">{tree.total}</span>
              <span className="pstat-lbl">всего персон</span>
            </div>
            <div className="pstat">
              <span className="pstat-num">{tree.published}</span>
              <span className="pstat-lbl">в общей базе</span>
            </div>
            <div className="pstat">
              <span className="pstat-num">{tree.pending}</span>
              <span className="pstat-lbl">на модерации</span>
            </div>
            <div className="pstat">
              <span className="pstat-num">{tree.private}</span>
              <span className="pstat-lbl">только у меня</span>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Вы ещё не добавили ни одного человека. Начните строить своё древо —
            добавьте себя или старшего родственника.
          </p>
        )}
      </div>

      {/* Управление видимостью (готовый компонент) */}
      <PublishControl />

      {/* Данные профиля */}
      <div className="card">
        <div className="profile-section-head">
          <h2 className="profile-h2">Данные профиля</h2>
          {!editing && (
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              Редактировать
            </button>
          )}
        </div>

        {profileErr && <p className="vis-error">{profileErr}</p>}

        {editing ? (
          <div className="profile-form">
            <label className="field">
              <span className="field-label">Имя</span>
              <input
                className="input"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Как вас зовут"
              />
            </label>
            <label className="field">
              <span className="field-label">Телефон</span>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7…"
              />
            </label>
            <label className="field">
              <span className="field-label">E-mail</span>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.ru"
              />
            </label>
            <div className="profile-form-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void saveProfile()}
                disabled={savingProfile || form.display_name.trim().length < 2}
              >
                {savingProfile ? 'Сохраняю…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="btn-secondary"
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
          <dl className="profile-info">
            <div>
              <dt>Имя</dt>
              <dd>{profile.display_name}</dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>{profile.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{profile.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Роль</dt>
              <dd>{ROLE_LABELS[profile.role]}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Безопасность */}
      <div className="card">
        <div className="profile-section-head">
          <h2 className="profile-h2">Безопасность</h2>
          {!pwOpen && (
            <button type="button" className="btn-secondary" onClick={() => setPwOpen(true)}>
              Сменить пароль
            </button>
          )}
        </div>

        {pwMsg && <p className="vis-notice">{pwMsg}</p>}
        {pwErr && <p className="vis-error">{pwErr}</p>}

        {pwOpen && (
          <div className="profile-form">
            <label className="field">
              <span className="field-label">Текущий пароль</span>
              <input
                className="input"
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              <span className="field-label">Новый пароль</span>
              <input
                className="input"
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                autoComplete="new-password"
                placeholder="не короче 8 символов"
              />
            </label>
            <label className="field">
              <span className="field-label">Повторите новый</span>
              <input
                className="input"
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <div className="profile-form-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void savePassword()}
                disabled={savingPw || !pw.current || !pw.next}
              >
                {savingPw ? 'Сохраняю…' : 'Обновить пароль'}
              </button>
              <button
                type="button"
                className="btn-secondary"
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
