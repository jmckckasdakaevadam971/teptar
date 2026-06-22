import type {
  ApiEnvelope,
  Person,
  TreeNode,
  Teip,
  Tukhum,
  Gar,
  Nekyi,
  Village,
  CommonAncestor,
  AuthResult,
  User,
  UserProfile,
  AdminUser,
  AdminStats,
  TreeStatus,
  PendingTree,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/** Низкоуровневый fetch с разбором конверта и токеном. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teptar_token') : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Ошибка запроса (${res.status})`);
  }
  return body.data;
}

/** Типизированный клиент API, сгруппированный по доменам. */
export const api = {
  persons: {
    search: (params: { q?: string; teip_id?: number; village_id?: number }) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.teip_id) qs.set('teip_id', String(params.teip_id));
      if (params.village_id) qs.set('village_id', String(params.village_id));
      return request<Person[]>(`/persons?${qs.toString()}`);
    },
    get: (id: number) => request<Person>(`/persons/${id}`),
    create: (input: Partial<Person>) =>
      request<Person>('/persons', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<Person>) =>
      request<Person>(`/persons/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

    /** Состояние своего древа (приватное / на модерации / опубликовано). */
    treeStatus: () => request<TreeStatus>('/persons/tree/status'),
    /** Отправить своё древо в общую базу. */
    publish: (mode: 'all' | 'hide_recent', cutoff_year = 1970) =>
      request<{ published: number; hidden: number }>('/persons/tree/publish', {
        method: 'POST',
        body: JSON.stringify({ mode, cutoff_year }),
      }),
    /** Скрыть древо обратно в личное. */
    unpublish: () =>
      request<{ count: number }>('/persons/tree/unpublish', { method: 'POST' }),
  },

  tree: {
    ancestors: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/up?depth=${depth}`),
    descendants: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/down?depth=${depth}`),
    commonAncestor: (a: number, b: number) =>
      request<CommonAncestor>(`/ancestors/common?a=${a}&b=${b}`),
  },

  teips: {
    list: () => request<Teip[]>('/teips'),
    gars: (id: number) => request<Gar[]>(`/teips/${id}/gars`),
  },

  tukhums: {
    list: () => request<Tukhum[]>('/tukhums'),
    teips: (id: number) => request<Teip[]>(`/tukhums/${id}/teips`),
  },

  gars: {
    nekyi: (id: number) => request<Nekyi[]>(`/gars/${id}/nekyi`),
  },

  villages: {
    list: (q?: string) => request<Village[]>(`/villages${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    create: (name: string, district?: string | null) =>
      request<Village>('/villages', {
        method: 'POST',
        body: JSON.stringify({ name, district: district ?? null }),
      }),
  },

  auth: {
    /** Публичная конфигурация (нужен ли виджет проверки на бота). */
    config: () => request<{ turnstile_site_key: string | null }>('/auth/config'),
    login: (login: string, password: string, turnstile_token?: string) =>
      request<AuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password, turnstile_token }),
      }),
    register: (input: {
      display_name: string;
      phone?: string;
      email?: string;
      password: string;
      turnstile_token?: string;
    }) =>
      request<AuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    me: () => request<{ user: User | null }>('/auth/me'),
    /** Полный профиль текущего пользователя. */
    profile: () => request<UserProfile>('/auth/profile'),
    /** Обновить имя / телефон / e-mail. */
    updateProfile: (input: { display_name: string; phone?: string | null; email?: string | null }) =>
      request<UserProfile>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    /** Сменить пароль. */
    changePassword: (current_password: string, new_password: string) =>
      request<{ changed: boolean }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  /** Администрирование (только super_admin). */
  admin: {
    stats: () => request<AdminStats>('/admin/stats'),
    users: () => request<AdminUser[]>('/admin/users'),
    setRole: (id: number, role: User['role']) =>
      request<{ id: number; role: string }>(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    deleteUser: (id: number) =>
      request<{ deleted: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
  },

  /** Модерация общей базы (teip_admin / super_admin). */
  moderation: {
    pending: () => request<PendingTree[]>('/persons/moderation/pending'),
    persons: (ownerId: number) =>
      request<Person[]>(`/persons/moderation/${ownerId}/persons`),
    approve: (ownerId: number) =>
      request<{ count: number }>(`/persons/moderation/${ownerId}/approve`, { method: 'POST' }),
    reject: (ownerId: number) =>
      request<{ count: number }>(`/persons/moderation/${ownerId}/reject`, { method: 'POST' }),
  },

  /** Ссылка для скачивания экспорта (открывается напрямую). */
  exportTreeUrl: (id: number, format: 'csv' | 'visio') =>
    `${BASE}/export/tree/${id}?format=${format}`,
};
