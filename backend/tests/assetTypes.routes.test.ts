import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { assetTypesRouter } from '../src/routes/assetTypes.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { generateAccessToken } from '../src/utils/jwt.js';
import { assetTypeService } from '../src/services/assetType.service.js';

vi.mock('../src/services/assetType.service.js', () => ({
  assetTypeService: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), getAll: vi.fn(), getById: vi.fn() },
}));

const app = express();
app.use(express.json());
app.use('/api/asset-types', assetTypesRouter);
app.use(errorHandler);

const tokenFor = (role: string) =>
  generateAccessToken({ userId: 'u1', username: 'tester', role });

describe('asset-types 라우트 권한', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('비ADMIN 의 POST 는 403', async () => {
    const res = await request(app).post('/api/asset-types')
      .set('Authorization', `Bearer ${tokenFor('USER')}`)
      .send({ name: '새장치' });
    expect(res.status).toBe(403);
    expect(assetTypeService.create).not.toHaveBeenCalled();
  });

  it('ADMIN 의 POST 는 categoryId 와 함께 서비스로 전달된다', async () => {
    vi.mocked(assetTypeService.create).mockResolvedValue({ id: 'x' } as any);
    const res = await request(app).post('/api/asset-types')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: '새장치', categoryId: '11111111-1111-1111-1111-111111111111' });
    expect(res.status).toBe(201);
    expect(assetTypeService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '새장치', categoryId: '11111111-1111-1111-1111-111111111111' }),
    );
  });
});
