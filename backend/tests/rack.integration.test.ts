import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { racksRouter } from '../src/routes/racks.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Rack API
 * Tests complete CRUD operations for racks
 */
describe('Rack API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let testFloorPlanId: string;
  let testRackId: string;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api', racksRouter);
    app.use(errorHandler);

    // Login to get admin token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin1234',
      });

    adminToken = loginResponse.body.accessToken;

    // Set test floor plan ID (should exist from seed data)
    testFloorPlanId = 'test-floor-plan-id';

    console.log('🔧 Rack integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Rack integration test cleanup completed');
  });

  describe('POST /api/floor-plans/:floorPlanId/racks', () => {
    it('should create a rack with default values', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack A1',
          positionX: 100,
          positionY: 100,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'Rack A1');
      expect(response.body).toHaveProperty('width', 60);
      expect(response.body).toHaveProperty('height', 100);
      expect(response.body).toHaveProperty('totalU', 42);
      expect(response.body).toHaveProperty('equipmentCount', 0);
      expect(response.body).toHaveProperty('usedU', 0);

      testRackId = response.body.id;
    });

    it('should create rack with custom dimensions', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack B1',
          code: 'RB1',
          positionX: 200,
          positionY: 200,
          width: 80,
          height: 120,
          rotation: 90,
          totalU: 48,
          description: 'Large rack for servers',
        })
        .expect(201);

      expect(response.body.code).toBe('RB1');
      expect(response.body.width).toBe(80);
      expect(response.body.height).toBe(120);
      expect(response.body.rotation).toBe(90);
      expect(response.body.totalU).toBe(48);
      expect(response.body.description).toBe('Large rack for servers');
    });

    it('should fail without authentication', async () => {
      await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .send({
          name: 'Rack C1',
          positionX: 300,
          positionY: 300,
        })
        .expect(401);
    });

    it('should fail with invalid floor plan ID', async () => {
      await request(app)
        .post('/api/floor-plans/invalid-id/racks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack D1',
          positionX: 100,
          positionY: 100,
        })
        .expect(404);
    });

    it('should reject duplicate rack names', async () => {
      // Create first rack
      await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Rack',
          positionX: 100,
          positionY: 100,
        });

      // Try to create another rack with same name
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Rack',
          positionX: 200,
          positionY: 200,
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          positionX: 100,
          // Missing name and positionY
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/floor-plans/:floorPlanId/racks', () => {
    it('should retrieve all racks for a floor plan', async () => {
      const response = await request(app)
        .get(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('equipmentCount');
      expect(response.body[0]).toHaveProperty('usedU');
    });

    it('should return empty array for floor plan with no racks', async () => {
      const response = await request(app)
        .get('/api/floor-plans/empty-floor-plan/racks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(0);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get(`/api/floor-plans/${testFloorPlanId}/racks`)
        .expect(401);
    });
  });

  describe('GET /api/racks/:id', () => {
    it('should retrieve rack details by ID', async () => {
      const response = await request(app)
        .get(`/api/racks/${testRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testRackId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('positionX');
      expect(response.body).toHaveProperty('positionY');
      expect(response.body).toHaveProperty('width');
      expect(response.body).toHaveProperty('height');
      expect(response.body).toHaveProperty('equipmentCount');
      expect(response.body).toHaveProperty('usedU');
    });

    it('should fail with invalid rack ID', async () => {
      await request(app)
        .get('/api/racks/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get(`/api/racks/${testRackId}`)
        .expect(401);
    });
  });

  describe('PUT /api/racks/:id', () => {
    it('should update rack position and rotation', async () => {
      const response = await request(app)
        .put(`/api/racks/${testRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          positionX: 150,
          positionY: 150,
          rotation: 45,
        })
        .expect(200);

      expect(response.body.positionX).toBe(150);
      expect(response.body.positionY).toBe(150);
      expect(response.body.rotation).toBe(45);
    });

    it('should update rack name', async () => {
      const response = await request(app)
        .put(`/api/racks/${testRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack A1 Updated',
        })
        .expect(200);

      expect(response.body.name).toBe('Rack A1 Updated');
    });

    it('should update rack code and description', async () => {
      const response = await request(app)
        .put(`/api/racks/${testRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'RA1-NEW',
          description: 'Updated description',
        })
        .expect(200);

      expect(response.body.code).toBe('RA1-NEW');
      expect(response.body.description).toBe('Updated description');
    });

    it('should prevent duplicate names during update', async () => {
      // Create another rack
      const createResponse = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack E1',
          positionX: 400,
          positionY: 400,
        });

      // Try to update first rack with duplicate name
      const response = await request(app)
        .put(`/api/racks/${testRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack E1',
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail without authentication', async () => {
      await request(app)
        .put(`/api/racks/${testRackId}`)
        .send({
          name: 'New Name',
        })
        .expect(401);
    });

    it('should fail with invalid rack ID', async () => {
      await request(app)
        .put('/api/racks/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Name',
        })
        .expect(404);
    });
  });

  describe('POST /api/racks/:id/images', () => {
    it('should update front image URL', async () => {
      const response = await request(app)
        .post(`/api/racks/${testRackId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageType: 'front',
          imageUrl: '/images/rack-front.png',
        })
        .expect(200);

      expect(response.body.frontImageUrl).toBe('/images/rack-front.png');
    });

    it('should update rear image URL', async () => {
      const response = await request(app)
        .post(`/api/racks/${testRackId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageType: 'rear',
          imageUrl: '/images/rack-rear.png',
        })
        .expect(200);

      expect(response.body.rearImageUrl).toBe('/images/rack-rear.png');
    });

    it('should validate image type', async () => {
      const response = await request(app)
        .post(`/api/racks/${testRackId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageType: 'invalid',
          imageUrl: '/images/rack.png',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail without authentication', async () => {
      await request(app)
        .post(`/api/racks/${testRackId}/images`)
        .send({
          imageType: 'front',
          imageUrl: '/images/rack.png',
        })
        .expect(401);
    });
  });

  describe('DELETE /api/racks/:id', () => {
    it('should delete rack when no equipment exists', async () => {
      // Create a rack to delete
      const createResponse = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rack to Delete',
          positionX: 500,
          positionY: 500,
        });

      const rackId = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/racks/${rackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify deletion
      await request(app)
        .get(`/api/racks/${rackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should fail when equipment exists', async () => {
      // This test assumes there's a rack with equipment
      // In a real scenario, you would create rack and add equipment first
      const rackWithEquipment = 'rack-with-equipment-id';

      const response = await request(app)
        .delete(`/api/racks/${rackWithEquipment}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with invalid rack ID', async () => {
      await request(app)
        .delete('/api/racks/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .delete(`/api/racks/${testRackId}`)
        .expect(401);
    });
  });

  describe('Complete Rack Workflow', () => {
    let workflowRackId: string;

    it('Step 1: Create rack', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Workflow Rack',
          code: 'WR1',
          positionX: 100,
          positionY: 100,
          totalU: 42,
        })
        .expect(201);

      workflowRackId = response.body.id;
      expect(response.body.name).toBe('Workflow Rack');
      expect(response.body.equipmentCount).toBe(0);
    });

    it('Step 2: Update rack position', async () => {
      const response = await request(app)
        .put(`/api/racks/${workflowRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          positionX: 200,
          positionY: 200,
          rotation: 90,
        })
        .expect(200);

      expect(response.body.positionX).toBe(200);
      expect(response.body.positionY).toBe(200);
      expect(response.body.rotation).toBe(90);
    });

    it('Step 3: Upload rack images', async () => {
      // Upload front image
      await request(app)
        .post(`/api/racks/${workflowRackId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageType: 'front',
          imageUrl: '/images/workflow-front.png',
        })
        .expect(200);

      // Upload rear image
      const response = await request(app)
        .post(`/api/racks/${workflowRackId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageType: 'rear',
          imageUrl: '/images/workflow-rear.png',
        })
        .expect(200);

      expect(response.body.frontImageUrl).toBe('/images/workflow-front.png');
      expect(response.body.rearImageUrl).toBe('/images/workflow-rear.png');
    });

    it('Step 4: Retrieve rack details', async () => {
      const response = await request(app)
        .get(`/api/racks/${workflowRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.name).toBe('Workflow Rack');
      expect(response.body.code).toBe('WR1');
      expect(response.body.positionX).toBe(200);
      expect(response.body.frontImageUrl).toBe('/images/workflow-front.png');
    });

    it('Step 5: Delete rack', async () => {
      await request(app)
        .delete(`/api/racks/${workflowRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/racks/${workflowRackId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle racks with zero dimensions', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zero Dimension Rack',
          positionX: 0,
          positionY: 0,
          width: 0,
          height: 0,
        })
        .expect(201);

      expect(response.body.width).toBe(0);
      expect(response.body.height).toBe(0);
    });

    it('should handle racks with negative rotation', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Negative Rotation Rack',
          positionX: 100,
          positionY: 100,
          rotation: -90,
        })
        .expect(201);

      expect(response.body.rotation).toBe(-90);
    });

    it('should handle concurrent rack creation', async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          request(app)
            .post(`/api/floor-plans/${testFloorPlanId}/racks`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `Concurrent Rack ${i}`,
              positionX: i * 100,
              positionY: i * 100,
            })
        );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
      });
    });

    it('should handle racks at very large coordinates', async () => {
      const response = await request(app)
        .post(`/api/floor-plans/${testFloorPlanId}/racks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Far Away Rack',
          positionX: 999999,
          positionY: 999999,
        })
        .expect(201);

      expect(response.body.positionX).toBe(999999);
      expect(response.body.positionY).toBe(999999);
    });
  });
});
