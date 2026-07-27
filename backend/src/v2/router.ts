import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './errors.js';
import { catalogRouter } from './catalog.routes.js';
import { commitRouter } from './commit.routes.js';
import { orgRouter } from './org.routes.js';
import { workingcopyRouter } from './workingcopy.routes.js';

export const v2Router = Router();

v2Router.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: 'v2' });
});

v2Router.use('/catalog', catalogRouter);
v2Router.use('/', orgRouter);
v2Router.use('/', workingcopyRouter);
v2Router.use('/', commitRouter);

// v2 에러 매핑 (HttpError/Zod). 그 외는 전역 errorHandler 로 위임.
v2Router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details ?? null });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'BAD_REQUEST', message: '요청 형식이 잘못되었습니다', details: err.issues });
    return;
  }
  next(err);
});
