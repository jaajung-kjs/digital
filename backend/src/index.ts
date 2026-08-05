import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v2Router } from './v2/router.js';
import { log, errorFields, requestLogger } from './v2/log.js';

const app = express();

// Security middleware. We deploy over plain HTTP on the air-gapped intranet,
// so disable HSTS and CSP's `upgrade-insecure-requests` — both ask the
// browser to switch every subsequent request to HTTPS, which then hangs on
// SYN to port 443 (no TLS listener), accumulates half-open connections in
// conntrack, and ends up taking the host network down (even ssh).
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'upgrade-insecure-requests': null },
    },
  }),
);

const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);

// Body parsing (limit matches nginx client_max_body_size in frontend/nginx.conf)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 요청 로그 — 라우팅보다 먼저 걸어야 404 도 남는다.
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// v2 API
app.use('/api/v2', v2Router);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: '요청한 리소스를 찾을 수 없습니다.',
  });
});

// Fallback 500 handler (catches errors that v2 router passes via next(err))
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // 같은 requestId 의 request 로그와 짝지어 보면 어느 요청이 터졌는지 바로 나온다.
  log.error('unhandled', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    userId: req.user?.userId ?? null,
    ...errorFields(err),
  });
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: '서버 오류가 발생했습니다.',
  });
});

// Last-resort safety net
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', errorFields(err));
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', errorFields(reason));
});

const port = parseInt(process.env.PORT ?? '3000', 10);
app.listen(port, () => {
  log.info('server.start', { port, env: process.env.NODE_ENV ?? 'development' });
});

export default app;
