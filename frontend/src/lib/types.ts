// Общие типы данных, согласованные с backend.

export type Gender = 'm' | 'f';
export type PersonStatus = 'pending' | 'approved' | 'rejected';
export type Visibility = 'private' | 'public';
export type UserRole = 'viewer' | 'editor' | 'teip_admin' | 'super_admin';

export interface User {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
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
  state: 'empty' | 'private' | 'pending' | 'published' | 'mixed';
}

/** Древо в очереди модерации (сгруппировано по владельцу). */
export interface PendingTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
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

export interface TreeNode {
  id: number;
  full_name: string;
  gender: Gender;
  birth_year: number | null;
  death_year: number | null;
  father_id: number | null;
  mother_id: number | null;
  depth: number;
}

export interface Teip {
  id: number;
  name: string;
  description: string | null;
  tukhum_id: number | null;
  tukhum_name?: string | null;
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
  meta?: Record<string, unknown>;
}
