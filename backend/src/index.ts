import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v2Router } from './v2/router.js';

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
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[500]', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: '서버 오류가 발생했습니다.',
  });
});

// Last-resort safety net
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const port = parseInt(process.env.PORT ?? '3000', 10);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`  Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

export default app;
