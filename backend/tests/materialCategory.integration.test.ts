import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { materialCategoriesRouter } from '../src/routes/materialCategories.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - MaterialCategory API
 * Tests GET operations for material categories (63 seeded records)
 */
describe('MaterialCategory API Integration Tests', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/material-categories', materialCategoriesRouter);
    app.use(errorHandler);

    // Login to get admin token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    adminToken = loginResponse.body.accessToken;
    console.log('🔧 MaterialCategory integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 MaterialCategory integration test cleanup completed');
  });

  describe('GET /api/material-categories', () => {
    it('should return all active categories', async () => {
      const response = await request(app)
        .get('/api/material-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(63);
    });

    it('should filter by type=CABLE and return 16 categories', async () => {
      const response = await request(app)
        .get('/api/material-categories?type=CABLE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(16);
      expect(response.body.every((c: any) => c.categoryType === 'CABLE')).toBe(true);
    });

    it('should filter by type=EQUIPMENT and return 13 categories', async () => {
      const response = await request(app)
        .get('/api/material-categories?type=EQUIPMENT')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(13);
    });

    it('should filter by type=ACCESSORY and return 34 categories', async () => {
      const response = await request(app)
        .get('/api/material-categories?type=ACCESSORY')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(34);
    });

    it('should filter top-level only with parentId=null', async () => {
      const response = await request(app)
        .get('/api/material-categories?parentId=null')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.every((c: any) => c.parentId === null)).toBe(true);
      // 16 cable + 13 equipment + 9 accessory parent = 38
      expect(response.body.length).toBe(38);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get('/api/material-categories')
        .expect(401);
    });
  });

  describe('GET /api/material-categories/by-type/:type', () => {
    it('should return CABLE categories (flat, no parent hierarchy)', async () => {
      const response = await request(app)
        .get('/api/material-categories/by-type/CABLE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(16);
      // Cable categories have no children
      response.body.forEach((cat: any) => {
        expect(cat.children).toBeDefined();
      });
    });

    it('should return ACCESSORY categories with children hierarchy', async () => {
      const response = await request(app)
        .get('/api/material-categories/by-type/ACCESSORY')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 9 parent categories
      expect(response.body.length).toBe(9);

      // ACC-PIPE should have 5 children
      const pipe = response.body.find((c: any) => c.code === 'ACC-PIPE');
      expect(pipe).toBeDefined();
      expect(pipe.children.length).toBe(5);

      // ACC-CONN should have 4 children
      const conn = response.body.find((c: any) => c.code === 'ACC-CONN');
      expect(conn).toBeDefined();
      expect(conn.children.length).toBe(4);
    });

    it('should return EQUIPMENT categories', async () => {
      const response = await request(app)
        .get('/api/material-categories/by-type/EQUIPMENT')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(13);
    });
  });

  describe('GET /api/material-categories/:id', () => {
    it('should return single category with children and aliases', async () => {
      // First get a category to obtain its ID
      const listResponse = await request(app)
        .get('/api/material-categories?type=CABLE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const utpCategory = listResponse.body.find((c: any) => c.code === 'CBL-UTP');
      expect(utpCategory).toBeDefined();

      const response = await request(app)
        .get(`/api/material-categories/${utpCategory.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.code).toBe('CBL-UTP');
      expect(response.body.name).toBe('UTP/S-FTP케이블');
      expect(response.body.specTemplate).toBeDefined();
      expect(response.body.specTemplate.params).toHaveLength(3);
      expect(response.body.specTemplate.format).toBe('{shield} CAT.{cat} {pairs}P');
      expect(response.body.children).toBeDefined();
      expect(response.body.aliases).toBeDefined();
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app)
        .get('/api/material-categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
