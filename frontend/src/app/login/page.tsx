"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { AppFrame } from "@/components/AppFrame/AppFrame";
import {
  BTN_PRIMARY,
  CARD,
  FIELD,
  FORM_GRID,
  INPUT,
  LABEL,
  TABS,
  tabBtn,
} from "@/lib/ui";

type Tab = "login" | "register";

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
  if (typeof window === "undefined") return "/";
  return new URLSearchParams(window.location.search).get("next") ?? "/";
}

export default function LoginPage() {
  return (
    <AppFrame>
      <LoginPageInner />
    </AppFrame>
  );
}

function LoginPageInner() {
  const [tab, setTab] = useState<Tab>("login");

  // Поля входа
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  // Доп. поля регистрации
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cloudflare Turnstile (проверка на бота). Site key берём с backend в рантайме —
  // проверку можно включить/выключить без пересборки фронтенда.
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [captchaState, setCaptchaState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
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
    const SCRIPT =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    setCaptchaState("loading");

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current) return;
      if (
        !window.turnstile ||
        typeof window.turnstile.render !== "function" ||
        !widgetRef.current
      ) {
        return;
      }
      try {
        widgetIdRef.current = window.turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
        setCaptchaState("ready");
      } catch {
        setCaptchaState("error");
      }
    };

    // Гарантируем наличие скрипта (не важно, с какими параметрами).
    if (
      !window.turnstile &&
      !document.querySelector(
        'script[src^="https://challenges.cloudflare.com/turnstile"]',
      )
    ) {
      const s = document.createElement("script");
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
          if (!cancelled) setCaptchaState("error");
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

    // Клиентская валидация — мгновенная подсказка до обращения к серверу.
    if (!login.trim()) {
      setError("Введите телефон или e-mail.");
      return;
    }
    if (tab === "register") {
      if (displayName.trim().length < 2) {
        setError("Введите имя — минимум 2 символа.");
        return;
      }
      if (password.length < 8) {
        setError("Пароль должен быть не короче 8 символов.");
        return;
      }
      if (!agreed) {
        setError(
          "Чтобы зарегистрироваться, примите условия соглашения и политику конфиденциальности.",
        );
        return;
      }
    } else if (!password) {
      setError("Введите пароль.");
      return;
    }

    if (siteKey && !token) {
      setError("Подтвердите, что вы не робот.");
      return;
    }
    setBusy(true);
    try {
      if (tab === "login") {
        const result = await api.auth.login(
          login.trim(),
          password,
          token ?? undefined,
        );
        saveAuth(result);
      } else {
        const isEmail = login.includes("@");
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
      setError(e instanceof Error ? e.message : "Ошибка");
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-md gap-6">
      <PageHeader
        eyebrow="Вход · Регистрация"
        title="Личный кабинет"
        description="Войдите или создайте аккаунт, чтобы вести своё родовое древо."
      />
      <div className={CARD}>
        <div className={TABS}>
          <button
            className={tabBtn(tab === "login")}
            onClick={() => setTab("login")}
          >
            Вход
          </button>
          <button
            className={tabBtn(tab === "register")}
            onClick={() => setTab("register")}
          >
            Регистрация
          </button>
        </div>

        <form className={FORM_GRID} onSubmit={submit}>
          {tab === "register" && (
            <div className={FIELD}>
              <label className={LABEL}>Имя</label>
              <input
                className={INPUT}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Как вас называть"
              />
            </div>
          )}

          <div className={FIELD}>
            <label className={LABEL}>
              {tab === "login"
                ? "Телефон или e-mail"
                : "Телефон или e-mail (логин)"}
            </label>
            <input
              className={INPUT}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="+7… или mail@example.com"
            />
          </div>

          {tab === "register" && !login.includes("@") && (
            <div className={FIELD}>
              <label className={LABEL}>E-mail (необязательно)</label>
              <input
                className={INPUT}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
              />
            </div>
          )}

          <div className={FIELD}>
            <label className={LABEL}>Пароль</label>
            <input
              className={INPUT}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === "register" ? "минимум 8 символов" : ""}
            />
          </div>

          {/* Виджет проверки на бота — появляется, только если включён на сервере */}
          <div ref={widgetRef} />
          {siteKey && captchaState === "loading" && (
            <p className="m-0 text-sm text-muted-foreground">
              Загрузка проверки…
            </p>
          )}
          {siteKey && captchaState === "error" && (
            <p className="m-0 text-sm text-[#f0a0a0]">
              Не удалось загрузить проверку. Обновите страницу (Ctrl+Shift+R).
            </p>
          )}

          {/* Согласие с документами — обязательно для регистрации (152-ФЗ) */}
          {tab === "register" && (
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#c9a227]"
              />
              <span>
                Принимаю{" "}
                <a
                  href="/terms"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  пользовательское соглашение
                </a>{" "}
                и даю согласие на обработку персональных данных в соответствии с{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  политикой конфиденциальности
                </a>
                .
              </span>
            </label>
          )}

          {error && <p className="m-0 text-[#f0a0a0]">{error}</p>}

          <button
            type="submit"
            className={BTN_PRIMARY}
            disabled={busy || (tab === "register" && !agreed)}
          >
            {busy ? "…" : tab === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}
