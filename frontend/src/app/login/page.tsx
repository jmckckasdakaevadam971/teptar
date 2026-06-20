'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { saveAuth } from '@/lib/auth';

type Tab = 'login' | 'register';

/** Куда вернуться после входа (?next=…), по умолчанию на главную. */
function nextUrl(): string {
  if (typeof window === 'undefined') return '/';
  return new URLSearchParams(window.location.search).get('next') ?? '/';
}

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login');

  // Поля входа
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  // Доп. поля регистрации
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === 'login') {
        const result = await api.auth.login(login.trim(), password);
        saveAuth(result);
      } else {
        const isEmail = login.includes('@');
        const result = await api.auth.register({
          display_name: displayName.trim(),
          password,
          phone: isEmail ? undefined : login.trim(),
          email: isEmail ? login.trim() : email.trim() || undefined,
        });
        saveAuth(result);
      }
      window.location.href = nextUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="tabs">
        <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
          Вход
        </button>
        <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
          Регистрация
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {tab === 'register' && (
          <div className="field">
            <label>Имя</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как вас называть"
            />
          </div>
        )}

        <div className="field">
          <label>{tab === 'login' ? 'Телефон или e-mail' : 'Телефон или e-mail (логин)'}</label>
          <input
            className="input"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="+7… или mail@example.com"
          />
        </div>

        {tab === 'register' && !login.includes('@') && (
          <div className="field">
            <label>E-mail (необязательно)</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@example.com"
            />
          </div>
        )}

        <div className="field">
          <label>Пароль</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === 'register' ? 'минимум 8 символов' : ''}
          />
        </div>

        {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : tab === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>

      {tab === 'login' && (
        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 14 }}>
          Демо-админ: <b>+70000000000</b> / пароль <b>demo12345</b>
        </p>
      )}
    </div>
  );
}
