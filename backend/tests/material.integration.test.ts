import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { materialsRouter } from '../src/routes/materials.routes.js';
import { materialCategoriesRouter } from '../src/routes/materialCategories.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Material API
 * Tests POST /resolve (on-demand creation) and GET /materials
 */
describe('Material API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let utpCategoryId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/material-categories', materialCategoriesRouter);
    app.use('/api/materials', materialsRouter);
    app.use(errorHandler);

    // Login
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    adminToken = loginResponse.body.accessToken;

    // Get UTP category ID
    const catResponse = await request(app)
      .get('/api/material-categories?type=CABLE')
      .set('Authorization', `Bearer ${adminToken}`);

    const utpCat = catResponse.body.data.find((c: any) => c.code === 'CBL-UTP');
    utpCategoryId = utpCat.id;

    console.log('🔧 Material integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Material integration test cleanup completed');
  });

  describe('POST /api/materials/resolve', () => {
    it('should resolve material (create or reuse)', async () => {
      const response = await request(app)
        .post('/api/materials/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: utpCategoryId,
          specParams: { shield: 'UTP', cat: '6', pairs: 4 },
        })
        .expect(200);

      expect(response.body.data.specification).toBe('UTP CAT.6 4P');
      expect(response.body.data.name).toBe('UTP CAT.6 4P');
      expect(response.body.data.unit).toBe('m');
      expect(typeof response.body.data.created).toBe('boolean');
      expect(response.body.data.categoryId).toBe(utpCategoryId);
    });

    it('should return existing material on duplicate resolve', async () => {
      const response = await request(app)
        .post('/api/materials/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: utpCategoryId,
          specParams: { shield: 'UTP', cat: '6', pairs: 4 },
        })
        .expect(200);

      expect(response.body.data.specification).toBe('UTP CAT.6 4P');
      expect(response.body.data.created).toBe(false);
    });

    it('should resolve different material for different spec', async () => {
      const response = await request(app)
        .post('/api/materials/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: utpCategoryId,
          specParams: { shield: 'S-FTP', cat: '6A', pairs: 4 },
        })
        .expect(200);

      expect(response.body.data.specification).toBe('S-FTP CAT.6A 4P');
      expect(typeof response.body.data.created).toBe('boolean');
    });

    it('should return 404 for non-existent categoryId', async () => {
      await request(app)
        .post('/api/materials/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: '00000000-0000-0000-0000-000000000000',
          specParams: { shield: 'UTP', cat: '6', pairs: 4 },
        })
        .expect(404);
    });

    it('should return 400 for invalid body', async () => {
      await request(app)
        .post('/api/materials/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ categoryId: 'not-a-uuid' })
        .expect(400);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .post('/api/materials/resolve')
        .send({
          categoryId: utpCategoryId,
          specParams: { shield: 'UTP', cat: '6', pairs: 4 },
        })
        .expect(401);
    });
  });

  describe('GET /api/materials', () => {
    it('should return materials for a category', async () => {
      const response = await request(app)
        .get(`/api/materials?categoryId=${utpCategoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      // Should have the 2 materials we created above
      const specs = response.body.data.map((m: any) => m.specification);
      expect(specs).toContain('UTP CAT.6 4P');
      expect(specs).toContain('S-FTP CAT.6A 4P');
    });
  });
});
