import { z } from 'zod';

/** Строка таблицы persons как приходит из БД. */
export interface PersonRow {
  id: number;
  full_name: string;
  gender: 'm' | 'f';
  birth_year: number | null;
  death_year: number | null;
  is_alive: boolean;
  father_id: number | null;
  mother_id: number | null;
  teip_id: number | null;
  gar_id: number | null;
  village_id: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Схема создания персоны (валидация входных данных). */
export const createPersonSchema = z.object({
  full_name: z.string().min(2, 'ФИО слишком короткое').max(200),
  gender: z.enum(['m', 'f']).default('m'),
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
  q: z.string().optional(),            // поиск по ФИО
  teip_id: z.coerce.number().int().positive().optional(),
  village_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type ListPersonsQuery = z.infer<typeof listPersonsSchema>;
