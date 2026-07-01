import { z } from "zod";

/** Строка таблицы persons как приходит из БД. */
export interface PersonRow {
  id: number;
  full_name: string;
  gender: "m" | "f";
  birth_year: number | null;
  death_year: number | null;
  is_alive: boolean;
  father_id: number | null;
  mother_id: number | null;
  teip_id: number | null;
  gar_id: number | null;
  village_id: number | null;
  note: string | null;
  visibility: "private" | "public";
  status: "pending" | "approved" | "rejected";
  created_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Схема создания персоны (валидация входных данных). */
export const createPersonSchema = z.object({
  full_name: z.string().min(2, "ФИО слишком короткое").max(200),
  gender: z.enum(["m", "f"]).default("m"),
  birth_year: z.number().int().min(0).max(2100).nullable().optional(),
  death_year: z.number().int().min(0).max(2100).nullable().optional(),
  father_id: z.number().int().positive().nullable().optional(),
  mother_id: z.number().int().positive().nullable().optional(),
  teip_id: z.number().int().positive().nullable().optional(),
  gar_id: z.number().int().positive().nullable().optional(),
  village_id: z.number().int().positive().nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});

/** Схема обновления — все поля опциональны. */
export const updatePersonSchema = createPersonSchema.partial();

/** Параметры поиска/листинга. */
export const listPersonsSchema = z.object({
  q: z.string().optional(), // поиск по ФИО
  teip_id: z.coerce.number().int().positive().optional(),
  village_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type ListPersonsQuery = z.infer<typeof listPersonsSchema>;

/**
 * Публикация древа в общую базу.
 *  • all         — показать всех (до сегодняшнего дня);
 *  • hide_recent — скрыть родившихся с cutoff_year (по умолчанию 1970),
 *                  в общей базе остаются только предки до этого года.
 */
export const publishTreeSchema = z.object({
  mode: z.enum(["all", "hide_recent"]).default("all"),
  cutoff_year: z.coerce.number().int().min(1800).max(2100).default(1970),
});
export type PublishTreeInput = z.infer<typeof publishTreeSchema>;

/** Каталог опубликованных древ — фильтры. */
export const publicTreesSchema = z.object({
  q: z.string().optional(),
  teip_id: z.coerce.number().int().positive().optional(),
  village_id: z.coerce.number().int().positive().optional(),
});
export type PublicTreesQuery = z.infer<typeof publicTreesSchema>;

/** Объединение двух персон (модератор). */
export const mergeSchema = z.object({
  keep_id: z.number().int().positive(),
  drop_id: z.number().int().positive(),
});
export type MergeInput = z.infer<typeof mergeSchema>;

/**
 * Пакетная замена всего своего древа одним запросом (из редактора `/my`).
 * Родитель указывается по временному temp_id из этого же пакета, чтобы не
 * зависеть от реальных id, которые ещё не созданы. Одна транзакция вместо
 * сотен отдельных INSERT-ов — быстрее и не держит пул соединений.
 */
export const bulkPersonSchema = z.object({
  temp_id: z.string().min(1).max(64),
  full_name: z.string().min(2, "ФИО слишком короткое").max(200),
  gender: z.enum(["m", "f"]).default("m"),
  birth_year: z.number().int().min(0).max(2100).nullable().optional(),
  death_year: z.number().int().min(0).max(2100).nullable().optional(),
  parent_temp_id: z.string().max(64).nullable().optional(),
  teip_id: z.number().int().positive().nullable().optional(),
  gar_id: z.number().int().positive().nullable().optional(),
  village_id: z.number().int().positive().nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});
export const bulkTreeSchema = z.object({
  persons: z.array(bulkPersonSchema).min(1).max(2000),
});
export type BulkPersonInput = z.infer<typeof bulkPersonSchema>;
export type BulkTreeInput = z.infer<typeof bulkTreeSchema>;
