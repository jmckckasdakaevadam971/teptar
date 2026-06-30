import type {
  ApiEnvelope,
  Person,
  Family,
  TreeNode,
  Teip,
  Tukhum,
  Gar,
  Nekyi,
  Village,
  CommonAncestor,
  Marriage,
  AuthResult,
  User,
  UserProfile,
  AdminUser,
  AdminStats,
  TreeStatus,
  PendingTree,
  PublicTree,
  RelatedTree,
  DuplicatePair,
  TreeChange,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/** Собрать читаемое сообщение из деталей валидации Zod. */
function formatDetails(
  details?: ApiEnvelope<unknown>["details"],
): string | null {
  if (!details) return null;
  const msgs: string[] = [];
  if (Array.isArray(details.formErrors)) msgs.push(...details.formErrors);
  if (details.fieldErrors) {
    for (const arr of Object.values(details.fieldErrors)) {
      if (Array.isArray(arr)) msgs.push(...arr);
    }
  }
  const unique = [...new Set(msgs.filter(Boolean))];
  return unique.length ? unique.join(". ") : null;
}

/** Низкоуровневый fetch с разбором конверта и токеном. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("teptar_token") : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    // Для ошибок валидации показываем конкретную причину (какое поле неверно).
    const detail = formatDetails(body.details);
    throw new Error(detail ?? body.error ?? `Ошибка запроса (${res.status})`);
  }
  return body.data;
}

/** Типизированный клиент API, сгруппированный по доменам. */
export const api = {
  persons: {
    search: (params: { q?: string; teip_id?: number; village_id?: number }) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.teip_id) qs.set("teip_id", String(params.teip_id));
      if (params.village_id) qs.set("village_id", String(params.village_id));
      return request<Person[]>(`/persons?${qs.toString()}`);
    },
    get: (id: number) => request<Person>(`/persons/${id}`),
    /** Ближайшее окружение: родители, супруги, дети. */
    family: (id: number) => request<Family>(`/persons/${id}/family`),
    create: (input: Partial<Person>) =>
      request<Person>("/persons", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: number, input: Partial<Person>) =>
      request<Person>(`/persons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (id: number) =>
      request<void>(`/persons/${id}`, { method: "DELETE" }),

    /** Состояние своего древа (приватное / на модерации / опубликовано). */
    treeStatus: () => request<TreeStatus>("/persons/tree/status"),
    /** Отправить своё древо в общую базу. */
    publish: (mode: "all" | "hide_recent", cutoff_year = 1970) =>
      request<{ published: number; hidden: number }>("/persons/tree/publish", {
        method: "POST",
        body: JSON.stringify({ mode, cutoff_year }),
      }),
    /** Скрыть древо обратно в личное. */
    unpublish: () =>
      request<{ count: number }>("/persons/tree/unpublish", { method: "POST" }),

    /** Удалить всё своё древо (перед повторной отправкой). */
    reset: () =>
      request<{ count: number }>("/persons/tree/reset", { method: "POST" }),

    /** Общий каталог опубликованных древ. */
    publicTrees: (
      params: { q?: string; teip_id?: number; village_id?: number } = {},
    ) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.teip_id) qs.set("teip_id", String(params.teip_id));
      if (params.village_id) qs.set("village_id", String(params.village_id));
      const s = qs.toString();
      return request<PublicTree[]>(`/persons/trees/public${s ? `?${s}` : ""}`);
    },
  },

  tree: {
    ancestors: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/up?depth=${depth}`),
    descendants: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/down?depth=${depth}`),
    commonAncestor: (a: number, b: number) =>
      request<CommonAncestor>(`/ancestors/common?a=${a}&b=${b}`),
    /** Примерное родство с другими древами. */
    relatedTrees: () => request<RelatedTree[]>("/ancestors/related-trees"),
  },

  /** Браки (связи супругов). */
  relations: {
    marriages: (personId: number) =>
      request<Marriage[]>(`/relations/marriages/${personId}`),
    addMarriage: (husband_id: number, wife_id: number) =>
      request<Marriage>("/relations/marriages", {
        method: "POST",
        body: JSON.stringify({ husband_id, wife_id }),
      }),
    deleteMarriage: (id: number) =>
      request<void>(`/relations/marriages/${id}`, { method: "DELETE" }),
  },

  teips: {
    list: () => request<Teip[]>("/teips"),
    gars: (id: number) => request<Gar[]>(`/teips/${id}/gars`),
  },

  tukhums: {
    list: () => request<Tukhum[]>("/tukhums"),
    teips: (id: number) => request<Teip[]>(`/tukhums/${id}/teips`),
  },

  gars: {
    nekyi: (id: number) => request<Nekyi[]>(`/gars/${id}/nekyi`),
  },

  villages: {
    list: (q?: string) =>
      request<Village[]>(`/villages${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    create: (name: string, district?: string | null) =>
      request<Village>("/villages", {
        method: "POST",
        body: JSON.stringify({ name, district: district ?? null }),
      }),
  },

  auth: {
    /** Публичная конфигурация (нужен ли виджет проверки на бота). */
    config: () =>
      request<{ turnstile_site_key: string | null }>("/auth/config"),
    login: (login: string, password: string, turnstile_token?: string) =>
      request<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password, turnstile_token }),
      }),
    register: (input: {
      display_name: string;
      phone?: string;
      email?: string;
      password: string;
      turnstile_token?: string;
    }) =>
      request<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    me: () => request<{ user: User | null }>("/auth/me"),
    /** Полный профиль текущего пользователя. */
    profile: () => request<UserProfile>("/auth/profile"),
    /** Обновить имя / телефон / e-mail. */
    updateProfile: (input: {
      display_name: string;
      phone?: string | null;
      email?: string | null;
    }) =>
      request<UserProfile>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    /** Сменить пароль. */
    changePassword: (current_password: string, new_password: string) =>
      request<{ changed: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  /** Администрирование (только super_admin). */
  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    users: () => request<AdminUser[]>("/admin/users"),
    setRole: (id: number, role: User["role"]) =>
      request<{ id: number; role: string }>(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    deleteUser: (id: number) =>
      request<{ deleted: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),
  },

  /** Модерация общей базы (teip_admin / super_admin). */
  moderation: {
    pending: () => request<PendingTree[]>("/persons/moderation/pending"),
    editOwners: () => request<PendingTree[]>("/persons/moderation/edits"),
    persons: (ownerId: number) =>
      request<Person[]>(`/persons/moderation/${ownerId}/persons`),
    approve: (ownerId: number) =>
      request<{ count: number }>(`/persons/moderation/${ownerId}/approve`, {
        method: "POST",
      }),
    reject: (ownerId: number) =>
      request<{ count: number }>(`/persons/moderation/${ownerId}/reject`, {
        method: "POST",
      }),
    /** Возможные дубли древа в других древах. */
    duplicates: (ownerId: number) =>
      request<DuplicatePair[]>(`/persons/moderation/${ownerId}/duplicates`),
    /** Что изменилось в древе перед повторной модерацией. */
    changes: (ownerId: number) =>
      request<TreeChange[]>(`/persons/moderation/${ownerId}/changes`),
    approveEdit: (personId: number) =>
      request<{ id: number }>(`/persons/moderation/edit/${personId}/approve`, {
        method: "POST",
      }),
    rejectEdit: (personId: number) =>
      request<{ rejected: boolean }>(
        `/persons/moderation/edit/${personId}/reject`,
        { method: "POST" },
      ),
    merge: (keep_id: number, drop_id: number) =>
      request<{ merged: boolean }>("/persons/moderation/merge", {
        method: "POST",
        body: JSON.stringify({ keep_id, drop_id }),
      }),
  },

  /** Ссылка для скачивания экспорта (открывается напрямую). */
  exportTreeUrl: (id: number, format: "csv" | "visio") =>
    `${BASE}/export/tree/${id}?format=${format}`,
};
