# Floor Plan Editor Test Suite

## Quick Start

### Run All Floor Plan Tests
```bash
cd /Users/jsk/1208/ict-digital-twin/backend
npm test -- floorPlan.service.test.ts floorPlanElement.service.test.ts rack.service.test.ts
```

### Run Individual Test Files
```bash
# Floor Plan Service tests
npm test -- floorPlan.service.test.ts

# Floor Plan Element Service tests
npm test -- floorPlanElement.service.test.ts

# Rack Service tests
npm test -- rack.service.test.ts
```

### Generate Coverage Report
```bash
npm run test:coverage -- floorPlan.service.test.ts floorPlanElement.service.test.ts rack.service.test.ts
```

---

## Test Files

### Unit Tests (No Database Required)
1. **`floorPlan.service.test.ts`** - FloorPlanService unit tests
   - 14 tests covering CRUD operations
   - Tests: getByFloorId, create, bulkUpdate, delete
   - Full mock implementation of Prisma

2. **`floorPlanElement.service.test.ts`** - FloorPlanElementService unit tests
   - 11 tests covering element operations
   - Tests: getByFloorPlanId, create, update, delete
   - Element types: wall, door, window, column

3. **`rack.service.test.ts`** - RackService unit tests
   - 19 tests covering rack management
   - Tests: CRUD operations, image updates, equipment calculations
   - Includes duplicate name validation and deletion constraints

### Integration Tests (Database Required)
4. **`floorPlan.integration.test.ts`** - Floor Plan API integration tests
   - Full API endpoint testing
   - Authentication and authorization
   - Complete workflow scenarios

5. **`rack.integration.test.ts`** - Rack API integration tests
   - Rack CRUD workflows
   - Concurrent operation handling
   - Edge case validation

---

## Test Results

### Latest Run (2024-12-08)
```
✓ tests/floorPlanElement.service.test.ts (11 tests) 4ms
✓ tests/rack.service.test.ts (19 tests) 5ms
✓ tests/floorPlan.service.test.ts (14 tests) 5ms

Test Files  3 passed (3)
     Tests  44 passed (44)
  Duration  151ms
```

### Coverage Report
```
File                     | % Stmts | % Branch | % Funcs | % Lines
-------------------------|---------|----------|---------|--------
services/
  floorPlan.service.ts   |   95.65 |    73.43 |     100 |   95.65
  floorPlanElement.service.ts | 100 |      100 |     100 |     100
  rack.service.ts        |   95.45 |    96.87 |   81.81 |   95.34
```

**Service Layer Coverage**: 96.39% statements, 83.33% branches, 91.3% functions

---

## Test Categories

### 1. FloorPlan Service Tests

#### getByFloorId
- ✅ Retrieve floor plan with elements and racks
- ✅ Handle non-existent floor (NotFoundError)
- ✅ Return null when floor plan doesn't exist

#### create
- ✅ Create with default dimensions (2000x1500, grid 20)
- ✅ Create with custom dimensions
- ✅ Prevent duplicate floor plans (ConflictError)
- ✅ Validate floor existence (NotFoundError)

#### bulkUpdate
- ✅ Add new elements to floor plan
- ✅ Update existing elements
- ✅ Delete elements and racks in transaction
- ✅ Prevent duplicate rack names (ConflictError)
- ✅ Handle non-existent floor plan (NotFoundError)

#### delete
- ✅ Delete floor plan successfully
- ✅ Handle non-existent floor plan (NotFoundError)

---

### 2. FloorPlanElement Service Tests

#### getByFloorPlanId
- ✅ Retrieve all elements ordered by zIndex
- ✅ Handle non-existent floor plan (NotFoundError)

#### create
- ✅ Create element with default values (zIndex: 0, isVisible: true)
- ✅ Create with custom zIndex and visibility
- ✅ Validate floor plan existence (NotFoundError)

#### update
- ✅ Update element properties and zIndex
- ✅ Update visibility flag
- ✅ Handle non-existent element (NotFoundError)

#### delete
- ✅ Delete element successfully
- ✅ Handle non-existent element (NotFoundError)

---

### 3. Rack Service Tests

#### getByFloorPlanId
- ✅ Retrieve all racks with equipment counts
- ✅ Calculate usedU correctly (sum of equipment heightU)
- ✅ Handle non-existent floor plan (NotFoundError)

#### getById
- ✅ Return rack details including images
- ✅ Handle non-existent rack (NotFoundError)

#### create
- ✅ Create rack with default values (60x100, 42U)
- ✅ Create with custom dimensions and rotation
- ✅ Prevent duplicate names (ConflictError)
- ✅ Validate floor plan existence (NotFoundError)

#### update
- ✅ Update position, rotation, dimensions
- ✅ Update name with duplicate check
- ✅ Update code and description
- ✅ Handle non-existent rack (NotFoundError)

#### delete
- ✅ Delete rack when no equipment exists
- ✅ Prevent deletion with equipment (ConflictError)
- ✅ Handle non-existent rack (NotFoundError)

#### updateImage
- ✅ Update front image URL
- ✅ Update rear image URL
- ✅ Handle non-existent rack (NotFoundError)

---

## Running Integration Tests

### Prerequisites
1. **Start PostgreSQL Database**
   ```bash
   docker-compose up -d postgres
   ```

2. **Run Database Migrations**
   ```bash
   npm run db:migrate
   ```

3. **Seed Test Data**
   ```bash
   npm run db:seed
   ```

### Run Integration Tests
```bash
# Floor Plan API tests
npm test -- floorPlan.integration.test.ts

# Rack API tests
npm test -- rack.integration.test.ts

# Both integration test suites
npm test -- floorPlan.integration.test.ts rack.integration.test.ts
```

---

## Test Architecture

### Mocking Strategy
- **Prisma Client**: Fully mocked using Vitest's `vi.mock()`
- **No Database Required**: Unit tests run independently
- **Fast Execution**: Average < 5ms per test suite
- **Isolated Tests**: Each test has clean mock state

### Error Handling
- **NotFoundError**: Resource not found scenarios
- **ConflictError**: Duplicate names, constraint violations
- **Validation Errors**: Missing required fields, invalid data
- **Transaction Rollback**: Bulk operation failures

### Test Data
- **Consistent IDs**: Use predictable test IDs
- **Edge Cases**: Empty arrays, null values, large numbers
- **Realistic Scenarios**: Based on actual floor plan usage

---

## Test Maintenance

### Adding New Tests
1. Follow existing test structure (Arrange-Act-Assert)
2. Use descriptive test names
3. Mock Prisma responses appropriately
4. Test both success and error paths
5. Include edge cases

### Test Naming Convention
```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should [expected behavior]', async () => {
      // Test implementation
    });
  });
});
```

### Common Patterns
```typescript
// Mock successful response
vi.mocked(prisma.model.method).mockResolvedValue(mockData);

// Mock error
vi.mocked(prisma.model.method).mockResolvedValue(null);

// Verify mock calls
expect(prisma.model.method).toHaveBeenCalledWith(expectedArgs);
```

---

## Troubleshooting

### Tests Fail with Database Connection Error
**Solution**: Use unit tests (`.service.test.ts` files) which don't require database.

### Mock Not Working
**Solution**: Ensure `vi.clearAllMocks()` in `beforeEach()` hook.

### Type Errors
**Solution**: Cast mock data with `as any` for complex Prisma types.

### Coverage Issues
**Solution**: Run coverage with specific test files:
```bash
npm run test:coverage -- [test-file-pattern]
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Floor Plan Tests
  run: |
    npm test -- floorPlan.service.test.ts floorPlanElement.service.test.ts rack.service.test.ts
```

### Test Thresholds
- **Statements**: 90%
- **Branches**: 80%
- **Functions**: 90%
- **Lines**: 90%

---

## Related Documentation
- [Test Report](./FLOOR_PLAN_TEST_REPORT.md) - Detailed test results and metrics
- [PRD 03](../../docs/prd/prd-03-floor-plan-editor.md) - Floor Plan Editor requirements
- [API Documentation](../src/routes/README.md) - API endpoint specifications

---

## Contact
For questions or issues with tests, please refer to the project documentation or create an issue in the repository.
