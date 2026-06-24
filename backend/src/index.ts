import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { substationsRouter } from './routes/substations.routes.js';
import { floorsRouter } from './routes/floors.routes.js';
import { equipmentRouter } from './routes/equipment.routes.js';
import { organizationRouter } from './routes/organization.routes.js';
import { cablesRouter } from './routes/cables.routes.js';
import { cableCategoriesRouter } from './routes/cableCategories.routes.js';
import { rackModuleCategoriesRouter } from './routes/rackModuleCategories.routes.js';
import { rackModulesRouter } from './routes/rackModules.routes.js';
import { rackPresetsRouter } from './routes/rackPresets.routes.js';
import { bomMaterialsRouter } from './routes/bomMaterials.routes.js';
import { statsRouter } from './routes/stats.routes.js';
import { assetTypesRouter } from './routes/assetTypes.routes.js';
import { assetCategoriesRouter } from './routes/assetCategories.routes.js';
import { assetsRouter } from './routes/assets.routes.js';
import { nodesRouter } from './routes/nodes.routes.js';
import { uploadsRouter } from './routes/uploads.routes.js';
import { assetRecordSchemaRouter } from './routes/assetRecordSchema.routes.js';
import { commitRouter } from './routes/commit.routes.js';

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
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Body parsing.
// PUT /plan 은 도면 전체 (설비 + 케이블 + 랙 모듈 + DWG background drawing JSON)
// 를 하나의 트랜잭션으로 받기 때문에 express 기본 100KB 한계에 쉽게 걸린다.
// DWG layer/entity 메타가 큰 도면을 고려해 50MB 까지 허용.
// MUST match the nginx client_max_body_size in frontend/nginx.conf.
// dev 에는 nginx 가 없어 이 한도가 곧 상한이지만, prod 는 nginx → express
// 2단이라 둘 중 작은 쪽이 상한이 된다. 두 값을 항상 같이 올릴 것.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression
app.use(compression());

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/substations', substationsRouter);
app.use('/api/floors', floorsRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/cables', cablesRouter);
// 카테고리/프리셋/BOM 자재 라우트 (P7) — MaterialCategory/Material 폐기 후 신규 분리.
app.use('/api/cable-categories', cableCategoriesRouter);
app.use('/api/rack-module-categories', rackModuleCategoriesRouter);
app.use('/api/rack-modules', rackModulesRouter);
app.use('/api/rack-presets', rackPresetsRouter);
app.use('/api/bom-materials', bomMaterialsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/asset-types', assetTypesRouter);
app.use('/api/asset-categories', assetCategoriesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/asset-record-schema', assetRecordSchemaRouter);
app.use('/api/commit', commitRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: '요청한 리소스를 찾을 수 없습니다.',
  });
});

// Error handler
app.use(errorHandler);

// Last-resort safety net: a single async error inside a request handler
// (eg. WASM init failure in dwgImport, or any uncaught throw in a Promise
// chain not covered by Express's errorHandler) used to abort the whole
// process — `--restart unless-stopped` then re-ran prisma migrate+seed
// each cycle, looking like a server-wide crash. Log and keep serving.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// Start server
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export default app;
