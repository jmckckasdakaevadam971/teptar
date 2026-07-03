import { z } from "zod";

/** Схема заявки «Стать хранителем». */
export const applyKeeperSchema = z
  .object({
    teip_id: z.number().int().positive().nullable().optional(),
    teip_name: z.string().trim().max(120).optional(),
    village: z.string().trim().max(200).nullable().optional(),
    experience: z
      .string()
      .trim()
      .min(30, "Расскажите подробнее — минимум 30 символов")
      .max(4000),
    contact: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => v.teip_id != null || (v.teip_name ?? "").length >= 2, {
    message: "Укажите тейп: выберите из списка или впишите название",
    path: ["teip_name"],
  });

/** Схема управления тейпами модератора (супер-админ). */
export const setUserTeipsSchema = z.object({
  teip_ids: z.array(z.number().int().positive()).max(50),
});
