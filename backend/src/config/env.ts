import dotenv from "dotenv";

dotenv.config();

/**
 * Централизованная и провалидированная конфигурация окружения.
 * Если обязательной переменной нет — падаем на старте, а не в рантайме.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Переменная окружения ${name} не задана`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET", "dev-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  // Cloudflare Turnstile (проверка на бота). Оба необязательны:
  // пустой secret → проверка отключена. site key отдаётся фронту
  // через GET /api/auth/config (публичный, можно менять без пересборки).
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
  turnstileSecret: process.env.TURNSTILE_SECRET ?? "",

  // SMTP для писем подтверждения почты. Пустой SMTP_HOST в проде →
  // подтверждение отключено (регистрация сразу). В dev без SMTP код пишется в лог.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "Vorhda <info@vorhda.ru>",
  // Куда уходят ответы на письма сайта (реальный ящик, в отличие от from).
  smtpReplyTo: process.env.SMTP_REPLY_TO ?? "vorhda@yandex.com",
} as const;
