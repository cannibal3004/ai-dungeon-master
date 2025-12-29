import { Pool } from 'pg';
import { getDatabase } from '../utils/database';

export interface Quest {
  id: string;
  campaign_id: string;
  title: string;
  description?: string;
  giver?: string;
  location?: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  objectives: string[];
  rewards?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export class QuestModel {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createQuest(
    campaignId: string,
    title: string,
    description?: string,
    giver?: string,
    location?: string,
    objectives?: string[],
    rewards?: string
  ): Promise<Quest> {
    const query = `
      INSERT INTO quests (campaign_id, title, description, giver, location, objectives, rewards, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
    `;
    const result = await this.db.query(query, [
      campaignId,
      title,
      description,
      giver,
      location,
      JSON.stringify(objectives || []),
      rewards,
    ]);
    return result.rows[0];
  }

  async updateQuest(
    questId: string,
    updates: {
      title?: string;
      description?: string;
      status?: 'active' | 'completed' | 'failed' | 'abandoned';
      objectives?: string[];
      rewards?: string;
      notes?: string;
    }
  ): Promise<Quest> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      if (updates.status === 'completed' || updates.status === 'failed') {
        fields.push(`completed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (updates.objectives !== undefined) {
      fields.push(`objectives = $${paramIndex++}`);
      values.push(JSON.stringify(updates.objectives));
    }
    if (updates.rewards !== undefined) {
      fields.push(`rewards = $${paramIndex++}`);
      values.push(updates.rewards);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(questId);

    const query = `
      UPDATE quests
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getQuestsByCampaign(
    campaignId: string,
    status?: 'active' | 'completed' | 'failed' | 'abandoned'
  ): Promise<Quest[]> {
    const query = status
      ? 'SELECT * FROM quests WHERE campaign_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM quests WHERE campaign_id = $1 ORDER BY created_at DESC';
    const params = status ? [campaignId, status] : [campaignId];
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async getQuestById(questId: string): Promise<Quest | null> {
    const query = 'SELECT * FROM quests WHERE id = $1';
    const result = await this.db.query(query, [questId]);
    return result.rows[0] || null;
  }

  async deleteQuest(questId: string): Promise<void> {
    await this.db.query('DELETE FROM quests WHERE id = $1', [questId]);
  }
}
