'use client';

import { useEffect, useState } from 'react';
import type { AuthResult, User } from './types';

const TOKEN_KEY = 'teptar_token';
const USER_KEY = 'teptar_user';

/** Имя кастомного события, чтобы компоненты узнавали о смене сессии. */
const AUTH_EVENT = 'teptar:auth';

/** Сохранить токен и пользователя после входа/регистрации. */
export function saveAuth(result: AuthResult): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, result.token);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Выйти: очистить сессию. */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Токен из хранилища (для прямых запросов). */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Текущий пользователь из хранилища (без обращения к серверу). */
export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/** Обновить сохранённого пользователя (например, после редактирования профиля). */
export function patchStoredUser(patch: Partial<User>): void {
  if (typeof window === 'undefined') return;
  const current = getStoredUser();
  if (!current) return;
  const next = { ...current, ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Может ли роль создавать записи сразу подтверждёнными. */
export function canModerate(role: User['role'] | undefined): boolean {
  return role === 'teip_admin' || role === 'super_admin';
}

/**
 * Реактивный хук текущей сессии.
 * Подписывается на изменения localStorage и кастомное событие,
 * чтобы шапка и кнопки обновлялись сразу после входа/выхода.
 */
export function useAuth(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(getStoredUser());
      setReady(true);
    };
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { user, ready };
}
