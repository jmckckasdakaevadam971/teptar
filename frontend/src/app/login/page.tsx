"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import type { Teip, Village } from "@/lib/types";
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
  const [agreed, setAgreed] = useState(false);

  // Тейп и населённый пункт — обязательны при регистрации: пользователь
  // сразу прикрепляется к модераторам своего тейпа.
  const [teipId, setTeipId] = useState("");
  const [villageId, setVillageId] = useState("");
  const [teips, setTeips] = useState<Teip[] | null>(null);
  const [villages, setVillages] = useState<Village[] | null>(null);
  const [dictsError, setDictsError] = useState(false);

  // Справочники грузим один раз при первом открытии вкладки «Регистрация».
  useEffect(() => {
    if (tab !== "register" || (teips && villages)) return;
    let cancelled = false;
    setDictsError(false);
    Promise.all([api.teips.list(), api.villages.list()])
      .then(([t, v]) => {
        if (cancelled) return;
        setTeips(t);
        setVillages(v);
      })
      .catch(() => {
        if (!cancelled) setDictsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, teips, villages]);

  // Шаг подтверждения почты: после отправки формы ждём код из письма.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0); // секунд до повторной отправки

  // Таймер обратного отсчёта для кнопки «Отправить ещё раз».
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

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
      setError(
        tab === "register" ? "Введите e-mail." : "Введите телефон или e-mail.",
      );
      return;
    }
    if (tab === "register") {
      if (!/^\S+@\S+\.\S+$/.test(login.trim())) {
        setError("Введите корректный e-mail — например, mail@example.com.");
        return;
      }
      if (displayName.trim().split(/\s+/).length < 2) {
        setError("Укажите полное ФИО — минимум фамилию и имя.");
        return;
      }
      if (!teipId) {
        setError("Выберите тейп.");
        return;
      }
      if (!villageId) {
        setError("Выберите населённый пункт.");
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
        // Регистрация — только по e-mail.
        const result = await api.auth.register({
          display_name: displayName.trim(),
          password,
          email: login.trim(),
          teip_id: Number(teipId),
          village_id: Number(villageId),
          turnstile_token: token ?? undefined,
        });
        // Если включено подтверждение почты — сервер вернёт pending,
        // показываем шаг ввода кода вместо входа.
        if ("pending" in result && result.pending) {
          setPendingEmail(result.email);
          setResendIn(60);
          setBusy(false);
          return;
        }
        saveAuth(result as { token: string; user: never });
      }
      window.location.href = nextUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  /** Шаг 2: отправка кода из письма. */
  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pendingEmail) return;
    if (code.trim().length < 4) {
      setError("Введите код из письма.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.auth.verifyEmail(pendingEmail, code.trim());
      saveAuth(result);
      window.location.href = nextUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  /** Повторная отправка кода. */
  async function resend() {
    if (!pendingEmail || resendIn > 0) return;
    setError(null);
    try {
      await api.auth.resendCode({
        display_name: displayName.trim(),
        email: pendingEmail,
        password,
        teip_id: Number(teipId),
        village_id: Number(villageId),
      });
      setResendIn(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
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
        {pendingEmail ? (
          /* Шаг 2: подтверждение почты кодом из письма */
          <form className={FORM_GRID} onSubmit={submitCode}>
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
              Мы отправили 6-значный код на{" "}
              <span className="text-foreground">{pendingEmail}</span>. Введите
              его, чтобы завершить регистрацию. Код действует 15 минут.
            </p>
            <div className={FIELD}>
              <label className={LABEL}>Код из письма</label>
              <input
                className={INPUT}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
              />
            </div>

            {error && <p className="m-0 text-danger">{error}</p>}

            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? "…" : "Подтвердить"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={resend}
                disabled={resendIn > 0}
                className="text-primary disabled:cursor-default disabled:text-muted-foreground"
              >
                {resendIn > 0
                  ? `Отправить ещё раз (${resendIn} с)`
                  : "Отправить код ещё раз"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingEmail(null);
                  setCode("");
                  setError(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                Изменить e-mail
              </button>
            </div>
          </form>
        ) : (
          <>
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
                <>
                  <div className={FIELD}>
                    <label className={LABEL}>Фамилия Имя Отчество</label>
                    <input
                      className={INPUT}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Например: Магомадов Ахмед Салманович"
                      autoComplete="name"
                    />
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Тейп</label>
                    <select
                      className={INPUT}
                      value={teipId}
                      onChange={(e) => setTeipId(e.target.value)}
                    >
                      <option value="">
                        {teips ? "Выберите тейп…" : "Загрузка…"}
                      </option>
                      {(teips ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.tukhum_name ? ` — ${t.tukhum_name}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="m-0 text-xs text-muted-foreground">
                      Вы будете прикреплены к модераторам своего тейпа.
                    </p>
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Населённый пункт</label>
                    <select
                      className={INPUT}
                      value={villageId}
                      onChange={(e) => setVillageId(e.target.value)}
                    >
                      <option value="">
                        {villages ? "Выберите населённый пункт…" : "Загрузка…"}
                      </option>
                      {(villages ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.district ? ` (${v.district})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {dictsError && (
                    <p className="m-0 text-sm text-danger">
                      Не удалось загрузить справочники тейпов и сёл. Обновите
                      страницу.
                    </p>
                  )}
                </>
              )}

              <div className={FIELD}>
                <label className={LABEL}>
                  {tab === "login" ? "Телефон или e-mail" : "E-mail"}
                </label>
                <input
                  className={INPUT}
                  type={tab === "register" ? "email" : "text"}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder={
                    tab === "register"
                      ? "mail@example.com"
                      : "+7… или mail@example.com"
                  }
                />
              </div>

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
                <p className="m-0 text-sm text-danger">
                  Не удалось загрузить проверку. Обновите страницу
                  (Ctrl+Shift+R).
                </p>
              )}

              {/* Согласие с документами — обязательно для регистрации (152-ФЗ) */}
              {tab === "register" && (
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
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
                    и даю согласие на обработку персональных данных в
                    соответствии с{" "}
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

              {error && <p className="m-0 text-danger">{error}</p>}

              <button
                type="submit"
                className={BTN_PRIMARY}
                disabled={busy || (tab === "register" && !agreed)}
              >
                {busy ? "…" : tab === "login" ? "Войти" : "Зарегистрироваться"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
