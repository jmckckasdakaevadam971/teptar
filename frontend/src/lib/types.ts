// Общие типы данных, согласованные с backend.

export type Gender = 'm' | 'f';
export type PersonStatus = 'pending' | 'approved' | 'rejected';
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

/** Конверт ответа API. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
  meta?: Record<string, unknown>;
}
