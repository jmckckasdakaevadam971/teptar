import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

/**
 * Отправка писем через SMTP. Настраивается переменными окружения:
 *   SMTP_HOST, SMTP_PORT (465 = TLS сразу, иначе STARTTLS),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM (адрес отправителя).
 *
 * Если SMTP_HOST не задан:
 *   - в development код просто пишется в лог сервера (удобно тестировать);
 *   - подтверждение почты в целом считается ВЫКЛЮЧЕННЫМ
 *     (см. emailVerificationEnabled) — регистрация работает без кода.
 */
export function emailVerificationEnabled(): boolean {
  return Boolean(env.smtpHost) || !env.isProd;
}

const transporter = env.smtpHost
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465 || env.smtpPort === 9465,
      auth: env.smtpUser
        ? { user: env.smtpUser, pass: env.smtpPass }
        : undefined,
      // Таймауты обязательны: если порт заблокирован хостером, без них
      // запрос висит минутами и клиент получает 504 от nginx.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : null;

/** Общая обёртка HTML-письма в фирменном стиле. */
function wrapHtml(body: string): string {
  return (
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">` +
    `<h2 style="color:#c9a227;margin:0 0 16px">Vorhda · Ворх Да</h2>` +
    body +
    `</div>`
  );
}

/** Экранировать пользовательский текст перед вставкой в HTML-письмо. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}

/** Письмо владельцу: древо прошло модерацию и опубликовано в общей базе. */
export async function sendTreeApprovedEmail(
  email: string,
  displayName: string,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «древо одобрено» для ${email}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Ваше древо опубликовано — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `Ваше семейное древо прошло проверку модератором и опубликовано ` +
      `в общей базе vorhda.ru.\n\n` +
      `Посмотреть его можно в каталоге древ: https://vorhda.ru/trees\n\n` +
      `Спасибо, что помогаете сохранять родовую память.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${displayName}</strong>!</p>` +
        `<p>Ваше семейное древо <strong style="color:#2e7d32">прошло проверку</strong> ` +
        `модератором и опубликовано в общей базе vorhda.ru.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/trees" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Открыть каталог древ</a></p>` +
        `<p style="color:#666">Спасибо, что помогаете сохранять родовую память.</p>`,
    ),
  });
}

/** Письмо владельцу: древо не прошло модерацию, возвращено в личное. */
export async function sendTreeRejectedEmail(
  email: string,
  displayName: string,
  reason?: string | null,
): Promise<void> {
  if (!transporter) {
    console.log(
      `[mailer] DEV: письмо «древо отклонено» для ${email}` +
        (reason ? ` (причина: ${reason})` : ""),
    );
    return;
  }

  const trimmedReason = reason?.trim() || null;
  const reasonText = trimmedReason
    ? `Комментарий модератора:\n${trimmedReason}\n\n`
    : "";
  const reasonHtml = trimmedReason
    ? `<p style="background:#faf6ec;border-left:4px solid #c9a227;padding:12px 16px;` +
      `border-radius:0 8px 8px 0;margin:16px 0"><strong>Комментарий модератора:</strong><br/>` +
      `${escapeHtml(trimmedReason)}</p>`
    : "";

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Ваше древо не прошло модерацию — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `К сожалению, ваше семейное древо не прошло проверку модератором ` +
      `и возвращено в личный режим.\n\n` +
      reasonText +
      `Вы можете исправить данные и отправить древо на модерацию повторно: ` +
      `https://vorhda.ru/my`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${displayName}</strong>!</p>` +
        `<p>К сожалению, ваше семейное древо <strong style="color:#c62828">не прошло ` +
        `проверку</strong> модератором и возвращено в личный режим.</p>` +
        reasonHtml +
        `<p>Вы можете исправить данные и отправить древо на модерацию повторно.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/my" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Открыть моё древо</a></p>`,
    ),
  });
}

/** Письмо заявителю: заявка «Стать хранителем» одобрена. */
export async function sendKeeperApprovedEmail(
  email: string,
  displayName: string,
  teipName: string,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «хранитель одобрен» для ${email}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Вы — хранитель тептара! — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `Ваша заявка одобрена — теперь вы хранитель тептара тейпа ${teipName} ` +
      `на vorhda.ru.\n\n` +
      `Вам открыт доступ к панели модерации: https://vorhda.ru/admin\n` +
      `Там вы будете проверять древа своего тейпа перед публикацией.\n\n` +
      `Спасибо, что помогаете сохранять родовую память.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${displayName}</strong>!</p>` +
        `<p>Ваша заявка одобрена — теперь вы <strong style="color:#2e7d32">хранитель ` +
        `тептара</strong> тейпа <strong>${teipName}</strong> на vorhda.ru.</p>` +
        `<p>Вам открыт доступ к панели модерации: там вы будете проверять ` +
        `древа своего тейпа перед публикацией.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/admin" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Открыть панель модерации</a></p>` +
        `<p style="color:#666">Спасибо, что помогаете сохранять родовую память.</p>`,
    ),
  });
}

/** Письмо заявителю: заявка «Стать хранителем» отклонена. */
export async function sendKeeperRejectedEmail(
  email: string,
  displayName: string,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «хранитель отклонён» для ${email}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Ваша заявка хранителя — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `К сожалению, сейчас мы не можем одобрить вашу заявку на роль ` +
      `хранителя тептара.\n\n` +
      `Вы можете дополнить рассказ о своих знаниях тейпа и подать заявку ` +
      `повторно: https://vorhda.ru/keepers/apply\n\n` +
      `Спасибо за желание помочь проекту.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${displayName}</strong>!</p>` +
        `<p>К сожалению, сейчас мы не можем одобрить вашу заявку на роль ` +
        `хранителя тептара.</p>` +
        `<p>Вы можете дополнить рассказ о своих знаниях тейпа и подать ` +
        `заявку повторно.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/keepers/apply" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Подать заявку ещё раз</a></p>` +
        `<p style="color:#666">Спасибо за желание помочь проекту.</p>`,
    ),
  });
}

/** Письмо владельцу древа: поступил запрос доступа к ветви. */
export async function sendBranchRequestEmail(
  email: string,
  ownerName: string,
  requesterName: string,
  personName: string,
  branchCount: number,
  comment?: string | null,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «запрос доступа к ветви» для ${email}`);
    return;
  }

  const trimmed = comment?.trim() || null;
  const commentText = trimmed ? `Комментарий:\n${trimmed}\n\n` : "";
  const commentHtml = trimmed
    ? `<p style="background:#faf6ec;border-left:4px solid #c9a227;padding:12px 16px;` +
      `border-radius:0 8px 8px 0;margin:16px 0"><strong>Комментарий:</strong><br/>` +
      `${escapeHtml(trimmed)}</p>`
    : "";

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Запрос доступа к ветви вашей родословной — Vorhda",
    text:
      `Здравствуйте, ${ownerName}!\n\n` +
      `Пользователь ${requesterName} просит доступ к ветви вашей родословной, ` +
      `начинающейся с «${personName}» (людей в ветви: ${branchCount}).\n\n` +
      commentText +
      `Рассмотреть запрос можно в личном кабинете: https://vorhda.ru/my\n` +
      `Если вы предоставите доступ, пользователь сможет предлагать правки ` +
      `только по этой ветви; изменения применяются после проверки модератором.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${escapeHtml(ownerName)}</strong>!</p>` +
        `<p>Пользователь <strong>${escapeHtml(requesterName)}</strong> просит доступ ` +
        `к ветви вашей родословной, начинающейся с ` +
        `<strong>«${escapeHtml(personName)}»</strong> (людей в ветви: ${branchCount}).</p>` +
        commentHtml +
        `<p>Если вы предоставите доступ, пользователь сможет предлагать правки только ` +
        `по этой ветви; изменения применяются после проверки модератором.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/my" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Рассмотреть запрос</a></p>`,
    ),
  });
}

/** Письмо запросившему: владелец предоставил доступ к ветви. */
export async function sendBranchApprovedEmail(
  email: string,
  displayName: string,
  personName: string,
  treeRootId: number,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «доступ к ветви предоставлен» для ${email}`);
    return;
  }

  const url = `https://vorhda.ru/trees/${treeRootId}`;
  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Вам предоставлен доступ к ветви родословной — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `Владелец родословной предоставил вам доступ к ветви, начинающейся ` +
      `с «${personName}».\n\n` +
      `Откройте древо и нажмите «Редактировать ветвь»: ${url}\n\n` +
      `Ваши правки будут применены после проверки модератором.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${escapeHtml(displayName)}</strong>!</p>` +
        `<p>Владелец родословной <strong style="color:#2e7d32">предоставил вам доступ</strong> ` +
        `к ветви, начинающейся с <strong>«${escapeHtml(personName)}»</strong>.</p>` +
        `<p>Откройте древо и нажмите «Редактировать ветвь». Ваши правки будут ` +
        `применены после проверки модератором.</p>` +
        `<p style="margin:24px 0"><a href="${url}" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Открыть древо</a></p>`,
    ),
  });
}

/** Письмо запросившему: владелец отклонил запрос доступа к ветви. */
export async function sendBranchRejectedEmail(
  email: string,
  displayName: string,
  personName: string,
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «доступ к ветви отклонён» для ${email}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: "Запрос доступа к ветви отклонён — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `К сожалению, владелец родословной отклонил ваш запрос доступа к ветви, ` +
      `начинающейся с «${personName}».\n\n` +
      `Вы можете связаться с владельцем или отправить новый запрос позже.`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${escapeHtml(displayName)}</strong>!</p>` +
        `<p>К сожалению, владелец родословной <strong style="color:#c62828">отклонил</strong> ` +
        `ваш запрос доступа к ветви, начинающейся с ` +
        `<strong>«${escapeHtml(personName)}»</strong>.</p>` +
        `<p style="color:#666">Вы можете связаться с владельцем или отправить новый запрос позже.</p>`,
    ),
  });
}

/** Отправить код подтверждения на почту. */
export async function sendVerificationCode(
  email: string,
  code: string,
): Promise<void> {
  if (!transporter) {
    // Dev-режим: письмо не шлём, код виден в логе бэкенда.
    console.log(`[mailer] DEV: код подтверждения для ${email}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    replyTo: env.smtpReplyTo,
    to: email,
    subject: `${code} — код подтверждения Vorhda`,
    text:
      `Ваш код подтверждения регистрации на vorhda.ru: ${code}\n\n` +
      `Код действует 15 минут. Если вы не регистрировались — просто проигнорируйте это письмо.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">` +
      `<h2 style="color:#c9a227;margin:0 0 16px">Vorhda · Ворх Да</h2>` +
      `<p>Ваш код подтверждения регистрации:</p>` +
      `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>` +
      `<p style="color:#666">Код действует 15 минут. Если вы не регистрировались на vorhda.ru — просто проигнорируйте это письмо.</p>` +
      `</div>`,
  });
}
