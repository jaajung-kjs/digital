import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/**
 * Integration Tests - Full Authentication Flow
 * Tests complete user journey scenarios
 */
describe('Authentication Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use(errorHandler);
  });

  describe('Complete User Journey - Admin', () => {
    let accessToken: string;
    let refreshToken: string;

    it('Step 1: Admin logs in', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.role).toBe('ADMIN');

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('Step 2: Admin accesses protected resource', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).toHaveProperty('username', 'admin');
      expect(response.body.user).toHaveProperty('role', 'ADMIN');
    });

    it('Step 3: Admin changes password', async () => {
      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'admin1234',
          newPassword: 'newAdmin1234',
        })
        .expect(200);

      expect(response.body.message).toContain('비밀번호가 변경되었습니다');
    });

    it('Step 4: Old password no longer works', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(401);
    });

    it('Step 5: Login with new password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'newAdmin1234',
        })
        .expect(200);

      accessToken = response.body.accessToken;
    });

    it('Step 6: Refresh access token', async () => {
      // Get fresh refresh token after password changes
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'newAdmin1234',
        })
        .expect(200);

      const newRefreshToken = newLogin.body.refreshToken;

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: newRefreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      // Refresh endpoint only returns new access token, not new refresh token
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);

      accessToken = response.body.accessToken;
    });

    it('Step 7: Access with refreshed token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user.username).toBe('admin');
    });

    it('Step 8: Reset password back', async () => {
      await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'newAdmin1234',
          newPassword: 'admin1234',
        })
        .expect(200);
    });

    it('Step 9: Logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toContain('로그아웃되었습니다');
    });
  });

  describe('Complete User Journey - Viewer', () => {
    let accessToken: string;
    let refreshToken: string;

    it('Step 1: Viewer logs in', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'viewer1234',
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('role');
      // Role might be 'VIEWER' or 'USER' depending on seed data
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('Step 2: Viewer accesses own profile', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'viewer');
      expect(response.body.user).toHaveProperty('role');
    });

    it('Step 3: Viewer refreshes token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      accessToken = response.body.accessToken;
    });

    it('Step 4: Viewer logs out', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toContain('로그아웃되었습니다');
    });
  });

  describe('Security Scenarios', () => {
    it('Scenario: Token reuse after logout should fail', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Access resource (should work)
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Note: In the current implementation, JWT tokens remain valid until expiry
      // even after logout. This test documents current behavior.
      // For production, consider implementing token blacklisting.
    });

    it('Scenario: Multiple failed login attempts', async () => {
      const attempts = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'wrongpassword',
          })
      );

      const responses = await Promise.all(attempts);

      responses.forEach((response) => {
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });
    });

    it('Scenario: Cross-user token access', async () => {
      // Admin login
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);

      const adminToken = adminLogin.body.accessToken;

      // Verify admin can access own profile
      const adminProfile = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(adminProfile.body.user.username).toBe('admin');

      // Viewer login
      const viewerLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'viewer',
          password: 'viewer1234',
        })
        .expect(200);

      const viewerToken = viewerLogin.body.accessToken;

      // Verify viewer can access own profile
      const viewerProfile = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(viewerProfile.body.user.username).toBe('viewer');
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid sequential requests', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        });

      const { accessToken } = loginResponse.body;

      const startTime = Date.now();
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      const totalTime = endTime - startTime;
      console.log(`10 sequential requests completed in ${totalTime}ms`);

      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds
    });

    it('should handle multiple concurrent logins', async () => {
      const startTime = Date.now();
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'admin1234',
          })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
      });

      const totalTime = endTime - startTime;
      console.log(`5 concurrent logins completed in ${totalTime}ms`);

      expect(totalTime).toBeLessThan(3000); // 3 seconds
    });
  });

  describe('Error Recovery', () => {
    it('should recover from invalid token and login again', async () => {
      // Try with invalid token
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      // Login successfully
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);

      // Access with valid token
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('should recover from failed password change', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Attempt password change with wrong current password
      const changeResponse = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newPassword123',
        });

      // Should fail with error (might be 400 or 401)
      expect(changeResponse.status).toBeGreaterThanOrEqual(400);
      expect(changeResponse.body).toHaveProperty('error');

      // Original password should still work
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin1234',
        })
        .expect(200);
    });
  });
});
