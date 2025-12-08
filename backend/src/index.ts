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
import { floorPlansRouter } from './routes/floorPlans.routes.js';
import { floorPlanElementsRouter } from './routes/floorPlanElements.routes.js';
import { racksRouter } from './routes/racks.routes.js';
import { equipmentRouter } from './routes/equipment.routes.js';
import { portsRouter } from './routes/ports.routes.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/substations', substationsRouter);
app.use('/api/floors', floorsRouter);
app.use('/api/floor-plans', floorPlansRouter);
app.use('/api/floor-plan-elements', floorPlanElementsRouter);
app.use('/api/racks', racksRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/ports', portsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: '요청한 리소스를 찾을 수 없습니다.',
  });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export default app;
