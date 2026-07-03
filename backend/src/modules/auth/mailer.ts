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
): Promise<void> {
  if (!transporter) {
    console.log(`[mailer] DEV: письмо «древо отклонено» для ${email}`);
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Ваше древо не прошло модерацию — Vorhda",
    text:
      `Здравствуйте, ${displayName}!\n\n` +
      `К сожалению, ваше семейное древо не прошло проверку модератором ` +
      `и возвращено в личный режим.\n\n` +
      `Вы можете исправить данные и отправить древо на модерацию повторно: ` +
      `https://vorhda.ru/my`,
    html: wrapHtml(
      `<p>Здравствуйте, <strong>${displayName}</strong>!</p>` +
        `<p>К сожалению, ваше семейное древо <strong style="color:#c62828">не прошло ` +
        `проверку</strong> модератором и возвращено в личный режим.</p>` +
        `<p>Вы можете исправить данные и отправить древо на модерацию повторно.</p>` +
        `<p style="margin:24px 0"><a href="https://vorhda.ru/my" ` +
        `style="background:#c9a227;color:#0c0a07;padding:12px 24px;border-radius:8px;` +
        `text-decoration:none;font-weight:bold">Открыть моё древо</a></p>`,
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
