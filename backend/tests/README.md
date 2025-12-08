# ICT Digital Twin Backend Tests

## Overview

Comprehensive test suite for the ICT Digital Twin authentication API using Vitest and Supertest.

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── auth.test.ts                # Unit tests for auth endpoints
└── auth.integration.test.ts    # Integration tests for auth flows
```

## Test Coverage

### Unit Tests (`auth.test.ts`)

- **Login Tests**: Valid/invalid credentials, validation, edge cases
- **Token Refresh**: Valid/invalid refresh tokens
- **User Profile**: Authenticated access, authorization
- **Password Change**: Password validation, security
- **Logout**: Session management
- **Security**: SQL injection, XSS, concurrent requests

### Integration Tests (`auth.integration.test.ts`)

- **Complete User Journey**: Login → Access → Refresh → Logout
- **Security Scenarios**: Token reuse, cross-user access
- **Performance Tests**: Concurrent requests, load testing
- **Error Recovery**: Invalid state recovery

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Accounts

- **Admin**: username: `admin`, password: `admin1234`
- **Viewer**: username: `viewer`, password: `viewer1234`

## Prerequisites

1. Database must be running (PostgreSQL on port 5433)
2. Database must be seeded with test users
3. Server should be running on port 3001

## Test Configuration

Configuration is defined in `vitest.config.ts`:

- **Environment**: Node.js
- **Coverage Provider**: c8
- **Reporters**: text, json, html
- **Setup Files**: `tests/setup.ts`

## Writing New Tests

Example test structure:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('Feature Name', () => {
  it('should do something', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .send({ data: 'value' })
      .expect(200);

    expect(response.body).toHaveProperty('field');
  });
});
```

## Best Practices

1. **Arrange-Act-Assert**: Structure tests clearly
2. **Descriptive Names**: Test names should explain what they test
3. **Independent Tests**: Tests should not depend on each other
4. **Clean Up**: Reset state after tests if needed
5. **Mock External Dependencies**: Use mocks for external services

## Coverage Goals

- **Unit Tests**: >80% code coverage
- **Integration Tests**: >70% coverage
- **Critical Paths**: 100% coverage

## Continuous Integration

Tests run automatically on:
- Pre-commit hooks
- Pull requests
- CI/CD pipeline

## Troubleshooting

### Database Connection Issues
```bash
# Check database is running
docker ps | grep postgres

# Check connection
psql -h localhost -p 5433 -U postgres -d ict_digital_twin
```

### Port Conflicts
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

### Test Failures
- Ensure database is seeded
- Check environment variables in `.env`
- Verify server is running
- Check for port conflicts

## Performance Benchmarks

- Login: < 500ms
- Token Refresh: < 200ms
- Profile Access: < 100ms
- Password Change: < 500ms

## Security Considerations

- Passwords are hashed with bcrypt
- JWT tokens for authentication
- Input validation with Zod
- SQL injection prevention
- XSS protection
- CSRF protection (when needed)
