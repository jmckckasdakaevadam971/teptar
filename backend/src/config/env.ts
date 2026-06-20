import dotenv from 'dotenv';

dotenv.config();

/**
 * Централизованная и провалидированная конфигурация окружения.
 * Если обязательной переменной нет — падаем на старте, а не в рантайме.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Переменная окружения ${name} не задана`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET', 'dev-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  corsOrigin: process.env.CORS_ORIGIN ?? '*',
} as const;
