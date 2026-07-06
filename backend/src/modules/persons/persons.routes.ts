import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as controller from "./persons.controller.js";

/**
 * Маршруты модуля «Персоны».
 * Базовый префикс монтируется в app.ts: /api/persons
 */
export const personsRouter = Router();

// Публичное чтение (с учётом видимости)
personsRouter.get("/", asyncHandler(controller.list));

// Публичный каталог опубликованных древ
personsRouter.get("/trees/public", asyncHandler(controller.publicTrees));

// Публичный каталог одобренных объединённых (общих) древ
personsRouter.get("/trees/merged", asyncHandler(controller.publicMerges));

// Своё древо: статус и публикация в общую базу
personsRouter.get(
  "/tree/status",
  requireAuth,
  asyncHandler(controller.treeStatus),
);
// Черновик своего древа (синхронизация между устройствами)
personsRouter.get(
  "/tree/draft",
  requireAuth,
  asyncHandler(controller.getTreeDraft),
);
personsRouter.put(
  "/tree/draft",
  requireAuth,
  asyncHandler(controller.saveTreeDraft),
);
personsRouter.post(
  "/tree/publish",
  requireAuth,
  asyncHandler(controller.publish),
);
personsRouter.post(
  "/tree/unpublish",
  requireAuth,
  asyncHandler(controller.unpublish),
);
personsRouter.post(
  "/tree/reset",
  requireAuth,
  asyncHandler(controller.resetTree),
);
personsRouter.post(
  "/tree/bulk",
  requireAuth,
  asyncHandler(controller.bulkReplaceTree),
);

// Модерация общей базы (админы тейпа и супер-админ)
personsRouter.get(
  "/moderation/pending",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.pending),
);
personsRouter.get(
  "/moderation/edits",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.editOwners),
);
personsRouter.get(
  "/moderation/:ownerId/persons",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.pendingPersons),
);
personsRouter.post(
  "/moderation/:ownerId/approve",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.approve),
);
personsRouter.get(
  "/moderation/:ownerId/merge-candidates",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.mergeCandidates),
);
personsRouter.post(
  "/moderation/:ownerId/approve-with-merge",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.approveWithMerge),
);
personsRouter.post(
  "/moderation/:ownerId/reject",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.reject),
);
personsRouter.get(
  "/moderation/:ownerId/duplicates",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.duplicates),
);
personsRouter.get(
  "/moderation/:ownerId/changes",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.changes),
);
personsRouter.post(
  "/moderation/edit/:id/approve",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.approveEdit),
);
personsRouter.post(
  "/moderation/edit/:id/reject",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.rejectEdit),
);
personsRouter.post(
  "/moderation/merge",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.merge),
);

// Очередь предложений объединения древ
personsRouter.get(
  "/moderation/merge-suggestions",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.mergeSuggestions),
);
personsRouter.post(
  "/moderation/merge-suggestions/:id/merge",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.resolveMergeSuggestion),
);
personsRouter.post(
  "/moderation/merge-suggestions/:id/dismiss",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.dismissMergeSuggestion),
);

// Объединённые древа: очередь повторной модерации
personsRouter.get(
  "/moderation/tree-merges",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.pendingMerges),
);
personsRouter.post(
  "/moderation/tree-merges/:id/approve",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.approveMerge),
);
personsRouter.post(
  "/moderation/tree-merges/:id/reject",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.rejectMerge),
);

// Ручное объединение древ: сверка пары, поиск персон, слияние, отмена
personsRouter.get(
  "/moderation/merge-check",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.mergeCheck),
);
personsRouter.get(
  "/moderation/person-search",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.mergePersonSearch),
);
personsRouter.post(
  "/moderation/tree-merges/manual",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.manualMerge),
);
personsRouter.post(
  "/moderation/tree-merges/:id/unmerge",
  requireAuth,
  requireRole("teip_admin", "super_admin"),
  asyncHandler(controller.unmerge),
);

// Одна персона
personsRouter.get("/:id", asyncHandler(controller.getById));
personsRouter.get("/:id/family", asyncHandler(controller.family));

// Изменения — только авторизованным
personsRouter.post("/", requireAuth, asyncHandler(controller.create));
personsRouter.patch("/:id", requireAuth, asyncHandler(controller.update));

// Удаление — владелец своё древо, админы — любое (проверка владельца в сервисе)
personsRouter.delete("/:id", requireAuth, asyncHandler(controller.remove));
