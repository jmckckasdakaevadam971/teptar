import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Обёртка для async-роутов: пробрасывает ошибки в error-middleware,
 * избавляя от try/catch в каждом контроллере.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
