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

  // Доп. поля регистрации: ФИО — тремя отдельными полями.
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [agreed, setAgreed] = useState(false);

  // Тейп и населённый пункт — обязательны при регистрации: пользователь
  // сразу прикрепляется к модераторам своего тейпа. Вводятся текстом
  // с автоподсказками из справочников.
  const [teipId, setTeipId] = useState("");
  const [teipQuery, setTeipQuery] = useState("");
  const [villageId, setVillageId] = useState("");
  const [villageQuery, setVillageQuery] = useState("");
  const [teips, setTeips] = useState<Teip[] | null>(null);
  const [villages, setVillages] = useState<Village[] | null>(null);
  const [dictsError, setDictsError] = useState(false);

  /** Полное ФИО из трёх полей (отчество может отсутствовать). */
  const fullName = () =>
    [lastName, firstName, middleName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

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
      if (!lastName.trim()) {
        setError("Введите фамилию.");
        return;
      }
      if (!firstName.trim()) {
        setError("Введите имя.");
        return;
      }
      // Если пользователь ввёл название, но не кликнул подсказку —
      // принимаем точное совпадение по справочнику.
      if (!teipId) {
        const exact = (teips ?? []).find(
          (t) => normalize(t.name) === normalize(teipQuery),
        );
        if (exact) setTeipId(String(exact.id));
        else {
          setError("Выберите тейп из списка подсказок.");
          return;
        }
      }
      if (!villageId) {
        const exact = (villages ?? []).find(
          (v) => normalize(v.name) === normalize(villageQuery),
        );
        if (exact) setVillageId(String(exact.id));
        else {
          setError("Выберите населённый пункт из списка подсказок.");
          return;
        }
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

    // Итоговые id (state мог обновиться только что — берём с фолбэком).
    const teipIdFinal =
      teipId ||
      String(
        (teips ?? []).find((t) => normalize(t.name) === normalize(teipQuery))
          ?.id ?? "",
      );
    const villageIdFinal =
      villageId ||
      String(
        (villages ?? []).find(
          (v) => normalize(v.name) === normalize(villageQuery),
        )?.id ?? "",
      );

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
          display_name: fullName(),
          password,
          email: login.trim(),
          teip_id: Number(teipIdFinal),
          village_id: Number(villageIdFinal),
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
        display_name: fullName(),
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
                    <label className={LABEL}>Фамилия</label>
                    <input
                      className={INPUT}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Имя</label>
                    <input
                      className={INPUT}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Отчество</label>
                    <input
                      className={INPUT}
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      autoComplete="additional-name"
                    />
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Тейп</label>
                    <SuggestInput
                      value={teipQuery}
                      loading={!teips && !dictsError}
                      options={(teips ?? []).map((t) => ({
                        id: t.id,
                        name: t.name,
                        note: t.tukhum_name ?? null,
                      }))}
                      onText={(v) => {
                        setTeipQuery(v);
                        setTeipId("");
                      }}
                      onPick={(o) => {
                        setTeipQuery(o.name);
                        setTeipId(String(o.id));
                      }}
                    />
                    <p className="m-0 text-xs text-muted-foreground">
                      Начните вводить название и выберите из подсказок. Вы
                      будете прикреплены к модераторам своего тейпа.
                    </p>
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL}>Населённый пункт</label>
                    <SuggestInput
                      value={villageQuery}
                      loading={!villages && !dictsError}
                      options={(villages ?? []).map((v) => ({
                        id: v.id,
                        name: v.name,
                        note: v.district,
                      }))}
                      onText={(v) => {
                        setVillageQuery(v);
                        setVillageId("");
                      }}
                      onPick={(o) => {
                        setVillageQuery(o.name);
                        setVillageId(String(o.id));
                      }}
                    />
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

/**
 * Нормализация текста для поиска по справочникам: нижний регистр,
 * чеченская «палочка» и похожие символы (Ӏ, латинские I/l, «!», «|»)
 * приводятся к цифре 1 — как в базе («Г1ой», «Х1инда» и т.п.).
 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[ӏіil|!]/g, "1");
}

interface SuggestOption {
  id: number;
  name: string;
  note: string | null;
}

/**
 * Текстовое поле с выпадающими подсказками из справочника.
 * Фильтрует по вхождению (название и примечание), показывает до 8 вариантов.
 */
function SuggestInput({
  value,
  options,
  loading,
  onText,
  onPick,
}: {
  value: string;
  options: SuggestOption[];
  loading: boolean;
  onText: (v: string) => void;
  onPick: (o: SuggestOption) => void;
}) {
  const [open, setOpen] = useState(false);

  const q = normalize(value);
  // Приоритет: название начинается с запроса → название содержит →
  // примечание (тухум/район) содержит. Внутри группы порядок справочника.
  const matches = (
    q
      ? options
          .map((o) => {
            const n = normalize(o.name);
            const score = n.startsWith(q)
              ? 0
              : n.includes(q)
                ? 1
                : o.note && normalize(o.note).includes(q)
                  ? 2
                  : -1;
            return { o, score };
          })
          .filter((x) => x.score >= 0)
          .sort((a, b) => a.score - b.score)
          .map((x) => x.o)
      : options
  ).slice(0, 8);

  return (
    <div className="relative">
      <input
        className={INPUT}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {loading ? (
            <p className="m-0 px-4 py-2.5 text-sm text-muted-foreground">
              Загрузка справочника…
            </p>
          ) : matches.length === 0 ? (
            <p className="m-0 px-4 py-2.5 text-sm text-muted-foreground">
              Ничего не найдено. Проверьте написание.
            </p>
          ) : (
            <ul className="m-0 max-h-56 list-none overflow-y-auto p-0">
              {matches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-secondary/60"
                    /* onMouseDown, чтобы клик сработал раньше blur поля */
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onPick(o);
                      setOpen(false);
                    }}
                  >
                    {o.name}
                    {o.note && (
                      <span className="text-muted-foreground"> — {o.note}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
