import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { racksRouter } from '../src/routes/racks.routes.js';
import { equipmentRouter } from '../src/routes/equipment.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Equipment API (PRD-04)
 * Tests complete CRUD operations for equipment in racks
 */
describe('Equipment API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let testRackId: string;
  let testEquipmentId: string;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api', racksRouter);
    app.use('/api/equipment', equipmentRouter);
    app.use(errorHandler);

    // Login to get admin token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin1234',
      });

    adminToken = loginResponse.body.accessToken;

    console.log('🔧 Equipment integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Equipment integration test cleanup completed');
  });

  describe('Equipment CRUD Operations', () => {
    // First, we need to get a valid rack ID
    describe('Setup - Get test rack', () => {
      it('should have test data ready', async () => {
        // Query for an existing rack from database
        // In a real test, we'd create a test rack first
        // For now, we'll use the rack created in manual testing
        testRackId = '5031abf5-a290-48b2-baa1-18bda983a7d2';
        expect(testRackId).toBeDefined();
      });
    });

    describe('GET /api/racks/:rackId/equipment', () => {
      it('should return equipment list for rack', async () => {
        const response = await request(app)
          .get(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should return 404 for non-existent rack', async () => {
        const response = await request(app)
          .get('/api/racks/00000000-0000-0000-0000-000000000000/equipment')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBe('NOT_FOUND');
      });

      it('should fail without authentication', async () => {
        await request(app)
          .get(`/api/racks/${testRackId}/equipment`)
          .expect(401);
      });
    });

    describe('POST /api/racks/:rackId/equipment', () => {
      it('should create equipment with minimal fields', async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Test Server',
            startU: 30,
            heightU: 2,
          })
          .expect(201);

        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('Test Server');
        expect(response.body.data.startU).toBe(30);
        expect(response.body.data.heightU).toBe(2);
        expect(response.body.data.category).toBe('OTHER'); // Default category

        testEquipmentId = response.body.data.id;
      });

      it('should create equipment with all fields', async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Full Server',
            model: 'Dell PowerEdge R750',
            manufacturer: 'Dell',
            serialNumber: 'TEST-SN-12345',
            startU: 35,
            heightU: 4,
            category: 'SERVER',
            installDate: '2024-01-15',
            manager: '테스트담당자',
            description: '테스트용 서버 설비',
          })
          .expect(201);

        expect(response.body.data.model).toBe('Dell PowerEdge R750');
        expect(response.body.data.manufacturer).toBe('Dell');
        expect(response.body.data.serialNumber).toBe('TEST-SN-12345');
        expect(response.body.data.category).toBe('SERVER');
        expect(response.body.data.manager).toBe('테스트담당자');
      });

      it('should fail when U slot conflicts with existing equipment', async () => {
        // First equipment is at U 30-31
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Conflict Server',
            startU: 31, // Overlaps with existing at 30-31
            heightU: 2,
          })
          .expect(409);

        expect(response.body.error).toBe('CONFLICT');
        expect(response.body.message).toContain('U 슬롯');
      });

      it('should fail when startU is less than 1', async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Invalid Server',
            startU: 0,
            heightU: 1,
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail when equipment exceeds rack capacity', async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Overflow Server',
            startU: 40,
            heightU: 5, // Exceeds 12U rack
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail without required fields', async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            // Missing name and startU
            heightU: 2,
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail without authentication', async () => {
        await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .send({
            name: 'Unauthorized Server',
            startU: 20,
          })
          .expect(401);
      });
    });

    describe('GET /api/equipment/:id', () => {
      it('should return equipment details', async () => {
        const response = await request(app)
          .get(`/api/equipment/${testEquipmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body.data.id).toBe(testEquipmentId);
        expect(response.body.data.name).toBe('Test Server');
        expect(response.body.data).toHaveProperty('portCount');
      });

      it('should return 404 for non-existent equipment', async () => {
        const response = await request(app)
          .get('/api/equipment/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/equipment/:id', () => {
      it('should update equipment name and description', async () => {
        const response = await request(app)
          .put(`/api/equipment/${testEquipmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated Server Name',
            description: 'Updated description',
          })
          .expect(200);

        expect(response.body.data.name).toBe('Updated Server Name');
        expect(response.body.data.description).toBe('Updated description');
      });

      it('should update equipment model and manufacturer', async () => {
        const response = await request(app)
          .put(`/api/equipment/${testEquipmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            model: 'HP ProLiant DL380',
            manufacturer: 'HP',
          })
          .expect(200);

        expect(response.body.data.model).toBe('HP ProLiant DL380');
        expect(response.body.data.manufacturer).toBe('HP');
      });

      it('should fail when updating to conflicting U position', async () => {
        // There's already equipment at U 35-38
        const response = await request(app)
          .put(`/api/equipment/${testEquipmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            startU: 36, // Conflicts with U 35-38
          })
          .expect(409);

        expect(response.body.error).toBe('CONFLICT');
      });

      it('should return 404 for non-existent equipment', async () => {
        await request(app)
          .put('/api/equipment/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Ghost Server',
          })
          .expect(404);
      });
    });

    describe('PATCH /api/equipment/:id/move', () => {
      it('should move equipment to new U position', async () => {
        const response = await request(app)
          .patch(`/api/equipment/${testEquipmentId}/move`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            startU: 25,
          })
          .expect(200);

        expect(response.body.data.startU).toBe(25);
        expect(response.body.data.heightU).toBe(2); // Height unchanged
      });

      it('should fail when moving to occupied U position', async () => {
        // There's equipment at U 35-38
        const response = await request(app)
          .patch(`/api/equipment/${testEquipmentId}/move`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            startU: 36,
          })
          .expect(409);

        expect(response.body.error).toBe('CONFLICT');
      });

      it('should fail without startU', async () => {
        await request(app)
          .patch(`/api/equipment/${testEquipmentId}/move`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(400);
      });
    });

    describe('GET /api/racks/:rackId/available-slots', () => {
      it('should return available U slots', async () => {
        const response = await request(app)
          .get(`/api/racks/${testRackId}/available-slots`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        // Each slot range should have start and end
        if (response.body.data.length > 0) {
          expect(response.body.data[0]).toHaveProperty('start');
          expect(response.body.data[0]).toHaveProperty('end');
        }
      });
    });

    describe('DELETE /api/equipment/:id', () => {
      let equipmentToDelete: string;

      beforeAll(async () => {
        // Create equipment specifically for deletion test
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'To Delete',
            startU: 40,
            heightU: 1,
          });
        equipmentToDelete = response.body.data.id;
      });

      it('should delete equipment', async () => {
        const response = await request(app)
          .delete(`/api/equipment/${equipmentToDelete}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.message).toContain('삭제');
      });

      it('should return 404 after deletion', async () => {
        await request(app)
          .get(`/api/equipment/${equipmentToDelete}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);
      });

      it('should return 404 for non-existent equipment', async () => {
        await request(app)
          .delete('/api/equipment/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);
      });
    });

    // Cleanup - delete test equipment
    describe('Cleanup', () => {
      it('should clean up test equipment', async () => {
        if (testEquipmentId) {
          await request(app)
            .delete(`/api/equipment/${testEquipmentId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        }
      });
    });
  });
});
