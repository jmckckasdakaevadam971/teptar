// Общие типы данных, согласованные с backend.

export type Gender = "m" | "f";
export type PersonStatus = "pending" | "approved" | "rejected";
export type Visibility = "private" | "public";
export type UserRole = "viewer" | "editor" | "teip_admin" | "super_admin";

export interface User {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  /** Тейп и село, указанные при регистрации (может отсутствовать у старых аккаунтов). */
  teip_id?: number | null;
  village_id?: number | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

/** Расширенный профиль для личного кабинета. */
export interface UserProfile extends User {
  created_at: string;
  persons_count: number;
  root_person_id: number | null;
  teip_id?: number | null;
  teip_name?: string | null;
  village_id?: number | null;
  village_name?: string | null;
}

export interface Person {
  id: number;
  full_name: string;
  gender: Gender;
  birth_year: number | null;
  death_year: number | null;
  is_alive: boolean;
  father_id: number | null;
  mother_id: number | null;
  teip_id: number | null;
  gar_id: number | null;
  village_id: number | null;
  note: string | null;
  /** Имена жён (жён может быть несколько); хранятся строками при муже. */
  spouse_names?: string[] | null;
  status: PersonStatus;
  visibility: Visibility;
  created_by: number | null;
}

/** Брак (связь супругов). */
export interface Marriage {
  id: number;
  husband_id: number;
  wife_id: number;
  start_year: number | null;
  end_year: number | null;
  note: string | null;
}

/** Ближайшее окружение персоны: родители, супруги, дети. */
export interface Family {
  person: Person;
  father: Person | null;
  mother: Person | null;
  spouses: Person[];
  children: Person[];
}

/** Состояние своего древа для ползунка видимости. */
export interface TreeStatus {
  total: number;
  private: number;
  pending: number;
  published: number;
  rejected: number;
  state: "empty" | "private" | "pending" | "published" | "mixed";
  /** Комментарий модератора к последнему отклонению (если было). */
  reject_reason: string | null;
  /** Когда древо отклонили в последний раз. */
  rejected_at: string | null;
}

/** Древо в очереди модерации (сгруппировано по владельцу). */
export interface PendingTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
  /** Заполнено, если древо во многом повторяет чужое (возможный дубликат). */
  duplicate?: {
    owner_id: number;
    owner_name: string;
    matched: number;
    published: boolean;
  } | null;
  /** Опубликованная версия участвует в объединении: одобрение новой версии
   *  перепривяжет его и отправит на повторную проверку. */
  merge_participation?: {
    other_owner_name: string | null;
    status: "pending" | "approved";
  } | null;
}

/** Опубликованное древо в общем каталоге. */
export interface PublicTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
  root_person_id: number | null;
  root_person_name: string | null;
  teip_id: number | null;
  teip_name: string | null;
}

/** Похожая персона из чужого древа. */
export interface SimilarPerson {
  id: number;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  teip_id: number | null;
  teip_name: string | null;
  created_by: number | null;
  owner_name: string | null;
  similarity: number;
}

/** Примерное родство с другим древом. */
export interface RelatedTreeMatch {
  my_person: { id: number; full_name: string; birth_year: number | null };
  their_person: { id: number; full_name: string; birth_year: number | null };
  similarity: number;
}

export interface RelatedTree {
  owner_id: number;
  owner_name: string | null;
  teip_name: string | null;
  match_count: number;
  best: RelatedTreeMatch;
  link_person_id: number;
}

/** Возможный дубль для модератора. */
export interface DuplicatePair {
  person: {
    id: number;
    full_name: string;
    birth_year: number | null;
    death_year: number | null;
  };
  candidate: SimilarPerson;
}

/** Общий предок (якорь) одного из двух древ — с контекстом для мини-схемы. */
export interface MergeAnchor {
  id: number;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  note: string | null;
  teip_name: string | null;
  father_name: string | null;
  children: { id: number; full_name: string; birth_year: number | null }[];
}

/** Владелец древа. */
export interface MergeParty {
  owner_id: number | null;
  owner_name: string | null;
  /** Публичных персон в древе владельца. */
  tree_size: number;
}

/** Предложение срастить два древа по общему предку. */
export interface MergeSuggestion {
  id: number;
  similarity: number;
  owner_a: MergeParty;
  owner_b: MergeParty;
  anchor_a: MergeAnchor;
  anchor_b: MergeAnchor;
}

/** Одна ветка объединённого древа. */
export interface MergeBranch {
  anchor_id: number;
  anchor_name: string;
  owner_id: number | null;
  owner_name: string | null;
  teip_name: string | null;
  /** Полный размер древа этой стороны (всё древо владельца). */
  size: number;
}

/** Объединённое (общее) древо — связь двух веток по общему предку. */
export interface TreeMerge {
  id: number;
  status: "pending" | "approved" | "rejected";
  merged_name: string;
  merged_birth_year: number | null;
  merged_death_year: number | null;
  created_at: string;
  branch_a: MergeBranch;
  branch_b: MergeBranch;
  /** Всего людей в целом объединённом древе (общие — один раз). */
  total: number;
  /** Первопредок (корень) целого древа — его именем называется древо. */
  root_name: string;
  root_birth_year: number | null;
  root_death_year: number | null;
  /** Сколько новых людей добавила присоединённая ветвь. */
  added_count: number;
}

/** Карточка одной стороны при сверке пары персон перед объединением. */
export interface MergeCheckPerson {
  id: number;
  full_name: string;
  gender: "m" | "f" | null;
  birth_year: number | null;
  death_year: number | null;
  teip_name: string | null;
  village_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  tree_size: number;
  children: { id: number; full_name: string; birth_year: number | null }[];
}

/** Пункт чек-листа сверки: подтверждение, предупреждение или блокировка. */
export interface MergeCheckItem {
  level: "ok" | "warn" | "block";
  code: string;
  message: string;
}

/** Результат сверки пары персон перед объединением. */
export interface MergeCheck {
  a: MergeCheckPerson;
  b: MergeCheckPerson;
  items: MergeCheckItem[];
  can_merge: boolean;
}

/** Сводка итогового общего древа (если объединение подтвердить). */
export interface MergedTreeStats {
  total: number;
  added_count: number;
  root_id: number | null;
  root_name: string | null;
  root_birth_year: number | null;
  root_death_year: number | null;
}

/**
 * Возможное продолжение проверяемого древа в опубликованной базе — система
 * сама нашла точку соединения; модератор принимает одно итоговое решение.
 */
export interface TreeMergeCandidate {
  other_owner_id: number;
  other_owner_name: string | null;
  similarity: number;
  /** Якорь в проверяемом древе. */
  anchor_own_id: number;
  /** Якорь в опубликованном древе другого автора. */
  anchor_other_id: number;
  /** Чек-лист сверки: a — проверяемое древо, b — опубликованное. */
  check: MergeCheck;
  merged_stats: MergedTreeStats;
}

/** Найденная персона для ручного выбора точки соединения. */
export interface MergeSearchHit {
  id: number;
  full_name: string;
  gender: "m" | "f" | null;
  birth_year: number | null;
  death_year: number | null;
  teip_name: string | null;
  village_name: string | null;
  father_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  status: string;
}

/** Правка персоны на повторной модерации (что изменилось). */
export interface TreeChange {
  person_id: number;
  full_name: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

export interface TreeNode {
  id: number;
  full_name: string;
  gender: Gender;
  birth_year: number | null;
  death_year: number | null;
  father_id: number | null;
  mother_id: number | null;
  depth: number;
  /** Имена жён (жён может быть несколько). */
  spouse_names?: string[] | null;
  /** Узел добавлен из второго древа при объединении родословных. */
  merge_added?: boolean;
  /** Имя хранителя, из чьей родословной добавлена ветвь. */
  merge_author?: string | null;
  /** Точка соединения — общий человек, через которого слиты древа. */
  merge_anchor?: boolean;
}

export interface Teip {
  id: number;
  name: string;
  description: string | null;
  tukhum_id: number | null;
  tukhum_name?: string | null;
  origin_place: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  tukhum_approx_lat?: number | null;
  tukhum_approx_lng?: number | null;
}

export interface Tukhum {
  id: number;
  name: string;
  description: string | null;
  teip_count: number;
}

export interface Gar {
  id: number;
  teip_id: number;
  name: string;
  description: string | null;
}

export interface Nekyi {
  id: number;
  gar_id: number;
  name: string;
  description: string | null;
}

export interface Village {
  id: number;
  name: string;
  district: string | null;
  type: string | null;
  is_extant: boolean;
  note: string | null;
}

export interface CommonAncestor {
  ancestor: { id: number; full_name: string } | null;
  depth_from_a: number | null;
  depth_from_b: number | null;
  relation: string;
}

/** Пользователь в админке (с датой регистрации). */
export interface AdminUser extends User {
  created_at: string;
  /** Тейп/село, указанные при регистрации. */
  teip_name?: string | null;
  village_name?: string | null;
  /** Закреплённые тейпы (для хранителей). */
  teips: { id: number; name: string }[];
}

/** Опубликованное древо в админке (с контактами владельца). */
export interface AdminTree {
  owner_id: number;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  count: number;
  teip_name: string | null;
  root_person_id: number | null;
  root_person_name: string | null;
  published_at: string | null;
}

// ── Хранители тептара ──────────────────────────────────────────

/** Публичная карточка хранителя. */
export interface Keeper {
  user_id: number;
  display_name: string;
  teips: string[];
  since: string;
}

export type KeeperApplicationStatus = "pending" | "approved" | "rejected";

/** Заявка «Стать хранителем». */
export interface KeeperApplication {
  id: number;
  user_id: number;
  display_name?: string;
  email?: string | null;
  teip_id: number | null;
  teip_name: string;
  village: string | null;
  experience: string;
  contact: string | null;
  status: KeeperApplicationStatus;
  created_at: string;
}

/** Мой статус в программе хранителей. */
export interface KeeperStatus {
  is_keeper: boolean;
  teips: { id: number; name: string }[];
  application: KeeperApplication | null;
}

/** Сводные счётчики для обзора. */
export interface AdminStats {
  users: number;
  persons: number;
  teips: number;
  villages: number;
}

/** Конверт ответа API. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
  /** Детали ошибки валидации (Zod flatten). */
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  meta?: Record<string, unknown>;
}
