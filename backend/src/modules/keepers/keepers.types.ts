import { z } from "zod";

/**
 * Схема заявки «Стать хранителем».
 * Тейп заявки определяется профилем заявителя на бэке; поля teip_id/teip_name
 * используются только старыми аккаунтами без тейпа в профиле (проверка
 * наличия тейпа — в сервисе).
 */
export const applyKeeperSchema = z.object({
  teip_id: z.number().int().positive().nullable().optional(),
  teip_name: z.string().trim().max(120).optional(),
  village: z.string().trim().max(200).nullable().optional(),
  experience: z
    .string()
    .trim()
    .min(30, "Расскажите подробнее — минимум 30 символов")
    .max(4000),
  contact: z.string().trim().max(200).nullable().optional(),
});
