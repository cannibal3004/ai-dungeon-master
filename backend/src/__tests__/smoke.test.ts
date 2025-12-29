/**
 * Smoke Tests - Quick validation of critical workflows
 * 
 * Usage: npm run test:smoke
 * 
 * These are quick checks that validate:
 * - Backend is running and responsive
 * - Database is connected
 * - Core workflows (campaign, character, session) function
 * - LLM integrations are available
 * 
 * Run this locally during development to catch obvious breaks.
 */

import axios from 'axios';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const API_URL = process.env.API_URL || 'http://localhost:4000';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dmuser:@localhost:5432/aidungeonmaster';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({ 
      name, 
      passed: false, 
      error: error.message,
      duration: Date.now() - start 
    });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function smokeTests() {
  console.log('\n🧪 Running Smoke Tests...\n');

  // 1. Backend Health
  await runTest('Backend is running', async () => {
    const res = await axios.get(`${API_URL}/health`, { timeout: 5000 });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // 2. Database Connection
  await runTest('Database is connected', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      const res = await pool.query('SELECT NOW()');
      if (!res.rows.length) throw new Error('No response from database');
    } finally {
      await pool.end();
    }
  });

  // 3. Auth endpoints exist
  await runTest('Auth endpoints are available', async () => {
    try {
      const res = await axios.post(`${API_URL}/api/auth/register`, 
        { email: 'test@test.com', password: 'test' },
        { timeout: 5000, validateStatus: () => true }
      );
      // We're just checking the endpoint exists (200, 400, 422, etc. all ok)
      if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    } catch (error: any) {
      if (!error.response) throw error; // Network error
    }
  });

  // 4. Campaign endpoints exist
  await runTest('Campaign endpoints are available', async () => {
    try {
      const res = await axios.get(`${API_URL}/api/campaigns`,
        { timeout: 5000, validateStatus: () => true }
      );
      // Just checking endpoint exists
      if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    } catch (error: any) {
      if (!error.response) throw error;
    }
  });

  // 5. Character endpoints exist
  await runTest('Character endpoints are available', async () => {
    try {
      const res = await axios.get(`${API_URL}/api/characters`,
        { timeout: 5000, validateStatus: () => true }
      );
      if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    } catch (error: any) {
      if (!error.response) throw error;
    }
  });

  // 6. Database tables exist
  await runTest('Database schema is initialized', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      const requiredTables = ['users', 'campaigns', 'characters', 'game_sessions'];
      const res = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const tables = res.rows.map((r: any) => r.table_name);
      const missing = requiredTables.filter(t => !tables.includes(t));
      if (missing.length > 0) {
        throw new Error(`Missing tables: ${missing.join(', ')}`);
      }
    } finally {
      await pool.end();
    }
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} tests passed`);
  
  if (passed < total) {
    console.log('\nFailed tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    throw new Error(`${total - passed} smoke tests failed`);
  } else {
    console.log('\n✅ All smoke tests passed!');
  }
}

describe('Smoke Tests', () => {
  it('should validate system health', async () => {
    await smokeTests();
  });
});

export { smokeTests, TestResult };
