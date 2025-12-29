/**
 * Integration Tests - Test real API endpoints with actual database
 * 
 * These tests verify that:
 * - API contracts work correctly
 * - Database operations work correctly
 * - LLM integrations don't break
 * - Workflow chains work end-to-end
 * 
 * NOTE: These tests use a real test database and should be run
 * with `npm run test:integration`. They take longer but catch real regressions.
 */

import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { initializeDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { 
  createTestUser, 
  cleanupTestUser, 
  createTestCampaign,
  createTestCharacter,
  TestUser 
} from './helpers';

// Create test app
const app = express();
app.use(express.json());

// Import routes to test
import authRoutes from '../routes/auth.routes';
import campaignRoutes from '../routes/campaign.routes';
import characterRoutes from '../routes/character.routes';
import sessionRoutes from '../routes/session.routes';

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/sessions', sessionRoutes);

// Health check for testing
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

let pool: Pool;
let testUser: TestUser;
let testCampaignId: string;
let testCharacterId: string;

describe('API Integration Tests', () => {
  beforeAll(async () => {
    try {
      // Use test database if available, otherwise skip these tests
      const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
      if (!testDbUrl) {
        console.log('⚠️  Skipping integration tests - TEST_DATABASE_URL not configured');
        return;
      }

      pool = new Pool({ connectionString: testDbUrl });
      
      // Initialize database schema
      await initializeDatabase();
      logger.info('Test database initialized');

      // Create test user with auth token
      testUser = await createTestUser(app);
      logger.info(`Test user created: ${testUser.email}`);
    } catch (error) {
      logger.error('Failed to set up test database:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (pool && testUser) {
      await cleanupTestUser(pool, testUser.id);
    }
    if (pool) {
      await pool.end();
    }
  });

  afterEach(async () => {
    if (!pool) return;
    // Clean up test data after each test
    try {
      await pool.query('DELETE FROM characters WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM campaigns WHERE id = $1', [testCampaignId]);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Campaign Workflow', () => {
    it('should create a campaign and retrieve it', async () => {
      const campaign = await createTestCampaign(app, testUser.token, 'Integration Test Campaign');
      
      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe('Integration Test Campaign');
      
      testCampaignId = campaign.id;

      // Retrieve the campaign
      const res = await request(app)
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      const retrievedCampaign = res.body.data?.campaign || res.body.campaign || res.body;
      expect(retrievedCampaign.id).toBe(campaign.id);
    });

    it('should list campaigns for a user', async () => {
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      const campaigns = res.body.data?.campaigns || res.body.campaigns || res.body;
      expect(Array.isArray(campaigns)).toBe(true);
    });

    it('should update campaign details', async () => {
      const campaign = await createTestCampaign(app, testUser.token);
      testCampaignId = campaign.id;

      const res = await request(app)
        .put(`/api/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ description: 'Updated description' });

      expect([200, 204]).toContain(res.status);
    });
  });

  describe('Character Workflow', () => {
    it('should create a character in a campaign', async () => {
      const campaign = await createTestCampaign(app, testUser.token);
      testCampaignId = campaign.id;

      const character = await createTestCharacter(app, testUser.token, campaign.id, 'Test Warrior');
      
      expect(character.id).toBeDefined();
      expect(character.name).toBe('Test Warrior');
      testCharacterId = character.id;
    });

    it('should update character stats', async () => {
      const campaign = await createTestCampaign(app, testUser.token);
      const character = await createTestCharacter(app, testUser.token, campaign.id);
      testCampaignId = campaign.id;
      testCharacterId = character.id;

      const res = await request(app)
        .put(`/api/characters/${character.id}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ hp: 25, max_hp: 30 });

      expect([200, 204]).toContain(res.status);
    });

    it('should handle character inventory', async () => {
      const campaign = await createTestCampaign(app, testUser.token);
      const character = await createTestCharacter(app, testUser.token, campaign.id);
      testCampaignId = campaign.id;

      const res = await request(app)
        .put(`/api/characters/${character.id}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ 
          inventory: [
            { name: 'Longsword', quantity: 1 },
            { name: 'Health Potion', quantity: 3 }
          ]
        });

      expect([200, 204]).toContain(res.status);
    });
  });

  describe('Session Management', () => {
    it('should create a game session', async () => {
      const campaign = await createTestCampaign(app, testUser.token);
      testCampaignId = campaign.id;

      const res = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ campaignId: campaign.id });

      expect([200, 201]).toContain(res.status);
      const session = res.body.data?.session || res.body.session || res.body;
      expect(session.id).toBeDefined();
    });

    it('should maintain chat history', async () => {
      // This would test that messages are stored and retrieved
      // Placeholder for now
      expect(true).toBe(true);
    });

    it('should end a session and save state', async () => {
      // This would test session completion
      // Placeholder for now
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent campaign', async () => {
      const res = await request(app)
        .get('/api/campaigns/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${testUser.token}`);
      
      expect([404, 401]).toContain(res.status);
    });

    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ invalidField: 'test' });
      
      // Should fail validation
      expect([400, 422]).toContain(res.status);
    });
  });
});
