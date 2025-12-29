/**
 * Test Helpers - Authentication and common test utilities
 */
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

/**
 * Create a test user and return credentials with auth token
 */
export async function createTestUser(app: any): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = 'Test123!@#';

  // Register user
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({ email, password, username: email.split('@')[0] });

  if (registerRes.status !== 201) {
    throw new Error(`Failed to register test user: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
  }

  // Login to get token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (loginRes.status !== 200) {
    throw new Error(`Failed to login test user: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return {
    id: registerRes.body.data?.user?.id || registerRes.body.user?.id || loginRes.body.data?.user?.id || loginRes.body.user?.id,
    email,
    password,
    token: loginRes.body.data?.token || loginRes.body.token,
  };
}

/**
 * Clean up test user from database
 */
export async function cleanupTestUser(pool: Pool, userId: string): Promise<void> {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create a test campaign for a user
 */
export async function createTestCampaign(app: any, token: string, name?: string): Promise<any> {
  const campaignName = name || `Test Campaign ${uuidv4().slice(0, 8)}`;
  
  const res = await request(app)
    .post('/api/campaigns')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: campaignName,
      description: 'Test campaign description',
      setting: 'fantasy',
    });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Failed to create test campaign: ${res.status}`);
  }

  return res.body.data?.campaign || res.body.campaign || res.body;
}

/**
 * Create a test character for a campaign
 */
export async function createTestCharacter(
  app: any, 
  token: string, 
  campaignId: string,
  name?: string
): Promise<any> {
  const characterName = name || `Test Hero ${uuidv4().slice(0, 8)}`;
  
  const res = await request(app)
    .post('/api/characters')
    .set('Authorization', `Bearer ${token}`)
    .send({
      campaignId,
      name: characterName,
      race: 'human',
      class: 'fighter',
      customScores: {
        strength: 16,
        dexterity: 14,
        constitution: 15,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
    });

  if (res.status !== 201 && res.status !== 200) {
    const errorDetails = JSON.stringify(res.body, null, 2);
    throw new Error(`Failed to create test character: ${res.status}\n${errorDetails}`);
  }

  return res.body.data?.character || res.body.character || res.body;
}
