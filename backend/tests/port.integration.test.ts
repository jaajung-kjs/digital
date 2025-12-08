import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { racksRouter } from '../src/routes/racks.routes.js';
import { equipmentRouter } from '../src/routes/equipment.routes.js';
import { portsRouter } from '../src/routes/ports.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Port API (PRD-04)
 * Tests complete CRUD operations for ports in equipment
 */
describe('Port API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let testRackId: string;
  let testEquipmentId: string;
  let testPortId: string;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api', racksRouter);
    app.use('/api/equipment', equipmentRouter);
    app.use('/api/ports', portsRouter);
    app.use(errorHandler);

    // Login to get admin token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin1234',
      });

    adminToken = loginResponse.body.accessToken;

    console.log('🔧 Port integration test initialized');
  });

  afterAll(() => {
    console.log('🧹 Port integration test cleanup completed');
  });

  describe('Port CRUD Operations', () => {
    // First, setup test equipment for ports
    describe('Setup - Create test equipment for ports', () => {
      it('should create test equipment', async () => {
        testRackId = '5031abf5-a290-48b2-baa1-18bda983a7d2';

        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Port Test Server',
            startU: 15,
            heightU: 2,
            category: 'SERVER',
          })
          .expect(201);

        testEquipmentId = response.body.data.id;
        expect(testEquipmentId).toBeDefined();
      });
    });

    describe('GET /api/equipment/:equipmentId/ports', () => {
      it('should return empty port list initially', async () => {
        const response = await request(app)
          .get(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data).toHaveLength(0);
      });

      it('should return 404 for non-existent equipment', async () => {
        const response = await request(app)
          .get('/api/equipment/00000000-0000-0000-0000-000000000000/ports')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBe('NOT_FOUND');
      });

      it('should fail without authentication', async () => {
        await request(app)
          .get(`/api/equipment/${testEquipmentId}/ports`)
          .expect(401);
      });
    });

    describe('POST /api/equipment/:equipmentId/ports', () => {
      it('should create port with minimal fields', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'eth0',
            portType: 'LAN',
          })
          .expect(201);

        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('eth0');
        expect(response.body.data.portType).toBe('LAN');
        expect(response.body.data.isConnected).toBe(false);

        testPortId = response.body.data.id;
      });

      it('should create port with all fields', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'eth1',
            portType: 'FIBER',
            portNumber: 2,
            label: 'Data Port',
            speed: '10Gbps',
            connectorType: 'LC',
            description: 'High-speed fiber connection',
          })
          .expect(201);

        expect(response.body.data.name).toBe('eth1');
        expect(response.body.data.portType).toBe('FIBER');
        expect(response.body.data.portNumber).toBe(2);
        expect(response.body.data.label).toBe('Data Port');
        expect(response.body.data.speed).toBe('10Gbps');
        expect(response.body.data.connectorType).toBe('LC');
        expect(response.body.data.description).toBe('High-speed fiber connection');
      });

      it('should create AC power port', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'power1',
            portType: 'AC',
            portNumber: 1,
            label: 'Power Supply 1',
          })
          .expect(201);

        expect(response.body.data.portType).toBe('AC');
        expect(response.body.data.name).toBe('power1');
      });

      it('should create DC power port', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'dc-in',
            portType: 'DC',
            label: 'DC Input',
          })
          .expect(201);

        expect(response.body.data.portType).toBe('DC');
      });

      it('should create CONSOLE port', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'console',
            portType: 'CONSOLE',
            label: 'Management Console',
          })
          .expect(201);

        expect(response.body.data.portType).toBe('CONSOLE');
      });

      it('should create USB port', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'usb1',
            portType: 'USB',
            label: 'USB Management',
          })
          .expect(201);

        expect(response.body.data.portType).toBe('USB');
      });

      it('should fail with invalid port type', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'invalid',
            portType: 'INVALID_TYPE',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail without required name field', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            portType: 'LAN',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail without required portType field', async () => {
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'test',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail for non-existent equipment', async () => {
        const response = await request(app)
          .post('/api/equipment/00000000-0000-0000-0000-000000000000/ports')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'ghost-port',
            portType: 'LAN',
          })
          .expect(404);

        expect(response.body.error).toBe('NOT_FOUND');
      });

      it('should fail without authentication', async () => {
        await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .send({
            name: 'unauthorized',
            portType: 'LAN',
          })
          .expect(401);
      });
    });

    describe('POST /api/equipment/:equipmentId/ports/bulk', () => {
      let bulkEquipmentId: string;

      beforeAll(async () => {
        // Create new equipment for bulk port test
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Bulk Port Test Switch',
            startU: 20,
            heightU: 1,
            category: 'NETWORK',
          });
        bulkEquipmentId = response.body.data.id;
      });

      it('should create multiple ports at once', async () => {
        const response = await request(app)
          .post(`/api/equipment/${bulkEquipmentId}/ports/bulk`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ports: [
              { name: 'ge0/1', portType: 'LAN', portNumber: 1, speed: '1Gbps' },
              { name: 'ge0/2', portType: 'LAN', portNumber: 2, speed: '1Gbps' },
              { name: 'ge0/3', portType: 'LAN', portNumber: 3, speed: '1Gbps' },
              { name: 'power-a', portType: 'AC', portNumber: 1 },
              { name: 'power-b', portType: 'AC', portNumber: 2 },
            ],
          })
          .expect(201);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data).toHaveLength(5);
        expect(response.body.data[0].name).toBe('ge0/1');
        expect(response.body.data[3].name).toBe('power-a');
      });

      it('should fail with empty ports array', async () => {
        const response = await request(app)
          .post(`/api/equipment/${bulkEquipmentId}/ports/bulk`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ports: [],
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail when ports array exceeds 100 items', async () => {
        const tooManyPorts = Array.from({ length: 101 }, (_, i) => ({
          name: `port${i}`,
          portType: 'LAN',
        }));

        const response = await request(app)
          .post(`/api/equipment/${bulkEquipmentId}/ports/bulk`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ports: tooManyPorts,
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should fail when any port has invalid data', async () => {
        const response = await request(app)
          .post(`/api/equipment/${bulkEquipmentId}/ports/bulk`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ports: [
              { name: 'valid1', portType: 'LAN' },
              { name: 'invalid', portType: 'INVALID_TYPE' },
              { name: 'valid2', portType: 'FIBER' },
            ],
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/ports/:id', () => {
      it('should return port details', async () => {
        const response = await request(app)
          .get(`/api/ports/${testPortId}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body.data.id).toBe(testPortId);
        expect(response.body.data.name).toBe('eth0');
        expect(response.body.data.portType).toBe('LAN');
        expect(response.body.data).toHaveProperty('isConnected');
      });

      it('should return 404 for non-existent port', async () => {
        const response = await request(app)
          .get('/api/ports/00000000-0000-0000-0000-000000000000')
          .expect(404);

        expect(response.body.error).toBe('NOT_FOUND');
      });

      it('should work without authentication (public read)', async () => {
        const response = await request(app)
          .get(`/api/ports/${testPortId}`)
          .expect(200);

        expect(response.body.data.id).toBe(testPortId);
      });
    });

    describe('PUT /api/ports/:id', () => {
      it('should update port name', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'eth0-mgmt',
          })
          .expect(200);

        expect(response.body.data.name).toBe('eth0-mgmt');
      });

      it('should update port label and description', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            label: 'Management Interface',
            description: 'Primary management network',
          })
          .expect(200);

        expect(response.body.data.label).toBe('Management Interface');
        expect(response.body.data.description).toBe('Primary management network');
      });

      it('should update port type', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            portType: 'FIBER',
          })
          .expect(200);

        expect(response.body.data.portType).toBe('FIBER');
      });

      it('should update speed and connector type', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            speed: '40Gbps',
            connectorType: 'QSFP+',
          })
          .expect(200);

        expect(response.body.data.speed).toBe('40Gbps');
        expect(response.body.data.connectorType).toBe('QSFP+');
      });

      it('should update portNumber', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            portNumber: 10,
          })
          .expect(200);

        expect(response.body.data.portNumber).toBe(10);
      });

      it('should set portNumber to null', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            portNumber: null,
          })
          .expect(200);

        expect(response.body.data.portNumber).toBeNull();
      });

      it('should fail with invalid port type', async () => {
        const response = await request(app)
          .put(`/api/ports/${testPortId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            portType: 'INVALID',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should return 404 for non-existent port', async () => {
        await request(app)
          .put('/api/ports/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'ghost',
          })
          .expect(404);
      });

      it('should fail without authentication', async () => {
        await request(app)
          .put(`/api/ports/${testPortId}`)
          .send({
            name: 'unauthorized',
          })
          .expect(401);
      });
    });

    describe('GET /api/equipment/:equipmentId/ports - after port creation', () => {
      it('should return all ports for equipment', async () => {
        const response = await request(app)
          .get(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);

        // Check that ports have connection status
        response.body.data.forEach((port: any) => {
          expect(port).toHaveProperty('id');
          expect(port).toHaveProperty('name');
          expect(port).toHaveProperty('portType');
          expect(port).toHaveProperty('isConnected');
        });
      });
    });

    describe('DELETE /api/ports/:id', () => {
      let portToDelete: string;

      beforeAll(async () => {
        // Create port specifically for deletion test
        const response = await request(app)
          .post(`/api/equipment/${testEquipmentId}/ports`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'to-delete',
            portType: 'OTHER',
          });
        portToDelete = response.body.data.id;
      });

      it('should delete port', async () => {
        const response = await request(app)
          .delete(`/api/ports/${portToDelete}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.message).toContain('삭제');
      });

      it('should return 404 after deletion', async () => {
        await request(app)
          .get(`/api/ports/${portToDelete}`)
          .expect(404);
      });

      it('should return 404 for non-existent port', async () => {
        await request(app)
          .delete('/api/ports/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);
      });

      it('should fail without authentication', async () => {
        await request(app)
          .delete(`/api/ports/${testPortId}`)
          .expect(401);
      });
    });

    // Port Type Coverage Tests
    describe('Port Type Coverage', () => {
      let typeTestEquipmentId: string;

      beforeAll(async () => {
        const response = await request(app)
          .post(`/api/racks/${testRackId}/equipment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Type Test Equipment',
            startU: 22,
            heightU: 1,
          });
        typeTestEquipmentId = response.body.data.id;
      });

      it('should create all port types successfully', async () => {
        const portTypes = ['AC', 'DC', 'LAN', 'FIBER', 'CONSOLE', 'USB', 'OTHER'];

        for (const portType of portTypes) {
          const response = await request(app)
            .post(`/api/equipment/${typeTestEquipmentId}/ports`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `${portType.toLowerCase()}-test`,
              portType,
            })
            .expect(201);

          expect(response.body.data.portType).toBe(portType);
        }
      });
    });

    // Cleanup - delete test equipment (cascade deletes ports)
    describe('Cleanup', () => {
      it('should clean up test equipment and ports', async () => {
        if (testEquipmentId) {
          await request(app)
            .delete(`/api/equipment/${testEquipmentId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        }
      });
    });
  });
});
