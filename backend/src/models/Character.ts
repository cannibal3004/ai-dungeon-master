import { Pool } from 'pg';
import { getDatabase } from '../utils/database';

export interface Character {
  id: string;
  campaign_id: string;
  player_id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  experience: number;
  ability_scores: any;
  skills: any;
  hp: number;
  max_hp: number;
  armor_class: number;
  inventory: any;
  spells: any;
  traits: any;
  background: string | null;
  money: number;
  created_at: Date;
  updated_at: Date;
}

export class CharacterModel {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createCharacter(data: Partial<Character>): Promise<Character> {
    const query = `
      INSERT INTO characters (
        campaign_id, player_id, name, race, class, level, experience,
        ability_scores, skills, hp, max_hp, armor_class, inventory,
        spells, traits, background, money
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      data.campaign_id,
      data.player_id,
      data.name,
      data.race,
      data.class,
      data.level || 1,
      data.experience || 0,
      JSON.stringify(data.ability_scores),
      JSON.stringify(data.skills || []),
      data.hp,
      data.max_hp,
      data.armor_class,
      JSON.stringify(data.inventory || []),
      JSON.stringify(data.spells || []),
      JSON.stringify(data.traits || []),
      data.background || null,
      data.money || 0,
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<Character | null> {
    const query = 'SELECT * FROM characters WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByPlayer(playerId: string): Promise<Character[]> {
    const query = 'SELECT * FROM characters WHERE player_id = $1 ORDER BY created_at DESC';
    const result = await this.db.query(query, [playerId]);
    return result.rows;
  }

  async findByCampaign(campaignId: string): Promise<Character[]> {
    const query = 'SELECT * FROM characters WHERE campaign_id = $1 ORDER BY created_at DESC';
    const result = await this.db.query(query, [campaignId]);
    return result.rows;
  }

  async findByCampaignAndPlayer(campaignId: string, playerId: string): Promise<Character | null> {
    const query = 'SELECT * FROM characters WHERE campaign_id = $1 AND player_id = $2';
    const result = await this.db.query(query, [campaignId, playerId]);
    return result.rows[0] || null;
  }

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name);
    }

    if (data.level !== undefined) {
      updates.push(`level = $${paramCount++}`);
      values.push(data.level);
    }

    if (data.experience !== undefined) {
      updates.push(`experience = $${paramCount++}`);
      values.push(data.experience);
    }

    if (data.hp !== undefined) {
      updates.push(`hp = $${paramCount++}`);
      values.push(data.hp);
    }

    if (data.max_hp !== undefined) {
      updates.push(`max_hp = $${paramCount++}`);
      values.push(data.max_hp);
    }

    if (data.armor_class !== undefined) {
      updates.push(`armor_class = $${paramCount++}`);
      values.push(data.armor_class);
    }

    if (data.ability_scores !== undefined) {
      updates.push(`ability_scores = $${paramCount++}`);
      values.push(JSON.stringify(data.ability_scores));
    }

    if (data.skills !== undefined) {
      updates.push(`skills = $${paramCount++}`);
      values.push(JSON.stringify(data.skills));
    }

    if (data.inventory !== undefined) {
      updates.push(`inventory = $${paramCount++}`);
      values.push(JSON.stringify(data.inventory));
    }

    if (data.spells !== undefined) {
      updates.push(`spells = $${paramCount++}`);
      values.push(JSON.stringify(data.spells));
    }

    if (data.traits !== undefined) {
      updates.push(`traits = $${paramCount++}`);
      values.push(JSON.stringify(data.traits));
    }

    if (data.money !== undefined) {
      updates.push(`money = $${paramCount++}`);
      values.push(data.money);
    }

    // If no updates, just return the existing character
    if (updates.length === 0) {
      return this.findById(id) as Promise<Character>;
    }

    values.push(id);

    const query = `
      UPDATE characters
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async deleteCharacter(id: string): Promise<boolean> {
    const query = 'DELETE FROM characters WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount! > 0;
  }
}
