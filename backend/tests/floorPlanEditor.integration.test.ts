import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { floorPlansRouter } from '../src/routes/floorPlans.routes.js';
import { racksRouter } from '../src/routes/racks.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Floor Plan Editor Complete Workflow
 * Tests the complete user journey of creating and editing a floor plan
 */
describe('Floor Plan Editor Integration Tests', () => {
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
    testFloorId = 'test-floor-editor';

    console.log('🔧 Floor Plan Editor integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Floor Plan Editor integration test cleanup completed');
  });

  describe('Complete Editor Workflow', () => {
    it('Step 1: Create initial floor plan', async () => {
      const response = await request(app)
        .post(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Editor Test Plan',
          canvasWidth: 2000,
          canvasHeight: 1500,
          gridSize: 20,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Editor Test Plan');
      expect(response.body.canvasWidth).toBe(2000);
      expect(response.body.canvasHeight).toBe(1500);
      expect(response.body.gridSize).toBe(20);
      expect(response.body.version).toBe(1);
      expect(response.body.elements).toHaveLength(0);
      expect(response.body.racks).toHaveLength(0);

      testFloorPlanId = response.body.id;
    });

    it('Step 2: Add walls to floor plan', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'wall',
              properties: {
                points: [[0, 0], [500, 0]],
                thickness: 10,
                color: '#333333',
              },
              zIndex: 0,
            },
            {
              elementType: 'wall',
              properties: {
                points: [[500, 0], [500, 400]],
                thickness: 10,
                color: '#333333',
              },
              zIndex: 0,
            },
            {
              elementType: 'wall',
              properties: {
                points: [[500, 400], [0, 400]],
                thickness: 10,
                color: '#333333',
              },
              zIndex: 0,
            },
            {
              elementType: 'wall',
              properties: {
                points: [[0, 400], [0, 0]],
                thickness: 10,
                color: '#333333',
              },
              zIndex: 0,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(2);
      expect(response.body.message).toContain('저장되었습니다');
    });

    it('Step 3: Add door and window to walls', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'door',
              properties: {
                x: 200,
                y: 0,
                width: 60,
                openDirection: 'inside',
                rotation: 0,
              },
              zIndex: 1,
            },
            {
              elementType: 'window',
              properties: {
                x: 100,
                y: 400,
                width: 80,
                rotation: 0,
              },
              zIndex: 1,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(3);
    });

    it('Step 4: Add columns to floor plan', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: {
                x: 100,
                y: 100,
                width: 40,
                height: 40,
                shape: 'rect',
              },
              zIndex: 2,
            },
            {
              elementType: 'column',
              properties: {
                x: 400,
                y: 100,
                width: 40,
                height: 40,
                shape: 'circle',
              },
              zIndex: 2,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(4);
    });

    it('Step 5: Add racks to floor plan', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          racks: [
            {
              name: 'Rack A1',
              code: 'RA1',
              positionX: 150,
              positionY: 150,
              width: 60,
              height: 100,
              rotation: 0,
              totalU: 42,
            },
            {
              name: 'Rack A2',
              code: 'RA2',
              positionX: 250,
              positionY: 150,
              width: 60,
              height: 100,
              rotation: 90,
              totalU: 42,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(5);
    });

    it('Step 6: Retrieve complete floor plan', async () => {
      const response = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.elements.length).toBeGreaterThan(0);
      expect(response.body.racks).toHaveLength(2);
      expect(response.body.version).toBe(5);

      // Verify element types
      const wallCount = response.body.elements.filter((e: any) => e.elementType === 'wall').length;
      const doorCount = response.body.elements.filter((e: any) => e.elementType === 'door').length;
      const windowCount = response.body.elements.filter((e: any) => e.elementType === 'window').length;
      const columnCount = response.body.elements.filter((e: any) => e.elementType === 'column').length;

      expect(wallCount).toBeGreaterThan(0);
      expect(doorCount).toBeGreaterThan(0);
      expect(windowCount).toBeGreaterThan(0);
      expect(columnCount).toBeGreaterThan(0);
    });

    it('Step 7: Update existing elements (move and rotate)', async () => {
      // First get current elements
      const getResponse = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const doorElement = getResponse.body.elements.find((e: any) => e.elementType === 'door');
      const rackToUpdate = getResponse.body.racks[0];

      // Update door rotation and rack position
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              id: doorElement.id,
              elementType: 'door',
              properties: {
                ...doorElement.properties,
                rotation: 90,
              },
              zIndex: doorElement.zIndex,
            },
          ],
          racks: [
            {
              id: rackToUpdate.id,
              name: rackToUpdate.name,
              positionX: 200,
              positionY: 200,
              rotation: 45,
            },
          ],
        })
        .expect(200);

      expect(response.body.version).toBe(6);
    });

    it('Step 8: Delete specific elements', async () => {
      // Get current state
      const getResponse = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const windowElement = getResponse.body.elements.find((e: any) => e.elementType === 'window');
      const rackToDelete = getResponse.body.racks[1];

      // Delete window and one rack
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          deletedElementIds: [windowElement.id],
          deletedRackIds: [rackToDelete.id],
        })
        .expect(200);

      expect(response.body.version).toBe(7);

      // Verify deletion
      const verifyResponse = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const hasWindow = verifyResponse.body.elements.some((e: any) => e.id === windowElement.id);
      const hasDeletedRack = verifyResponse.body.racks.some((r: any) => r.id === rackToDelete.id);

      expect(hasWindow).toBe(false);
      expect(hasDeletedRack).toBe(false);
    });

    it('Step 9: Bulk update with mixed operations', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Add new elements
          elements: [
            {
              elementType: 'wall',
              properties: {
                points: [[600, 0], [600, 400]],
                thickness: 10,
                color: '#666666',
              },
              zIndex: 0,
            },
          ],
          // Add new rack
          racks: [
            {
              name: 'Rack B1',
              code: 'RB1',
              positionX: 350,
              positionY: 250,
              totalU: 48,
            },
          ],
          // Update canvas settings
          canvasWidth: 2500,
          gridSize: 25,
        })
        .expect(200);

      expect(response.body.version).toBe(8);
    });
  });

  describe('Editor Edge Cases', () => {
    it('should handle overlapping elements', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: {
                x: 100,
                y: 100,
                width: 40,
                height: 40,
                shape: 'rect',
              },
              zIndex: 5,
            },
            {
              elementType: 'column',
              properties: {
                x: 100,
                y: 100,
                width: 40,
                height: 40,
                shape: 'circle',
              },
              zIndex: 10,
            },
          ],
        })
        .expect(200);

      // Both elements should be created with different z-indices
      expect(response.body.version).toBeGreaterThan(8);
    });

    it('should handle elements at canvas boundaries', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: {
                x: 0,
                y: 0,
                width: 40,
                height: 40,
                shape: 'rect',
              },
            },
            {
              elementType: 'column',
              properties: {
                x: 2460,
                y: 1460,
                width: 40,
                height: 40,
                shape: 'rect',
              },
            },
          ],
        })
        .expect(200);
    });

    it('should handle multiple rotations of doors', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'door',
              properties: {
                x: 300,
                y: 0,
                width: 60,
                openDirection: 'inside',
                rotation: 0,
              },
            },
            {
              elementType: 'door',
              properties: {
                x: 400,
                y: 0,
                width: 60,
                openDirection: 'inside',
                rotation: 90,
              },
            },
            {
              elementType: 'door',
              properties: {
                x: 500,
                y: 0,
                width: 60,
                openDirection: 'outside',
                rotation: 180,
              },
            },
            {
              elementType: 'door',
              properties: {
                x: 600,
                y: 0,
                width: 60,
                openDirection: 'outside',
                rotation: 270,
              },
            },
          ],
        })
        .expect(200);
    });

    it('should handle complex wall paths', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'wall',
              properties: {
                points: [
                  [0, 0],
                  [100, 50],
                  [200, 50],
                  [300, 100],
                  [400, 100],
                  [500, 150],
                ],
                thickness: 10,
                color: '#333333',
              },
            },
          ],
        })
        .expect(200);
    });

    it('should handle racks with extreme rotations', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          racks: [
            {
              name: 'Rack Rotate 0',
              positionX: 700,
              positionY: 100,
              rotation: 0,
            },
            {
              name: 'Rack Rotate 45',
              positionX: 800,
              positionY: 100,
              rotation: 45,
            },
            {
              name: 'Rack Rotate 90',
              positionX: 900,
              positionY: 100,
              rotation: 90,
            },
            {
              name: 'Rack Rotate 135',
              positionX: 1000,
              positionY: 100,
              rotation: 135,
            },
            {
              name: 'Rack Rotate 270',
              positionX: 1100,
              positionY: 100,
              rotation: 270,
            },
          ],
        })
        .expect(200);
    });

    it('should handle negative coordinates', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: {
                x: -20,
                y: -20,
                width: 40,
                height: 40,
                shape: 'rect',
              },
            },
          ],
        })
        .expect(200);
    });

    it('should preserve element visibility settings', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'wall',
              properties: {
                points: [[1000, 0], [1000, 400]],
                thickness: 10,
                color: '#333333',
              },
              isVisible: false,
            },
            {
              elementType: 'door',
              properties: {
                x: 1000,
                y: 200,
                width: 60,
                openDirection: 'inside',
              },
              isVisible: true,
            },
          ],
        })
        .expect(200);

      // Verify visibility
      const verifyResponse = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const hiddenWall = verifyResponse.body.elements.find(
        (e: any) => e.elementType === 'wall' && e.properties.points[0][0] === 1000
      );

      expect(hiddenWall?.isVisible).toBe(false);
    });
  });

  describe('Grid Snap Validation', () => {
    it('should accept elements aligned to 20px grid', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          gridSize: 20,
          elements: [
            {
              elementType: 'column',
              properties: {
                x: 200,
                y: 200,
                width: 40,
                height: 40,
                shape: 'rect',
              },
            },
            {
              elementType: 'door',
              properties: {
                x: 400,
                y: 600,
                width: 60,
                openDirection: 'inside',
              },
            },
          ],
        })
        .expect(200);
    });

    it('should accept elements not aligned to grid (grid snap off)', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: {
                x: 213,
                y: 197,
                width: 40,
                height: 40,
                shape: 'rect',
              },
            },
          ],
        })
        .expect(200);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle creating many elements at once', async () => {
      const elements = Array.from({ length: 50 }, (_, i) => ({
        elementType: 'column' as const,
        properties: {
          x: (i % 10) * 100,
          y: Math.floor(i / 10) * 100,
          width: 30,
          height: 30,
          shape: 'rect' as const,
        },
        zIndex: i,
      }));

      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements,
        })
        .expect(200);

      expect(response.body.version).toBeGreaterThan(0);
    });

    it('should handle creating many racks at once', async () => {
      const racks = Array.from({ length: 20 }, (_, i) => ({
        name: `Stress Rack ${i}`,
        code: `SR${i}`,
        positionX: (i % 5) * 150,
        positionY: Math.floor(i / 5) * 200,
        rotation: (i * 45) % 360,
      }));

      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          racks,
        })
        .expect(200);

      expect(response.body.version).toBeGreaterThan(0);
    });

    it('should handle large canvas dimensions', async () => {
      const response = await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canvasWidth: 10000,
          canvasHeight: 8000,
          elements: [
            {
              elementType: 'wall',
              properties: {
                points: [[0, 0], [10000, 0]],
                thickness: 10,
                color: '#333333',
              },
            },
          ],
        })
        .expect(200);
    });
  });

  describe('Undo/Redo Simulation via Versions', () => {
    it('should track version history correctly', async () => {
      // Get initial version
      const initial = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      const initialVersion = initial.body.version;

      // Make change 1
      await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: { x: 50, y: 50, width: 40, height: 40, shape: 'rect' },
            },
          ],
        });

      // Make change 2
      await request(app)
        .put(`/api/floor-plans/${testFloorPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          elements: [
            {
              elementType: 'column',
              properties: { x: 150, y: 150, width: 40, height: 40, shape: 'rect' },
            },
          ],
        });

      // Get final version
      const final = await request(app)
        .get(`/api/floors/${testFloorId}/floor-plan`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(final.body.version).toBe(initialVersion + 2);
    });
  });
});
