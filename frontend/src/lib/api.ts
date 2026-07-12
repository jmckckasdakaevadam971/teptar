import type {
  ApiEnvelope,
  Person,
  Family,
  TreeNode,
  Teip,
  TeipRequest,
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
  AdminTree,
  TreeStatus,
  PendingTree,
  PublicTree,
  RelatedTree,
  DuplicatePair,
  MergeSuggestion,
  MergeCheck,
  MergeSearchHit,
  TreeMerge,
  TreeMergeCandidate,
  TreeChange,
  Keeper,
  KeeperApplication,
  KeeperStatus,
  BranchAccessRequest,
  BranchAccessIncoming,
  BranchAccessMine,
  BranchGrantInfo,
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
    const err = new Error(
      detail ?? body.error ?? `Ошибка запроса (${res.status})`,
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
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

    /** Черновик своего древа с сервера (синхронизация между устройствами). */
    treeDraft: () =>
      request<{ data: unknown[] | null; updated_at: string | null }>(
        "/persons/tree/draft",
      ),
    /** Сохранить черновик своего древа на сервере. */
    saveTreeDraft: (data: unknown[]) =>
      request<{ updated_at: string }>("/persons/tree/draft", {
        method: "PUT",
        body: JSON.stringify({ data }),
      }),
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

    /**
     * Заменить всё своё древо одним запросом и отправить на модерацию.
     * Родитель указывается по temp_id из этого же пакета.
     */
    bulkReplace: (
      persons: Array<{
        temp_id: string;
        full_name: string;
        gender: "m" | "f";
        birth_year: number | null;
        death_year: number | null;
        parent_temp_id: string | null;
        teip_id: number | null;
        gar_id: number | null;
        village_id: number | null;
        note: string | null;
        spouse_names: string[] | null;
      }>,
    ) =>
      request<{ count: number }>("/persons/tree/bulk", {
        method: "POST",
        body: JSON.stringify({ persons }),
      }),

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

    /** Каталог одобренных объединённых (общих) древ. */
    publicMerges: () => request<TreeMerge[]>(`/persons/trees/merged`),
  },

  tree: {
    ancestors: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/up?depth=${depth}`),
    descendants: (id: number, depth = 20) =>
      request<TreeNode[]>(`/ancestors/${id}/down?depth=${depth}`),
    /** Полное объединённое древо от старшего предка данной персоны. */
    fullTree: (id: number) => request<TreeNode[]>(`/ancestors/${id}/full`),
    /** Общее (объединённое) древо по связи tree_merges. */
    mergedTree: (id: number) =>
      request<TreeNode[]>(`/ancestors/merged/${id}/full`),
    /** Предпросмотр общего древа по паре якорей — до объединения (модератор). */
    mergedTreePreview: (a: number, b: number) =>
      request<TreeNode[]>(`/ancestors/merged/preview?a=${a}&b=${b}`),
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
    updateOrigin: (
      id: number,
      data: {
        origin_place: string | null;
        origin_lat: number | null;
        origin_lng: number | null;
      },
    ) =>
      request<Teip>(`/teips/${id}/origin`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    /** Создать тейп в справочнике (super_admin). */
    create: (data: {
      name: string;
      description?: string | null;
      tukhum_id?: number | null;
    }) =>
      request<Teip>("/teips", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    /** Обновить название/описание/тукхум тейпа (super_admin). */
    update: (
      id: number,
      data: {
        name?: string;
        description?: string | null;
        tukhum_id?: number | null;
      },
    ) =>
      request<Teip>(`/teips/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    /** Удалить тейп из справочника (super_admin). */
    remove: (id: number) =>
      request<{ deleted: boolean }>(`/teips/${id}`, { method: "DELETE" }),
    /** Заявки на добавление тейпа в справочник (super_admin). */
    requests: () => request<TeipRequest[]>("/teips/requests"),
    /** Одобрить заявку: создать тейп с этим названием (опц. с тукхумом). */
    approveRequest: (id: number, tukhumId?: number | null) =>
      request<Teip>(`/teips/requests/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ tukhum_id: tukhumId ?? null }),
      }),
    /** Привязать заявку как вариант написания существующего тейпа. */
    mapRequest: (id: number, teipId: number) =>
      request<Teip>(`/teips/requests/${id}/map`, {
        method: "POST",
        body: JSON.stringify({ teip_id: teipId }),
      }),
    rejectRequest: (id: number) =>
      request<{ rejected: boolean }>(`/teips/requests/${id}/reject`, {
        method: "POST",
      }),
    /** Добавить тейпу вариант написания (super_admin). */
    addAlias: (id: number, name: string) =>
      request<{ id: number; teip_id: number; name: string }>(
        `/teips/${id}/aliases`,
        { method: "POST", body: JSON.stringify({ name }) },
      ),
    removeAlias: (aliasId: number) =>
      request<{ deleted: boolean }>(`/teips/aliases/${aliasId}`, {
        method: "DELETE",
      }),
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
    /** Публичная конфигурация (нужен ли виджет проверки на бота, включено ли подтверждение почты). */
    config: () =>
      request<{
        turnstile_site_key: string | null;
        email_verification: boolean;
      }>("/auth/config"),
    login: (login: string, password: string, turnstile_token?: string) =>
      request<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password, turnstile_token }),
      }),
    register: (input: {
      display_name: string;
      email: string;
      password: string;
      teip_id?: number;
      teip_name?: string;
      village_id: number;
      turnstile_token?: string;
    }) =>
      request<AuthResult | { pending: true; email: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    /** Шаг 2 регистрации: подтверждение кода из письма. */
    verifyEmail: (email: string, code: string) =>
      request<AuthResult>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),
    /** Повторная отправка кода подтверждения. */
    resendCode: (input: {
      display_name: string;
      email: string;
      password: string;
      teip_id?: number;
      teip_name?: string;
      village_id: number;
    }) =>
      request<{ pending: true; email: string }>("/auth/resend-code", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    me: () =>
      request<{ user: { userId: number; role: User["role"] } | null }>(
        "/auth/me",
      ),
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
    setRole: (id: number, role: User["role"], teipId?: number) =>
      request<{ id: number; role: string }>(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify(teipId ? { role, teip_id: teipId } : { role }),
      }),
    deleteUser: (id: number) =>
      request<{ deleted: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),
    /** Все опубликованные древа (с контактами владельцев). */
    trees: () => request<AdminTree[]>("/admin/trees"),
    /** Снять древо с публикации (данные владельца сохраняются). */
    unpublishTree: (ownerId: number) =>
      request<{ count: number }>(`/admin/trees/${ownerId}/unpublish`, {
        method: "POST",
      }),
    /** Полностью удалить древо пользователя (необратимо). */
    deleteTree: (ownerId: number) =>
      request<{ count: number }>(`/admin/trees/${ownerId}`, {
        method: "DELETE",
      }),
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
    /** Возможные продолжения проверяемого древа в опубликованной базе —
     *  система сама предлагает точки объединения. */
    mergeCandidates: (ownerId: number) =>
      request<TreeMergeCandidate[]>(
        `/persons/moderation/${ownerId}/merge-candidates`,
      ),
    /** Одно решение: опубликовать древо и объединить по предложенной точке. */
    approveWithMerge: (
      ownerId: number,
      input: {
        anchor_own_id: number;
        anchor_other_id: number;
        keep_id?: number;
        full_name?: string;
        birth_year?: number | null;
        death_year?: number | null;
        note?: string | null;
      },
    ) =>
      request<{ count: number; tree_merge_id: number }>(
        `/persons/moderation/${ownerId}/approve-with-merge`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    reject: (ownerId: number, reason?: string) =>
      request<{ count: number }>(`/persons/moderation/${ownerId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
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
    /** Очередь авто-предложений объединения древ. */
    mergeSuggestions: () =>
      request<MergeSuggestion[]>("/persons/moderation/merge-suggestions"),
    /** Применить предложение: срастить древа, оставив предка keepId
     *  (с опциональной перезаписью его полей). */
    resolveMerge: (
      id: number,
      keepId: number,
      overrides?: {
        full_name?: string;
        birth_year?: number | null;
        death_year?: number | null;
        note?: string | null;
      },
    ) =>
      request<{ merged: boolean; tree_merge_id: number }>(
        `/persons/moderation/merge-suggestions/${id}/merge`,
        {
          method: "POST",
          body: JSON.stringify({ keep_id: keepId, ...overrides }),
        },
      ),
    /** Отклонить предложение объединения. */
    dismissMerge: (id: number) =>
      request<{ dismissed: boolean }>(
        `/persons/moderation/merge-suggestions/${id}/dismiss`,
        { method: "POST" },
      ),

    /** Очередь объединённых древ на повторной модерации. */
    pendingMerges: () =>
      request<TreeMerge[]>("/persons/moderation/tree-merges"),
    /** Одобрить объединённое древо — оно станет публичным. */
    approveMerge: (id: number) =>
      request<{ approved: boolean }>(
        `/persons/moderation/tree-merges/${id}/approve`,
        { method: "POST" },
      ),
    /** Отклонить объединённое древо — исходные останутся раздельными. */
    rejectMerge: (id: number) =>
      request<{ rejected: boolean }>(
        `/persons/moderation/tree-merges/${id}/reject`,
        { method: "POST" },
      ),

    /** Чек-лист сверки пары персон перед объединением. */
    mergeCheck: (a: number, b: number) =>
      request<MergeCheck>(`/persons/moderation/merge-check?a=${a}&b=${b}`),
    /** Поиск персон для ручного выбора точки соединения. */
    mergePersonSearch: (q: string) =>
      request<MergeSearchHit[]>(
        `/persons/moderation/person-search?q=${encodeURIComponent(q)}`,
      ),
    /** Ручное объединение: модератор сам выбрал двух персон-якорей. */
    manualMerge: (input: {
      anchor_a_id: number;
      anchor_b_id: number;
      keep_id?: number;
      full_name?: string;
      birth_year?: number | null;
      death_year?: number | null;
      note?: string | null;
    }) =>
      request<{ merged: boolean; tree_merge_id: number; check: MergeCheck }>(
        "/persons/moderation/tree-merges/manual",
        { method: "POST", body: JSON.stringify(input) },
      ),
    /** Отменить одобренное объединение — древа снова независимы. */
    unmerge: (id: number) =>
      request<{ cancelled: boolean }>(
        `/persons/moderation/tree-merges/${id}/unmerge`,
        { method: "POST" },
      ),
  },

  /** Программа «Хранители тептара». */
  keepers: {
    /** Публичный список хранителей. */
    list: () => request<Keeper[]>("/keepers"),
    /** Мой статус: хранитель? заявка? */
    my: () => request<KeeperStatus>("/keepers/my"),
    /** Подать заявку. */
    apply: (input: {
      teip_id?: number | null;
      teip_name?: string;
      village?: string;
      experience: string;
      contact?: string;
    }) =>
      request<KeeperApplication>("/keepers/apply", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    /** Заявки на рассмотрении (super_admin). */
    applications: () => request<KeeperApplication[]>("/keepers/applications"),
    approveApplication: (id: number) =>
      request<{ approved: boolean }>(`/keepers/applications/${id}/approve`, {
        method: "POST",
      }),
    rejectApplication: (id: number) =>
      request<{ rejected: boolean }>(`/keepers/applications/${id}/reject`, {
        method: "POST",
      }),
    /** Добавить тейп из заявки в справочник (super_admin). */
    createTeipFromApplication: (id: number, tukhumId?: number | null) =>
      request<{ teip_id: number; teip_name: string }>(
        `/keepers/applications/${id}/create-teip`,
        {
          method: "POST",
          body: JSON.stringify({ tukhum_id: tukhumId ?? null }),
        },
      ),
  },

  /** Запросы доступа к ветви родословной. */
  branchAccess: {
    /** Отправить запрос владельцу выбранной ветви. */
    request: (input: { branch_root_id: number; comment?: string | null }) =>
      request<BranchAccessRequest>("/branch-access", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    /** Входящие запросы (я — владелец). */
    incoming: () => request<BranchAccessIncoming[]>("/branch-access/incoming"),
    /** Мои исходящие запросы. */
    mine: () => request<BranchAccessMine[]>("/branch-access/mine"),
    /** Предоставить доступ. */
    approve: (id: number) =>
      request<{ approved: boolean }>(`/branch-access/${id}/approve`, {
        method: "POST",
      }),
    /** Отклонить запрос. */
    reject: (id: number) =>
      request<{ rejected: boolean }>(`/branch-access/${id}/reject`, {
        method: "POST",
      }),
    /** Мои права на древе rootId (владелец / одобренные ветви). */
    myGrant: (rootId: number) =>
      request<BranchGrantInfo>(`/branch-access/my-grant/${rootId}`),
  },

  /** Ссылка для скачивания экспорта (открывается напрямую). */
  exportTreeUrl: (id: number, format: "csv" | "visio") =>
    `${BASE}/export/tree/${id}?format=${format}`,
};
