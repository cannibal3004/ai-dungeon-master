# Testing Strategy

## Overview

This project uses a **practical testing approach** optimized for an API service that integrates with external LLMs, a real database, and frequent changes:

- **Smoke Tests** - Quick local checks during development
- **Integration Tests** - Real API endpoints with test database
- **E2E Tests** (Frontend) - Full workflow testing in the browser

## Why Not Unit Tests?

We deliberately skip traditional unit tests with mocks because:

1. **Mocking is misleading** - Tests pass but real code fails
2. **Your code is integration-heavy** - API service + database + LLM APIs
3. **Regressions happen at boundaries** - Between services, not inside functions
4. **Unit tests don't catch LLM breaks** - Mock responses lie
5. **Maintenance burden** - Every refactor requires mock updates

The code compiles cleanly (zero TypeScript errors), so unit tests don't add value.

## Smoke Tests (Recommended for Development)

Quick validation that catches most regressions.

```bash
# During development - run this after making changes
npm run test:smoke
```

**What it checks:**
- Backend responds to requests
- Database is connected and has required tables
- Core endpoints exist and respond
- API is accessible

**When to use:** After every significant change, before committing

**Example output:**
```
✅ Backend is running
✅ Database is connected
✅ Auth endpoints are available
✅ Campaign endpoints are available
✅ Character endpoints are available
✅ Database schema is initialized

Results: 6/6 tests passed
```

**Time:** ~2-5 seconds

## Integration Tests (For CI/CD)

Real API tests with test database - comprehensive but slower.

```bash
# Run all integration tests
npm run test:integration

# Watch mode (re-run on changes)
npm run test:integration -- --watch
```

**What it tests:**
- API contracts (endpoints return correct shapes)
- Database operations (CRUD works correctly)
- Error handling (invalid requests fail gracefully)
- State management (data persists correctly)
- Workflow chains (create campaign → create character → etc.)

**Setup required:**
- Set `TEST_DATABASE_URL` environment variable pointing to test database
- Test database should be a separate Postgres instance or test schema

**Example:**
```bash
export TEST_DATABASE_URL="postgresql://dmuser:@localhost:5433/aidungeonmaster_test"
npm run test:integration
```

**Time:** ~5-30 seconds depending on tests

## E2E Tests (Frontend)
## E2E Tests (Frontend)

Full end-to-end workflows tested from the browser.

These are in the frontend (`tests/e2e/` or `tests/e2e.spec.ts`). They test:
- User signup and login
- Campaign creation
- Character management
- Game sessions
- LLM interactions

```bash
cd frontend
npm run test:e2e
```

## Recommended Workflow

### During Active Development
```bash
# 1. Make changes
# 2. Run smoke tests
npm run test:smoke

# 3. If smoke tests pass, you're good
# 4. Commit changes
```

### Before Pushing/Deploying
```bash
# 1. Run full test suite
npm run build
npm run test:smoke
npm run test:integration

# 2. Run frontend E2E tests
cd ../frontend && npm run test:e2e

# 3. Manual testing of critical flows
# - Create campaign
# - Create character
# - Start game session
# - Test LLM responses
```

### In CI/CD Pipeline
```bash
npm run build              # TypeScript compilation
npm run test:smoke         # Quick validation
npm run test:integration   # Full integration tests
```

## Common Issues

### "TEST_DATABASE_URL not configured" during integration tests
Integration tests will skip if no test database is set up. This is fine for local development. For CI/CD, configure a test database.

### Smoke tests fail but backend works locally
Make sure backend is running:
```bash
npm run dev
# In another terminal
npm run test:smoke
```

### Integration tests are slow
Each test creates/destroys database state. This is intentional for isolation but means:
- Don't make them too granular
- Group related tests together
- Consider using test fixtures for repeated setup

## What Gets Caught vs Missed

### ✅ Gets Caught
- API contract breaks (field renamed, response changed)
- Database query failures (schema change, bad query)
- Missing endpoints
- Validation failures
- State coordination bugs
- LLM integration failures
- Error handling issues

### ❌ Likely Misses
- Logic bugs in pure functions (rare in this codebase)
- Performance regressions
- Memory leaks
- Complex numerical calculations

For those, code review and testing specific modules are better.

## Adding New Tests

### Smoke Test
Edit `src/__tests__/smoke.test.ts`:
```typescript
// 7. New workflow test
await runTest('New feature works', async () => {
  const res = await axios.get(`${API_URL}/api/new-feature`);
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});
```

### Integration Test
Edit `src/__tests__/integration.test.ts`:
```typescript
describe('New Feature', () => {
  it('should do the thing', async () => {
    const res = await request(app)
      .post('/api/new-feature')
      .send({ data: 'test' });
    
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});
```

## Quick Reference

| Test Type | Speed | Coverage | When to Run |
|-----------|-------|----------|------------|
| Smoke | ~2s | Endpoints | After every change |
| Integration | ~10s | API + DB | Before push |
| E2E | ~30s | Full flow | Before deploy |

## Further Reading

- [Jest Documentation](https://jestjs.io/)
- [Supertest for API testing](https://github.com/visionmedia/supertest)
- [Testing Best Practices for Node.js](https://nodejs.org/en/docs/guides/testing/)
