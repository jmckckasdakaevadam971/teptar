import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import {
  createPersonSchema,
  updatePersonSchema,
  listPersonsSchema,
  publishTreeSchema,
  publicTreesSchema,
  mergeSchema,
  resolveMergeSchema,
  bulkTreeSchema,
} from "./persons.types.js";
import * as service from "./persons.service.js";
import type { Viewer } from "./persons.service.js";
import {
  sendTreeApprovedEmail,
  sendTreeRejectedEmail,
} from "../auth/mailer.js";

/**
 * Фоново уведомить владельца древа о результате модерации.
 * Ошибки отправки не должны ломать ответ модератору — только лог.
 */
function notifyOwnerModeration(
  ownerId: number,
  kind: "approved" | "rejected",
): void {
  void (async () => {
    const owner = await service.getOwnerContact(ownerId);
    if (!owner?.email) return; // регистрация по телефону — почты нет
    if (kind === "approved") {
      await sendTreeApprovedEmail(owner.email, owner.display_name);
    } else {
      await sendTreeRejectedEmail(owner.email, owner.display_name);
    }
  })().catch((err) => {
    console.error(
      `[moderation] не удалось отправить письмо (${kind}) владельцу ${ownerId}:`,
      err instanceof Error ? err.message : err,
    );
  });
}

/** Извлечь зрителя из запроса (для контроля видимости). */
function viewerOf(req: Request): Viewer {
  return { userId: req.user?.userId ?? null, role: req.user?.role ?? null };
}

export async function list(req: Request, res: Response): Promise<void> {
  const params = listPersonsSchema.parse(req.query);
  const persons = await service.listPersons(params, viewerOf(req));
  res.json(ok(persons, { limit: params.limit, offset: params.offset }));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const person = await service.getPerson(Number(req.params.id), viewerOf(req));
  res.json(ok(person));
}

export async function family(req: Request, res: Response): Promise<void> {
  const data = await service.getFamily(Number(req.params.id), viewerOf(req));
  res.json(ok(data));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createPersonSchema.parse(req.body);
  const person = await service.createPerson(input, viewerOf(req));
  res.status(201).json(ok(person));
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updatePersonSchema.parse(req.body);
  const person = await service.updatePerson(
    Number(req.params.id),
    input,
    viewerOf(req),
  );
  res.json(ok(person));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deletePerson(Number(req.params.id), viewerOf(req));
  res.status(204).end();
}

// ── Публикация своего древа ──────────────────────────────────────────────

export async function treeStatus(req: Request, res: Response): Promise<void> {
  const status = await service.getTreeStatus(req.user!.userId);
  res.json(ok(status));
}

export async function publish(req: Request, res: Response): Promise<void> {
  const { mode, cutoff_year } = publishTreeSchema.parse(req.body);
  const result = await service.publishTree(req.user!.userId, mode, cutoff_year);
  res.json(ok(result));
}

export async function unpublish(req: Request, res: Response): Promise<void> {
  const result = await service.unpublishTree(req.user!.userId);
  res.json(ok(result));
}

export async function resetTree(req: Request, res: Response): Promise<void> {
  const result = await service.clearMyTree(req.user!.userId);
  res.json(ok(result));
}

export async function bulkReplaceTree(
  req: Request,
  res: Response,
): Promise<void> {
  const { persons } = bulkTreeSchema.parse(req.body);
  const result = await service.replaceTree(req.user!.userId, persons);
  // Автопоиск совпадений с чужими древами — фоново, не блокируем ответ.
  service
    .generateMergeSuggestionsForOwner(req.user!.userId)
    .catch(() => undefined);
  res.json(ok(result));
}

// ── Модерация (teip_admin / super_admin) ─────────────────────────────────

export async function pending(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  const trees = await service.listPendingTrees(teipIds);
  res.json(ok(trees));
}

export async function editOwners(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  const owners = await service.listEditOwners(teipIds);
  res.json(ok(owners));
}

export async function pendingPersons(
  req: Request,
  res: Response,
): Promise<void> {
  const persons = await service.getPendingPersons(Number(req.params.ownerId));
  res.json(ok(persons));
}

export async function approve(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertOwnerInTeips(Number(req.params.ownerId), teipIds);
  const result = await service.approveTree(
    Number(req.params.ownerId),
    req.user!.userId,
  );
  // После одобрения сверяем древо с уже одобренными — фоново.
  service
    .generateMergeSuggestionsForOwner(Number(req.params.ownerId))
    .catch(() => undefined);
  // Уведомляем владельца на почту — фоново, не задерживая ответ.
  notifyOwnerModeration(Number(req.params.ownerId), "approved");
  res.json(ok(result));
}

export async function reject(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertOwnerInTeips(Number(req.params.ownerId), teipIds);
  const result = await service.rejectTree(
    Number(req.params.ownerId),
    req.user!.userId,
  );
  notifyOwnerModeration(Number(req.params.ownerId), "rejected");
  res.json(ok(result));
}

// ── Каталог опубликованных древ (публично) ──────────────────────

export async function publicTrees(req: Request, res: Response): Promise<void> {
  const params = publicTreesSchema.parse(req.query);
  const trees = await service.listPublicTrees(params);
  res.json(ok(trees));
}

// ── Дубли и объединение (модератор) ──────────────────────────

export async function duplicates(req: Request, res: Response): Promise<void> {
  const pairs = await service.findOwnerDuplicates(Number(req.params.ownerId));
  res.json(ok(pairs));
}

export async function changes(req: Request, res: Response): Promise<void> {
  const list = await service.getTreeChanges(Number(req.params.ownerId));
  res.json(ok(list));
}

export async function approveEdit(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertPersonInTeips(Number(req.params.id), teipIds);
  const person = await service.approveEdit(
    Number(req.params.id),
    req.user!.userId,
  );
  res.json(ok(person));
}

export async function rejectEdit(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertPersonInTeips(Number(req.params.id), teipIds);
  const result = await service.rejectEdit(
    Number(req.params.id),
    req.user!.userId,
  );
  res.json(ok(result));
}

export async function merge(req: Request, res: Response): Promise<void> {
  const { keep_id, drop_id } = mergeSchema.parse(req.body);
  const result = await service.mergePersons(keep_id, drop_id, req.user!.userId);
  res.json(ok(result));
}

// ── Очередь предложений объединения древ (модератор) ──────────

export async function mergeSuggestions(
  req: Request,
  res: Response,
): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  const list = await service.listMergeSuggestions(teipIds);
  res.json(ok(list));
}

export async function resolveMergeSuggestion(
  req: Request,
  res: Response,
): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertSuggestionInTeips(Number(req.params.id), teipIds);
  const { keep_id, full_name, birth_year, death_year, note } =
    resolveMergeSchema.parse(req.body);
  const result = await service.resolveMergeSuggestion(
    Number(req.params.id),
    keep_id,
    req.user!.userId,
    { full_name, birth_year, death_year, note },
  );
  res.json(ok(result));
}

export async function dismissMergeSuggestion(
  req: Request,
  res: Response,
): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertSuggestionInTeips(Number(req.params.id), teipIds);
  const result = await service.dismissMergeSuggestion(
    Number(req.params.id),
    req.user!.userId,
  );
  res.json(ok(result));
}

// ── Объединённые древа: очередь повторной модерации и каталог ──────────

export async function pendingMerges(
  req: Request,
  res: Response,
): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  const list = await service.listPendingMerges(teipIds);
  res.json(ok(list));
}

export async function approveMerge(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertTreeMergeInTeips(Number(req.params.id), teipIds);
  const result = await service.approveMerge(
    Number(req.params.id),
    req.user!.userId,
  );
  res.json(ok(result));
}

export async function rejectMerge(req: Request, res: Response): Promise<void> {
  const teipIds = await service.getModeratorTeipIds(viewerOf(req));
  await service.assertTreeMergeInTeips(Number(req.params.id), teipIds);
  const result = await service.rejectMerge(
    Number(req.params.id),
    req.user!.userId,
  );
  res.json(ok(result));
}

export async function publicMerges(
  _req: Request,
  res: Response,
): Promise<void> {
  const list = await service.listApprovedMerges();
  res.json(ok(list));
}
