import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import * as controller from "./ancestors.controller.js";

/**
 * Маршруты деревьев и поиска общего предка.
 * Префикс в app.ts: /api/ancestors
 *
 * Примечание: маршруты предков/потомков конкретного человека также
 * доступны как вложенные, но для простоты держим их здесь.
 */
export const ancestorsRouter = Router();

// Примерное родство с другими древами (требует авторизацию)
ancestorsRouter.get(
  "/related-trees",
  requireAuth,
  asyncHandler(controller.relatedTrees),
);

// Поиск общего предка двух людей: /api/ancestors/common?a=7&b=9
ancestorsRouter.get("/common", asyncHandler(controller.common));

// Дерево предков/потомков: /api/ancestors/:id/up  и  /:id/down
ancestorsRouter.get("/:id/up", asyncHandler(controller.ancestors));
ancestorsRouter.get("/:id/down", asyncHandler(controller.descendants));

// Полное объединённое древо от старшего предка вниз: /api/ancestors/:id/full
ancestorsRouter.get("/:id/full", asyncHandler(controller.fullTree));

// Общее (объединённое) древо по связи tree_merges: /api/ancestors/merged/:id/full
// Предпросмотр слияния по паре якорей регистрируется ДО «/merged/:id/full»,
// чтобы «preview» не перехватился как :id.
ancestorsRouter.get(
  "/merged/preview",
  requireAuth,
  asyncHandler(controller.mergedTreePreview),
);
ancestorsRouter.get("/merged/:id/full", asyncHandler(controller.mergedTree));
