import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { floorPlansRouter } from '../src/routes/floorPlans.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Floor Plan API
 * Tests complete CRUD operations for floor plans
 */
describe('Floor Plan API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let testFloorId: string;
  let testFloorPlanId: string;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api', floorPlansRouter);
    app.use(errorHandler);

    // Login to get admin token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin1234',
      });

    adminToken = loginResponse.body.accessToken;

    // Get a test floor ID from existing data
    // Note: In a real test, you would create a test floor first
    testFloorId = 'test-floor-id'; // This should be replaced with actual floor ID from your test setup

    console.log('🔧 Floor Plan integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Floor Plan integration test cleanup completed');
  });

  describe('POST /api/floors/:floorId/floor-plan', () => {
    it('should create a new floor plan with default values', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Floor Plan',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'Test Floor Plan');
      expect(response.body).toHaveProperty('canvasWidth');
      expect(response.body).toHaveProperty('canvasHeight');
      expect(response.body).toHaveProperty('gridSize');
      expect(response.body.elements).toHaveLength(0);
      expect(response.body.racks).toHaveLength(0);

      testFloorPlanId = response.body.id;
    });

    it('should create floor plan with custom dimensions', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Custom Floor Plan',
          canvasWidth: 3000,
          canvasHeight: 2000,
          gridSize: 30,
        })
        .expect(201);

      expect(response.body.canvasWidth).toBe(3000);
      expect(response.body.canvasHeight).toBe(2000);
      expect(response.body.gridSize).toBe(30);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .send({
          name: 'Test Plan',
        })
        .expect(401);
    });

    it('should fail with invalid floor ID', async () => {
      await request(app)
        .post('/api/floors/invalid-floor-id/floor-plan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Plan',
        })
        .expect(404);
    });

    it('should fail when floor plan already exists', async () => {
      // Create first floor plan
      await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'First Plan',
        });

      // Try to create second floor plan for same floor
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Second Plan',
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/floors/:floorId/floor-plan', () => {
    it('should retrieve floor plan for a floor', async () => {
      const response = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('floorId', testFloorId);
      expect(response.body).toHaveProperty('elements');
      expect(response.body).toHaveProperty('racks');
      expect(response.body).toHaveProperty('version');
    });

    it('should return 404 when floor does not exist', async () => {
      await request(app)
        .get('/api/floors/non-existent-floor/floor-plan')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should return 404 when floor plan does not exist', async () => {
      const response = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .expect(401);
    });
  });

  describe('PUT /api/floor-plans/:id', () => {
    beforeAll(async () => {
      // Ensure we have a floor plan to update
      const createResponse = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plan for Update Tests',
        });

      testFloorPlanId = createResponse.body.id;
    });

    it('should update floor plan with new elements', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'wall',
              properties: {
                x1: 0,
                y1: 0,
                x2: 100,
                y2: 0,
                thickness: 2,
              },
              zIndex: 0,
            },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty('id', testFloorPlanId);
      expect(response.body).toHaveProperty('version');
      expect(response.body.version).toBeGreaterThan(1);
    });

    it('should update floor plan with racks', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          racks: [
            {
              name: 'Rack A1',
              code: 'RA1',
              positionX: 100,
              positionY: 100,
              width: 60,
              height: 100,
              rotation: 0,
              totalU: 42,
            },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should update canvas settings', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canvasWidth: 2500,
          canvasHeight: 1800,
          gridSize: 25,
          backgroundColor: '#F0F0F0',
        })
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should handle element and rack deletions', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          deletedElementIds: ['elem-to-delete'],
          deletedRackIds: ['rack-to-delete'],
        })
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should fail without authentication', async () => {
      await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .send({
          canvasWidth: 2000,
        })
        .expect(401);
    });

    it('should fail with invalid floor plan ID', async () => {
      await request(app)
        .put('/api/floor-plans/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canvasWidth: 2000,
        })
        .expect(404);
    });

    it('should reject duplicate rack names', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          racks: [
            {
              name: 'Duplicate Rack',
              positionX: 100,
              positionY: 100,
            },
            {
              name: 'Duplicate Rack',
              positionX: 200,
              positionY: 200,
            },
          ],
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/floor-plans/:id', () => {
    let floorPlanToDelete: string;

    beforeAll(async () => {
      // Create a floor plan to delete
      const createResponse = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plan to Delete',
        });

      floorPlanToDelete = createResponse.body.id;
    });

    it('should delete floor plan successfully', async () => {
      const response = await request(app)
        .delete(`/api/floor-plans/${floorPlanToDelete}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail to delete non-existent floor plan', async () => {
      await request(app)
        .delete('/api/floor-plans/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .delete(`/api/floor-plans/${testFloorPlanId}`)
        .expect(401);
    });
  });

  describe('Complete Floor Plan Workflow', () => {
    let workflowFloorPlanId: string;

    it('Step 1: Create floor plan', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Workflow Test Plan',
          canvasWidth: 2000,
          canvasHeight: 1500,
        })
        .expect(201);

      workflowFloorPlanId = response.body.id;
      expect(response.body.version).toBe(1);
    });

    it('Step 2: Add elements and racks', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${workflowFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'wall',
              properties: { x1: 0, y1: 0, x2: 500, y2: 0 },
            },
            {
              elementType: 'door',
              properties: { x: 250, y: 0, width: 30 },
            },
          ],
          racks: [
            {
              name: 'Rack A1',
              positionX: 100,
              positionY: 100,
            },
            {
              name: 'Rack A2',
              positionX: 200,
              positionY: 100,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(2);
    });

    it('Step 3: Retrieve floor plan', async () => {
      const response = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.elements).toHaveLength(2);
      expect(response.body.racks).toHaveLength(2);
      expect(response.body.version).toBe(2);
    });

    it('Step 4: Update elements', async () => {
      const getResponse = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const elementId = getResponse.body.elements[0].id;

      const response = await request(app)
        .put(`/api/floor-plans/${workflowFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              id: elementId,
              elementType: 'wall',
              properties: { x1: 0, y1: 0, x2: 600, y2: 0 },
              zIndex: 1,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(3);
    });

    it('Step 5: Delete floor plan', async () => {
      await request(app)
        .delete(`/api/floor-plans/${workflowFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle very large canvas dimensions', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Large Canvas Plan',
          canvasWidth: 10000,
          canvasHeight: 10000,
        })
        .expect(201);

      expect(response.body.canvasWidth).toBe(10000);
    });

    it('should handle empty update request', async () => {
      const createResponse = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Empty Update Test',
        });

      const response = await request(app)
        .put(`/api/floor-plans/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should handle concurrent updates gracefully', async () => {
      const createResponse = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Concurrent Update Test',
        });

      const planId = createResponse.body.id;

      // Simulate concurrent updates
      const updates = Array(3)
        .fill(null)
        .map((_, i) =>
          request(app)
            .put(`/api/floor-plans/${planId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              canvasWidth: 2000 + i * 100,
            })
        );

      const responses = await Promise.all(updates);

      // All updates should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('version');
      });
    });
  });
});
