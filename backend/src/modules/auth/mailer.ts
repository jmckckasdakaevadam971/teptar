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
      secure: env.smtpPort === 465,
      auth: env.smtpUser
        ? { user: env.smtpUser, pass: env.smtpPass }
        : undefined,
    })
  : null;

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
