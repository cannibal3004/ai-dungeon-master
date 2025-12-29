// Jest setup for integration/smoke tests: loads env, no mocks
import path from 'path';
import dotenv from 'dotenv';

// Load project root .env then optional backend/.env.test
try {
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env.test') });
} catch {}

// Ensure reasonable timeout for integration
jest.setTimeout(20000);

// Helpful log of DB URL presence (disabled in CI noise)
if (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log('Integration env detected: TEST_DATABASE_URL/DATABASE_URL is set');
} else {
  // eslint-disable-next-line no-console
  console.warn('⚠️  TEST_DATABASE_URL not configured');
}
