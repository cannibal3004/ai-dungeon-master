import { Pool } from 'pg';
import { getDatabase } from '../utils/database';

export interface Spell {
  id: string;
  character_id: string;
  name: string;
  level: number;
  school?: string;
  casting_time?: string;
  range?: string;
  duration?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface SpellSlot {
  id: string;
  character_id: string;
  spell_level: number;
  max_slots: number;
  remaining_slots: number;
}

export interface Skill {
  id: string;
  character_id: string;
  name: string;
  ability_modifier?: string;
  proficiency_bonus: number;
  expertise: boolean;
  bonus: number;
  description?: string;
  metadata?: Record<string, any>;
}

export class CharacterAbilitiesModel {
  private pool: Pool;

  constructor() {
    this.pool = getDatabase();
  }

  // Spells
  async addSpell(characterId: string, spell: Partial<Spell>): Promise<Spell> {
    const result = await this.pool.query(
      `INSERT INTO character_spells (character_id, name, level, school, casting_time, range, duration, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        characterId,
        spell.name,
        spell.level ?? 0,
        spell.school,
        spell.casting_time,
        spell.range,
        spell.duration,
        spell.description,
        JSON.stringify(spell.metadata ?? {})
      ]
    );
    return result.rows[0];
  }

  async getSpells(characterId: string): Promise<Spell[]> {
    const result = await this.pool.query(
      `SELECT * FROM character_spells WHERE character_id = $1 ORDER BY level, name`,
      [characterId]
    );
    return result.rows;
  }

  async removeSpell(spellId: string): Promise<void> {
    await this.pool.query(`DELETE FROM character_spells WHERE id = $1`, [spellId]);
  }

  // Spell Slots
  async setSpellSlots(characterId: string, spellLevel: number, maxSlots: number): Promise<SpellSlot> {
    const result = await this.pool.query(
      `INSERT INTO character_spell_slots (character_id, spell_level, max_slots, remaining_slots)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (character_id, spell_level)
       DO UPDATE SET max_slots = $3, remaining_slots = $3
       RETURNING *`,
      [characterId, spellLevel, maxSlots]
    );
    return result.rows[0];
  }

  async getSpellSlots(characterId: string): Promise<SpellSlot[]> {
    const result = await this.pool.query(
      `SELECT * FROM character_spell_slots WHERE character_id = $1 ORDER BY spell_level`,
      [characterId]
    );
    return result.rows;
  }

  async useSpellSlot(characterId: string, spellLevel: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE character_spell_slots 
       SET remaining_slots = remaining_slots - 1
       WHERE character_id = $1 AND spell_level = $2 AND remaining_slots > 0
       RETURNING *`,
      [characterId, spellLevel]
    );
    return result.rows.length > 0;
  }

  async restoreSpellSlots(characterId: string): Promise<void> {
    await this.pool.query(
      `UPDATE character_spell_slots 
       SET remaining_slots = max_slots
       WHERE character_id = $1`,
      [characterId]
    );
  }

  // Skills
  async addSkill(characterId: string, skill: Partial<Skill>): Promise<Skill> {
    const result = await this.pool.query(
      `INSERT INTO character_skills (character_id, name, ability_modifier, proficiency_bonus, expertise, bonus, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        characterId,
        skill.name,
        skill.ability_modifier,
        skill.proficiency_bonus ?? 0,
        skill.expertise ?? false,
        skill.bonus ?? 0,
        skill.description,
        JSON.stringify(skill.metadata ?? {})
      ]
    );
    return result.rows[0];
  }

  async getSkills(characterId: string): Promise<Skill[]> {
    const result = await this.pool.query(
      `SELECT * FROM character_skills WHERE character_id = $1 ORDER BY name`,
      [characterId]
    );
    return result.rows;
  }

  async updateSkill(skillId: string, updates: Partial<Skill>): Promise<Skill> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.proficiency_bonus !== undefined) {
      fields.push(`proficiency_bonus = $${paramCount}`);
      values.push(updates.proficiency_bonus);
      paramCount++;
    }
    if (updates.expertise !== undefined) {
      fields.push(`expertise = $${paramCount}`);
      values.push(updates.expertise);
      paramCount++;
    }
    if (updates.bonus !== undefined) {
      fields.push(`bonus = $${paramCount}`);
      values.push(updates.bonus);
      paramCount++;
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount}`);
      values.push(updates.description);
      paramCount++;
    }

    if (fields.length === 0) {
      const result = await this.pool.query(`SELECT * FROM character_skills WHERE id = $1`, [skillId]);
      return result.rows[0];
    }

    values.push(skillId);
    const result = await this.pool.query(
      `UPDATE character_skills SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async removeSkill(skillId: string): Promise<void> {
    await this.pool.query(`DELETE FROM character_skills WHERE id = $1`, [skillId]);
  }
}

let model: CharacterAbilitiesModel;

export function getCharacterAbilitiesModel(): CharacterAbilitiesModel {
  if (!model) {
    model = new CharacterAbilitiesModel();
  }
  return model;
}
