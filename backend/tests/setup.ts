import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env' });

// Global test setup
beforeAll(() => {
  console.log('🚀 Starting test suite...');
});

afterAll(() => {
  console.log('✅ Test suite completed');
});
