import { z } from "zod";

/** Создание запроса доступа к ветви родословной. */
export const createBranchRequestSchema = z.object({
  branch_root_id: z.number().int().positive(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export type CreateBranchRequestInput = z.infer<
  typeof createBranchRequestSchema
>;
