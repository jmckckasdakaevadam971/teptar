/**
 * Унифицированный формат ошибки API.
 * Бросайте `throw new ApiError(404, 'Не найдено')` в сервисах.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Успешный ответ в едином конверте. */
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}
