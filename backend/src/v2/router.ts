import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HttpError, zodMessage } from './errors.js';
import { authRouter } from './auth.routes.js';
import { backgroundRouter } from './background.routes.js';
import { catalogRouter } from './catalog.routes.js';
import { commitRouter } from './commit.routes.js';
import { historyRouter } from './history.routes.js';
import { nodesRouter } from './nodes.routes.js';
import { orderRouter } from './order.routes.js';
import { orgRouter } from './org.routes.js';
import { photosRouter } from './photos.routes.js';
import { standardsRouter } from './standards.routes.js';
import { workingcopyRouter } from './workingcopy.routes.js';

export const v2Router = Router();

v2Router.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: 'v2' });
});

v2Router.use('/auth', authRouter);
v2Router.use('/photos', photosRouter);
v2Router.use('/', backgroundRouter);
v2Router.use('/', catalogRouter);
v2Router.use('/', commitRouter);
v2Router.use('/', historyRouter);
v2Router.use('/', nodesRouter);
v2Router.use('/', orderRouter);
v2Router.use('/', orgRouter);
v2Router.use('/', standardsRouter);
v2Router.use('/', workingcopyRouter);

// v2 에러 매핑 (HttpError/Zod). 그 외는 전역 errorHandler 로 위임.
v2Router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details ?? null });
    return;
  }
  if (err instanceof ZodError) {
    /* 어느 칸이 왜 틀렸는지까지 문장에 담는다 — 화면은 `message` 를 그대로 띄우므로
       여기서 못 말하면 사람은 「요청 형식이 잘못되었습니다」만 보고 앞이 막힌다. */
    res.status(400).json({ error: 'BAD_REQUEST', message: zodMessage(err.issues), details: err.issues });
    return;
  }
  next(err);
});
