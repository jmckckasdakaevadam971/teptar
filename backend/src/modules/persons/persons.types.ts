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
  /** Имена жён (жён может быть несколько); хранятся строками при муже. */
  spouse_names?: string[] | null;
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

/** Схема обновления — все поля опциональны (+ список жён). */
export const updatePersonSchema = createPersonSchema.partial().extend({
  spouse_names: z
    .array(z.string().trim().min(1).max(120))
    .max(20)
    .nullable()
    .optional(),
});

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

/** Отклонение древа модератором: необязательный комментарий автору. */
export const rejectTreeSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type RejectTreeInput = z.infer<typeof rejectTreeSchema>;

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

/** Решение по предложению объединения древ: какую запись предка оставить
 *  и (опционально) какими полями её перезаписать. */
export const resolveMergeSchema = z.object({
  keep_id: z.coerce.number().int().positive(),
  full_name: z.string().min(2).max(200).optional(),
  birth_year: z.number().int().min(0).max(2100).nullable().optional(),
  death_year: z.number().int().min(0).max(2100).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});
export type ResolveMergeInput = z.infer<typeof resolveMergeSchema>;

/** Ручное объединение древ: модератор сам выбрал двух персон-якорей. */
export const manualMergeSchema = z.object({
  anchor_a_id: z.coerce.number().int().positive(),
  anchor_b_id: z.coerce.number().int().positive(),
  /** Чьи поля станут «шапкой» общего предка (по умолчанию — первая). */
  keep_id: z.coerce.number().int().positive().optional(),
  full_name: z.string().min(2).max(200).optional(),
  birth_year: z.number().int().min(0).max(2100).nullable().optional(),
  death_year: z.number().int().min(0).max(2100).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});
export type ManualMergeInput = z.infer<typeof manualMergeSchema>;

/**
 * Опубликовать древо и сразу объединить с опубликованным древом другого
 * автора по предложенной системой точке соединения — одно решение модератора.
 */
export const approveWithMergeSchema = z.object({
  /** Якорь в проверяемом (pending) древе. */
  anchor_own_id: z.coerce.number().int().positive(),
  /** Якорь в уже опубликованном древе другого автора. */
  anchor_other_id: z.coerce.number().int().positive(),
  /** Чьи поля станут «шапкой» общего предка (по умолчанию — свой якорь). */
  keep_id: z.coerce.number().int().positive().optional(),
  full_name: z.string().min(2).max(200).optional(),
  birth_year: z.number().int().min(0).max(2100).nullable().optional(),
  death_year: z.number().int().min(0).max(2100).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});
export type ApproveWithMergeInput = z.infer<typeof approveWithMergeSchema>;

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
  spouse_names: z
    .array(z.string().trim().min(1).max(120))
    .max(20)
    .nullable()
    .optional(),
});
export const bulkTreeSchema = z.object({
  persons: z.array(bulkPersonSchema).min(1).max(2000),
});
export type BulkPersonInput = z.infer<typeof bulkPersonSchema>;
export type BulkTreeInput = z.infer<typeof bulkTreeSchema>;

/**
 * Черновик «Моего древа» — JSON-массив карточек редактора как есть.
 * Хранится на сервере, чтобы древо было доступно с любого устройства.
 * Структуру карточек валидируем мягко (id/name обязательны), остальные
 * поля редактор может менять без миграций БД.
 */
export const treeDraftSchema = z.object({
  data: z
    .array(
      z
        .object({
          id: z.string().min(1).max(64),
          name: z.string().min(1).max(200),
        })
        .passthrough(),
    )
    .max(2000),
});
export type TreeDraftInput = z.infer<typeof treeDraftSchema>;
