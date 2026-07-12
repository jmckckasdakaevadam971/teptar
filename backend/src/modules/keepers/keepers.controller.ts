import type { Request, Response } from "express";
import { z } from "zod";
import { ok } from "../../utils/http.js";
import { applyKeeperSchema } from "./keepers.types.js";
import * as service from "./keepers.service.js";
import {
  sendKeeperApprovedEmail,
  sendKeeperRejectedEmail,
} from "../auth/mailer.js";

/** Публичный список хранителей. */
export async function list(_req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listKeepers()));
}

/** Мой статус: хранитель / заявка / ничего. */
export async function my(req: Request, res: Response): Promise<void> {
  res.json(ok(await service.getMyKeeperStatus(req.user!.userId)));
}

/** Подать заявку «Стать хранителем». */
export async function apply(req: Request, res: Response): Promise<void> {
  const input = applyKeeperSchema.parse(req.body);
  const app = await service.applyKeeper(req.user!.userId, input);
  res.status(201).json(ok(app));
}

/** Очередь заявок (супер-админ). */
export async function applications(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json(ok(await service.listApplications()));
}

/** Фоново уведомить заявителя о решении — ошибки почты не ломают ответ. */
function notifyApplicant(
  kind: "approved" | "rejected",
  app: { email: string | null; display_name: string; teip_name: string },
): void {
  void (async () => {
    if (!app.email) return;
    if (kind === "approved") {
      await sendKeeperApprovedEmail(app.email, app.display_name, app.teip_name);
    } else {
      await sendKeeperRejectedEmail(app.email, app.display_name);
    }
  })().catch((err) => {
    console.error(
      `[keepers] не удалось отправить письмо (${kind}):`,
      err instanceof Error ? err.message : err,
    );
  });
}

/** Одобрить заявку (супер-админ). */
export async function approve(req: Request, res: Response): Promise<void> {
  const app = await service.approveApplication(
    Number(req.params.id),
    req.user!.userId,
  );
  notifyApplicant("approved", app);
  res.json(ok({ approved: true }));
}

/** Добавить тейп из заявки в справочник (супер-админ). */
const createTeipSchema = z.object({
  tukhum_id: z.coerce.number().int().positive().nullable().optional(),
});

export async function createTeip(req: Request, res: Response): Promise<void> {
  const input = createTeipSchema.parse(req.body ?? {});
  const result = await service.createTeipFromApplication(
    Number(req.params.id),
    req.user!.userId,
    input.tukhum_id ?? null,
  );
  res.json(ok(result));
}

/** Отклонить заявку (супер-админ). */
export async function reject(req: Request, res: Response): Promise<void> {
  const app = await service.rejectApplication(
    Number(req.params.id),
    req.user!.userId,
  );
  notifyApplicant("rejected", app);
  res.json(ok({ rejected: true }));
}
