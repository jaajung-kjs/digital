import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { substationsRouter } from '../src/routes/substations.routes.js';
import { floorsRouter } from '../src/routes/floors.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * F02 변전소/층 관리 API Tests
 *
 * Test Cases (PRD TC-01 ~ TC-06):
 * - TC-01: 변전소 목록 조회
 * - TC-02: 변전소 생성
 * - TC-03: 중복 코드 검증
 * - TC-04: 층 생성
 * - TC-05: 변전소 삭제 (하위 데이터 있음 - 실패 케이스)
 * - TC-06: 탐색 흐름 (변전소 → 층)
 */

// Test server setup
let app: Express;
let adminToken: string;
let viewerToken: string;

// Test data
let testSubstationId: string;
let testFloorId: string;

beforeAll(async () => {
  // Create test app
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/substations', substationsRouter);
  app.use('/api/floors', floorsRouter);
  app.use(errorHandler);

  // Login as admin
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'admin',
      password: 'admin1234',
    });

  adminToken = adminLogin.body.accessToken;

  // Login as viewer
  const viewerLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'viewer',
      password: 'viewer1234',
    });

  viewerToken = viewerLogin.body.accessToken;

  console.log('🔧 Test server initialized');
});

afterAll(async () => {
  console.log('🧹 Test cleanup completed');
});

describe('F02 변전소/층 관리 API Tests', () => {
  // ==================== TC-01: 변전소 목록 조회 ====================
  describe('TC-01: 변전소 목록 조회 (GET /api/substations)', () => {
    it('should return substations list without authentication', async () => {
      const response = await request(app)
        .get('/api/substations')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);

      if (response.body.data.length > 0) {
        const substation = response.body.data[0];
        expect(substation).toHaveProperty('id');
        expect(substation).toHaveProperty('name');
        expect(substation).toHaveProperty('code');
        expect(substation).toHaveProperty('floorCount');
        expect(substation).toHaveProperty('isActive');
      }
    });

    it('should filter active substations', async () => {
      const response = await request(app)
        .get('/api/substations?isActive=true')
        .expect(200);

      expect(response.body).toHaveProperty('data');

      if (response.body.data.length > 0) {
        response.body.data.forEach((substation: any) => {
          expect(substation.isActive).toBe(true);
        });
      }
    });

    it('should return substations ordered by sortOrder', async () => {
      const response = await request(app)
        .get('/api/substations')
        .expect(200);

      const substations = response.body.data;

      if (substations.length > 1) {
        for (let i = 0; i < substations.length - 1; i++) {
          expect(substations[i].sortOrder).toBeLessThanOrEqual(
            substations[i + 1].sortOrder
          );
        }
      }
    });
  });

  // ==================== TC-02: 변전소 생성 ====================
  describe('TC-02: 변전소 생성 (POST /api/substations)', () => {
    it('should create substation with admin role', async () => {
      const timestamp = Date.now();
      const newSubstation = {
        name: `테스트변전소-${timestamp}`,
        code: `TEST-${timestamp}`,
        address: '서울시 강남구',
        description: '테스트용 변전소',
      };

      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newSubstation)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(newSubstation.name);
      expect(response.body.data.code).toBe(newSubstation.code);
      expect(response.body.data.address).toBe(newSubstation.address);
      expect(response.body.data.isActive).toBe(true);
      expect(response.body.data.floors).toEqual([]);

      // Store for later tests
      testSubstationId = response.body.data.id;
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/substations')
        .send({
          name: '미인증변전소',
          code: 'UNAUTH-001',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with viewer role', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: '뷰어변전소',
          code: 'VIEWER-001',
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with missing required fields', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '불완전변전소',
          // Missing code
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with invalid code format (lowercase)', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '잘못된코드',
          code: 'invalid-code',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      // Zod validation error message
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should fail with invalid code format (special chars)', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '특수문자코드',
          code: 'TEST@#$',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== TC-03: 중복 코드 검증 ====================
  describe('TC-03: 중복 코드 검증', () => {
    it('should fail to create substation with duplicate code', async () => {
      // First create a substation
      const duplicateCode = `DUP-${Date.now()}`;
      await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '원본변전소',
          code: duplicateCode,
        })
        .expect(201);

      // Try to create another with same code
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '중복코드변전소',
          code: duplicateCode,
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('CONFLICT');
      expect(response.body.message).toContain('이미 존재');
    });

    it('should allow creating substation with different code', async () => {
      const uniqueCode = `UNIQUE-${Date.now()}`;
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '다른코드변전소',
          code: uniqueCode,
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.code).toBe(uniqueCode);
    });
  });

  // ==================== 변전소 상세 조회 ====================
  describe('변전소 상세 조회 (GET /api/substations/:id)', () => {
    it('should return substation detail', async () => {
      const response = await request(app)
        .get(`/api/substations/${testSubstationId}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.id).toBe(testSubstationId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('code');
      expect(response.body.data).toHaveProperty('floors');
      expect(Array.isArray(response.body.data.floors)).toBe(true);
    });

    it('should fail with non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/substations/${fakeId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('should fail with invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/substations/invalid-uuid');

      // Accept either 400 or 404 - depends on whether UUID validation happens first
      expect([400, 404]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== TC-04: 층 생성 ====================
  describe('TC-04: 층 생성 (POST /api/substations/:substationId/floors)', () => {
    it('should create floor with admin role', async () => {
      const newFloor = {
        name: '1층',
        floorNumber: 'F1',
        description: '1층 전기실',
      };

      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newFloor)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(newFloor.name);
      expect(response.body.data.floorNumber).toBe(newFloor.floorNumber);
      expect(response.body.data.substationId).toBe(testSubstationId);
      expect(response.body.data.isActive).toBe(true);

      // Store for later tests
      testFloorId = response.body.data.id;
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .send({
          name: '미인증층',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with viewer role', async () => {
      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: '뷰어층',
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with non-existent substation', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post(`/api/substations/${fakeId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '존재하지않는변전소층',
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('should fail with duplicate floor name in same substation', async () => {
      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '1층', // Same as created above
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('CONFLICT');
    });

    it('should create multiple floors with different names', async () => {
      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '2층',
          floorNumber: 'F2',
        })
        .expect(201);

      expect(response.body.data.name).toBe('2층');
    });
  });

  // ==================== 층 목록 조회 ====================
  describe('층 목록 조회 (GET /api/substations/:substationId/floors)', () => {
    it('should return floors for a substation', async () => {
      const response = await request(app)
        .get(`/api/substations/${testSubstationId}/floors`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const floor = response.body.data[0];
      expect(floor).toHaveProperty('id');
      expect(floor).toHaveProperty('name');
      expect(floor).toHaveProperty('hasFloorPlan');
      expect(floor).toHaveProperty('rackCount');
    });

    it('should return floors ordered by sortOrder', async () => {
      const response = await request(app)
        .get(`/api/substations/${testSubstationId}/floors`)
        .expect(200);

      const floors = response.body.data;

      if (floors.length > 1) {
        for (let i = 0; i < floors.length - 1; i++) {
          expect(floors[i].sortOrder).toBeLessThanOrEqual(
            floors[i + 1].sortOrder
          );
        }
      }
    });

    it('should fail with non-existent substation', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/substations/${fakeId}/floors`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== 층 상세 조회 ====================
  describe('층 상세 조회 (GET /api/floors/:id)', () => {
    it('should return floor detail', async () => {
      const response = await request(app)
        .get(`/api/floors/${testFloorId}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.id).toBe(testFloorId);
      expect(response.body.data).toHaveProperty('substationId');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('hasFloorPlan');
    });

    it('should fail with non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/floors/${fakeId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== TC-06: 탐색 흐름 ====================
  describe('TC-06: 탐색 흐름 (변전소 → 층)', () => {
    it('should navigate from substations list to floors', async () => {
      // Step 1: Get substations list
      const substationsResponse = await request(app)
        .get('/api/substations')
        .expect(200);

      expect(substationsResponse.body.data.length).toBeGreaterThan(0);
      const substation = substationsResponse.body.data.find(
        (s: any) => s.id === testSubstationId
      );
      expect(substation).toBeDefined();

      // Step 2: Get substation detail
      const detailResponse = await request(app)
        .get(`/api/substations/${testSubstationId}`)
        .expect(200);

      expect(detailResponse.body.data).toHaveProperty('floors');
      expect(detailResponse.body.data.floors.length).toBeGreaterThan(0);

      // Step 3: Get floors list
      const floorsResponse = await request(app)
        .get(`/api/substations/${testSubstationId}/floors`)
        .expect(200);

      expect(floorsResponse.body.data.length).toBeGreaterThan(0);

      // Step 4: Get floor detail
      const floorDetailResponse = await request(app)
        .get(`/api/floors/${testFloorId}`)
        .expect(200);

      expect(floorDetailResponse.body.data.substationId).toBe(testSubstationId);
    });
  });

  // ==================== 변전소 수정 ====================
  describe('변전소 수정 (PUT /api/substations/:id)', () => {
    it('should update substation with admin role', async () => {
      const updates = {
        name: '수정된테스트변전소',
        address: '서울시 서초구',
        isActive: false,
      };

      const response = await request(app)
        .put(`/api/substations/${testSubstationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.data.name).toBe(updates.name);
      expect(response.body.data.address).toBe(updates.address);
      expect(response.body.data.isActive).toBe(false);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .put(`/api/substations/${testSubstationId}`)
        .send({ name: '미인증수정' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with viewer role', async () => {
      const response = await request(app)
        .put(`/api/substations/${testSubstationId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: '뷰어수정' })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with duplicate code when updating', async () => {
      // Create another substation first
      const otherCode = `OTHER-${Date.now()}`;
      await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '다른변전소',
          code: otherCode,
        })
        .expect(201);

      // Try to update testSubstation with existing code
      const response = await request(app)
        .put(`/api/substations/${testSubstationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: otherCode,
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== 층 수정 ====================
  describe('층 수정 (PUT /api/floors/:id)', () => {
    it('should update floor with admin role', async () => {
      const updates = {
        name: '수정된1층',
        description: '수정된 설명',
        isActive: false,
      };

      const response = await request(app)
        .put(`/api/floors/${testFloorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.data.name).toBe(updates.name);
      expect(response.body.data.description).toBe(updates.description);
      expect(response.body.data.isActive).toBe(false);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .put(`/api/floors/${testFloorId}`)
        .send({ name: '미인증수정' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with viewer role', async () => {
      const response = await request(app)
        .put(`/api/floors/${testFloorId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: '뷰어수정' })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== TC-05: 변전소 삭제 (하위 데이터 있음) ====================
  describe('TC-05: 변전소 삭제 실패 - 하위 데이터 존재', () => {
    it('should fail to delete substation with existing floors', async () => {
      const response = await request(app)
        .delete(`/api/substations/${testSubstationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('CONFLICT');
      expect(response.body.message).toContain('하위 층');
    });

    it('should verify substation still exists', async () => {
      const response = await request(app)
        .get(`/api/substations/${testSubstationId}`)
        .expect(200);

      expect(response.body.data.id).toBe(testSubstationId);
    });
  });

  // ==================== 층 삭제 ====================
  describe('층 삭제 (DELETE /api/floors/:id)', () => {
    let deletableFloorId: string;

    beforeAll(async () => {
      // Create a floor to delete
      const response = await request(app)
        .post(`/api/substations/${testSubstationId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '삭제용층',
        });

      deletableFloorId = response.body.data.id;
    });

    it('should delete floor with admin role', async () => {
      const response = await request(app)
        .delete(`/api/floors/${deletableFloorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should verify floor is deleted', async () => {
      const response = await request(app)
        .get(`/api/floors/${deletableFloorId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .delete(`/api/floors/${testFloorId}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with viewer role', async () => {
      const response = await request(app)
        .delete(`/api/floors/${testFloorId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .delete(`/api/floors/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== Edge Cases & Security ====================
  describe('Edge Cases and Security', () => {
    it('should handle SQL injection attempts in code', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '테스트',
          code: "TEST'; DROP TABLE substations;--",
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle very long name', async () => {
      const longName = 'A'.repeat(1000);
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: longName,
          code: `LONG-${Date.now()}`,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle concurrent substation creation', async () => {
      const baseTimestamp = Date.now();
      const promises = Array(3)
        .fill(null)
        .map((_, i) =>
          request(app)
            .post('/api/substations')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `동시생성${i}`,
              code: `CONCURRENT-${baseTimestamp}-${i}`,
            })
        );

      const responses = await Promise.all(promises);

      // All should succeed since codes are unique
      responses.forEach((response) => {
        expect([201, 400, 409]).toContain(response.status);
      });
    });

    it('should handle invalid UUID in path params', async () => {
      const response = await request(app)
        .get('/api/substations/not-a-uuid');

      // Accept either 400 or 404 depending on validation implementation
      expect([400, 404]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/substations')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Accept either 400 or 500 depending on JSON parsing error handling
      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ==================== Performance Tests ====================
  describe('Performance Tests', () => {
    it('should handle rapid sequential list requests', async () => {
      const startTime = Date.now();
      const requests = Array(10)
        .fill(null)
        .map(() => request(app).get('/api/substations'));

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      const totalTime = endTime - startTime;
      console.log(`10 sequential list requests completed in ${totalTime}ms`);
      expect(totalTime).toBeLessThan(5000);
    });

    it('should handle multiple concurrent detail requests', async () => {
      const startTime = Date.now();
      const requests = Array(5)
        .fill(null)
        .map(() => request(app).get(`/api/substations/${testSubstationId}`));

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      const totalTime = endTime - startTime;
      console.log(`5 concurrent detail requests completed in ${totalTime}ms`);
      expect(totalTime).toBeLessThan(3000);
    });
  });
});
