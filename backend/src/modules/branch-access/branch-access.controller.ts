import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import { createBranchRequestSchema } from "./branch-access.types.js";
import * as service from "./branch-access.service.js";
import {
  sendBranchRequestEmail,
  sendBranchApprovedEmail,
  sendBranchRejectedEmail,
} from "../auth/mailer.js";

/** Создать запрос доступа к ветви; владельцу уходит письмо (фоново). */
export async function create(req: Request, res: Response): Promise<void> {
  const input = createBranchRequestSchema.parse(req.body);
  const created = await service.createRequest(req.user!.userId, input);

  if (created.owner_email) {
    const email = created.owner_email;
    void sendBranchRequestEmail(
      email,
      created.owner_name,
      created.requester_name,
      created.person_name,
      created.branch_count,
      created.request.comment,
    ).catch((err) => {
      console.error(
        "[branch-access] не удалось отправить письмо владельцу:",
        err instanceof Error ? err.message : err,
      );
    });
  }

  res.status(201).json(ok(created.request));
}

/** Входящие запросы владельцу (ожидают решения). */
export async function incoming(req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listIncoming(req.user!.userId)));
}

/** Мои исходящие запросы. */
export async function mine(req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listMine(req.user!.userId)));
}

/** Фоново уведомить запросившего о решении — ошибки почты не ломают ответ. */
function notifyRequester(
  decision: "approved" | "rejected",
  resolved: Awaited<ReturnType<typeof service.resolveRequest>>,
): void {
  void (async () => {
    if (!resolved.requester_email) return;
    if (decision === "approved") {
      await sendBranchApprovedEmail(
        resolved.requester_email,
        resolved.requester_name,
        resolved.person_name,
        resolved.tree_root_id,
      );
    } else {
      await sendBranchRejectedEmail(
        resolved.requester_email,
        resolved.requester_name,
        resolved.person_name,
      );
    }
  })().catch((err) => {
    console.error(
      `[branch-access] не удалось отправить письмо (${decision}):`,
      err instanceof Error ? err.message : err,
    );
  });
}

/** Владелец предоставляет доступ к ветви. */
export async function approve(req: Request, res: Response): Promise<void> {
  const resolved = await service.resolveRequest(
    Number(req.params.id),
    req.user!.userId,
    "approved",
  );
  notifyRequester("approved", resolved);
  res.json(ok({ approved: true }));
}

/** Владелец отклоняет запрос. */
export async function reject(req: Request, res: Response): Promise<void> {
  const resolved = await service.resolveRequest(
    Number(req.params.id),
    req.user!.userId,
    "rejected",
  );
  notifyRequester("rejected", resolved);
  res.json(ok({ rejected: true }));
}

/** Права текущего пользователя на древе: владелец / одобренные ветви. */
export async function myGrant(req: Request, res: Response): Promise<void> {
  const rootId = Number(req.params.rootId);
  res.json(ok(await service.getMyGrant(req.user!.userId, rootId)));
}
