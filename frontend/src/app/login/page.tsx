'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { saveAuth } from '@/lib/auth';

type Tab = 'login' | 'register';

// Минимальный тип глобального объекта Turnstile (загружается скриптом Cloudflare).
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

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

  // Cloudflare Turnstile (проверка на бота). Site key берём с backend в рантайме —
  // проверку можно включить/выключить без пересборки фронтенда.
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [captchaState, setCaptchaState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // 1. Узнаём, включена ли проверка (есть ли site key).
  useEffect(() => {
    api.auth
      .config()
      .then((c) => setSiteKey(c.turnstile_site_key))
      .catch(() => setSiteKey(null));
  }, []);

  // 2. Загружаем скрипт Turnstile и рисуем виджет (устойчиво к таймингу).
  // window.turnstile определяется Cloudflare не строго к script.onload, поэтому
  // просто поллим готовность API и рисуем один раз.
  useEffect(() => {
    if (!siteKey) return;
    const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    setCaptchaState('loading');

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current) return;
      if (
        !window.turnstile ||
        typeof window.turnstile.render !== 'function' ||
        !widgetRef.current
      ) {
        return;
      }
      try {
        widgetIdRef.current = window.turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
        setCaptchaState('ready');
      } catch {
        setCaptchaState('error');
      }
    };

    // Гарантируем наличие скрипта (не важно, с какими параметрами).
    if (
      !window.turnstile &&
      !document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile"]')
    ) {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    // Поллинг готовности API до ~10 секунд.
    renderWidget();
    if (!widgetIdRef.current) {
      let tries = 0;
      timer = setInterval(() => {
        tries += 1;
        renderWidget();
        if (widgetIdRef.current) {
          if (timer) clearInterval(timer);
        } else if (tries > 50) {
          if (timer) clearInterval(timer);
          if (!cancelled) setCaptchaState('error');
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [siteKey]);

  // Токен одноразовый — после попытки сбрасываем виджет.
  const resetCaptcha = () => {
    setToken(null);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (siteKey && !token) {
      setError('Подтвердите, что вы не робот.');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') {
        const result = await api.auth.login(login.trim(), password, token ?? undefined);
        saveAuth(result);
      } else {
        const isEmail = login.includes('@');
        const result = await api.auth.register({
          display_name: displayName.trim(),
          password,
          phone: isEmail ? undefined : login.trim(),
          email: isEmail ? login.trim() : email.trim() || undefined,
          turnstile_token: token ?? undefined,
        });
        saveAuth(result);
      }
      window.location.href = nextUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      resetCaptcha();
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

        {/* Виджет проверки на бота — появляется, только если включён на сервере */}
        <div ref={widgetRef} />
        {siteKey && captchaState === 'loading' && (
          <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Загрузка проверки…</p>
        )}
        {siteKey && captchaState === 'error' && (
          <p style={{ color: '#dc2626', margin: 0, fontSize: 14 }}>
            Не удалось загрузить проверку. Обновите страницу (Ctrl+Shift+R).
          </p>
        )}

        {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : tab === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  );
}
