import { Pool } from 'pg';
import { getDatabase } from '../utils/database';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  settings?: any;
}

export interface CampaignWithCreator extends Campaign {
  creator_username: string;
  creator_email: string;
}

export interface SessionPlayer {
  user_id: string;
  character_id: string;
  username: string;
  character_name: string;
  joined_at: Date;
}

export class CampaignModel {
  private pool: Pool;

  constructor() {
    this.pool = getDatabase();
  }

  async createCampaign(
    name: string,
    description: string,
    createdBy: string,
    settings?: any
  ): Promise<Campaign> {
    const query = `
      INSERT INTO campaigns (name, description, created_by, settings)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [name, description, createdBy, settings ? JSON.stringify(settings) : null];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<CampaignWithCreator | null> {
    const query = `
      SELECT c.*, u.username as creator_username, u.email as creator_email
      FROM campaigns c
      JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByCreator(creatorId: string): Promise<Campaign[]> {
    const query = `
      SELECT * FROM campaigns
      WHERE created_by = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [creatorId]);
    return result.rows;
  }

  async findAll(limit = 50, offset = 0): Promise<CampaignWithCreator[]> {
    const query = `
      SELECT c.*, u.username as creator_username, u.email as creator_email
      FROM campaigns c
      JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await this.pool.query(query, [limit, offset]);
    return result.rows;
  }

  async updateCampaign(
    id: string,
    updates: { name?: string; description?: string; settings?: any }
  ): Promise<Campaign | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.settings !== undefined) {
      setClauses.push(`settings = $${paramCount++}`);
      values.push(JSON.stringify(updates.settings));
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE campaigns
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const query = 'DELETE FROM campaigns WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async addPlayerToCampaign(
    campaignId: string,
    userId: string,
    characterId: string
  ): Promise<void> {
    // Get active session for this campaign
    const sessionResult = await this.pool.query(
      `SELECT id FROM game_sessions 
       WHERE campaign_id = $1 AND state = 'active' 
       ORDER BY last_activity DESC LIMIT 1`,
      [campaignId]
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('No active session found for this campaign. Start a session first.');
    }
    
    const sessionId = sessionResult.rows[0].id;
    const query = `
      INSERT INTO session_players (session_id, player_id, character_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (session_id, player_id) DO UPDATE
      SET character_id = $3, last_seen = CURRENT_TIMESTAMP, is_active = true
    `;
    await this.pool.query(query, [sessionId, userId, characterId]);
  }

  async removePlayerFromCampaign(campaignId: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM session_players 
      WHERE session_id IN (
        SELECT id FROM game_sessions WHERE campaign_id = $1
      ) AND player_id = $2
    `;
    await this.pool.query(query, [campaignId, userId]);
  }

  async getCampaignPlayers(campaignId: string): Promise<SessionPlayer[]> {
    const query = `
      SELECT 
        sp.player_id as user_id,
        sp.character_id,
        u.username,
        c.name as character_name,
        sp.joined_at,
        sp.is_active,
        sp.last_seen
      FROM session_players sp
      JOIN users u ON sp.player_id = u.id
      LEFT JOIN characters c ON sp.character_id = c.id
      WHERE sp.session_id IN (
        SELECT id FROM game_sessions 
        WHERE campaign_id = $1 AND state = 'active'
        ORDER BY last_activity DESC LIMIT 1
      )
      ORDER BY sp.joined_at ASC
    `;
    const result = await this.pool.query(query, [campaignId]);
    return result.rows;
  }

  async isPlayerInCampaign(campaignId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM session_players sp
      JOIN game_sessions gs ON sp.session_id = gs.id
      WHERE gs.campaign_id = $1 AND sp.player_id = $2
    `;
    const result = await this.pool.query(query, [campaignId, userId]);
    return result.rows.length > 0;
  }
}
