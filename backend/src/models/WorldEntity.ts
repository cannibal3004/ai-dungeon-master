import { Pool } from 'pg';
import { getDatabase } from '../utils/database';
import { canonicalizeWithType } from '../utils/nameNormalizer';

export interface WorldLocation {
  id: string;
  campaign_id: string;
  name: string;
  type: string;
  description?: string;
  discovered_at: Date;
  last_mentioned: Date;
  metadata: any;
}

export interface WorldNPC {
  id: string;
  campaign_id: string;
  location_id?: string;
  name: string;
  role?: string;
  description?: string;
  personality?: string;
  discovered_at: Date;
  last_mentioned: Date;
  metadata: any;
}

export interface WorldShop {
  id: string;
  campaign_id: string;
  location_id?: string;
  name: string;
  type?: string;
  description?: string;
  discovered_at: Date;
  last_mentioned: Date;
  metadata: any;
}

export interface WorldItem {
  id: string;
  campaign_id: string;
  location_id?: string;
  shop_id?: string;
  name: string;
  type?: string;
  description?: string;
  discovered_at: Date;
  last_mentioned: Date;
  metadata: any;
}

export class WorldEntityModel {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  // Locations
  async upsertLocation(campaignId: string, name: string, type?: string, description?: string): Promise<WorldLocation> {
    const canonical = canonicalizeWithType(name, type);
    // Check if exists (case-insensitive name or canonical match)
    const checkQuery = `
      SELECT * FROM world_locations 
      WHERE campaign_id = $1::uuid AND (LOWER(name) = LOWER($2::text) OR metadata->>'canonical_name' = $3::text)
    `;
    const existing = await this.db.query(checkQuery, [campaignId, name, canonical]);
    
    if (existing.rows.length > 0) {
      // Update existing
      const entity = existing.rows[0];
      const updateQuery = `
        UPDATE world_locations
        SET last_mentioned = CURRENT_TIMESTAMP,
            name = COALESCE($2::text, name),
            type = COALESCE($3::text, type),
            description = COALESCE($4::text, description),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('canonical_name', $5::text)
        WHERE campaign_id = $1::uuid AND id = $6::uuid
        RETURNING *
      `;
      const result = await this.db.query(updateQuery, [campaignId, name, type || null, description || null, canonical, entity.id]);
      return result.rows[0];
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO world_locations (campaign_id, name, type, description, metadata, last_mentioned)
        VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::jsonb, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      const result = await this.db.query(insertQuery, [campaignId, name, type || null, description || null, JSON.stringify({ canonical_name: canonical })]);
      return result.rows[0];
    }
  }

  async findLocationByName(campaignId: string, name: string, type?: string): Promise<WorldLocation | null> {
    const canonical = canonicalizeWithType(name, type);
    const query = `
      SELECT * FROM world_locations 
      WHERE campaign_id = $1 AND (LOWER(name) = LOWER($2) OR metadata->>'canonical_name' = $3)
      ORDER BY last_mentioned DESC
      LIMIT 1
    `;
    const result = await this.db.query(query, [campaignId, name, canonical]);
    return result.rows[0] ?? null;
  }

  async getLocations(campaignId: string): Promise<WorldLocation[]> {
    const query = 'SELECT * FROM world_locations WHERE campaign_id = $1 ORDER BY last_mentioned DESC';
    const result = await this.db.query(query, [campaignId]);
    return result.rows;
  }

  // NPCs
  async upsertNPC(campaignId: string, name: string, role?: string, description?: string, personality?: string, locationId?: string, formerName?: string): Promise<WorldNPC> {
    const canonical = canonicalizeWithType(name, role);
    // Check if exists by name/alias/canonical or if this is a name reveal
    let checkQuery = `
      SELECT * FROM world_npcs 
      WHERE campaign_id = $1::uuid AND (
        LOWER(name) = LOWER($2::text)
        OR metadata->>'aliases' ILIKE '%' || $2::text || '%'
        OR metadata->>'canonical_name' = $3::text
    `;
    const params: any[] = [campaignId, name, canonical];
    
    if (formerName) {
      checkQuery += ` OR LOWER(name) = LOWER($4::text)`;
      params.push(formerName);
    }
    
    checkQuery += ')';
    const existing = await this.db.query(checkQuery, params);
    
    if (existing.rows.length > 0) {
      // Update existing - if name changed, track old name as alias
      const entity = existing.rows[0];
      const metadata = entity.metadata || {};
      const aliases = metadata.aliases || [];
      
      // If updating name from former name, add former name to aliases
      if (formerName && entity.name.toLowerCase() !== name.toLowerCase() && !aliases.includes(entity.name)) {
        aliases.push(entity.name);
      }
      
      const updateQuery = `
        UPDATE world_npcs
        SET last_mentioned = CURRENT_TIMESTAMP,
            name = $3::text,
            role = COALESCE($4::text, role),
            description = COALESCE($5::text, description),
            personality = COALESCE($6::text, personality),
            location_id = COALESCE($7::uuid, location_id),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('canonical_name', $9::text),
              '{aliases}', $8::jsonb
            )
        WHERE campaign_id = $1::uuid AND id = $2::uuid
        RETURNING *
      `;
      const result = await this.db.query(updateQuery, [
        campaignId, 
        entity.id, 
        name, 
        role || null, 
        description || null, 
        personality || null, 
        locationId || null,
        JSON.stringify(aliases),
        canonical
      ]);
      return result.rows[0];
    } else {
      // Insert new
      const metadata = formerName ? { aliases: [formerName], canonical_name: canonical } : { canonical_name: canonical };
      const insertQuery = `
        INSERT INTO world_npcs (campaign_id, name, role, description, personality, location_id, metadata, last_mentioned)
        VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::uuid, $7::jsonb, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      const result = await this.db.query(insertQuery, [campaignId, name, role || null, description || null, personality || null, locationId || null, JSON.stringify(metadata)]);
      return result.rows[0];
    }
  }

  async getNPCs(campaignId: string, locationId?: string): Promise<WorldNPC[]> {
    const query = locationId
      ? 'SELECT * FROM world_npcs WHERE campaign_id = $1 AND location_id = $2 ORDER BY last_mentioned DESC'
      : 'SELECT * FROM world_npcs WHERE campaign_id = $1 ORDER BY last_mentioned DESC';
    const params = locationId ? [campaignId, locationId] : [campaignId];
    const result = await this.db.query(query, params);
    return result.rows;
  }

  // Shops
  async upsertShop(campaignId: string, name: string, type?: string, description?: string, locationId?: string): Promise<WorldShop> {
    const canonical = canonicalizeWithType(name, type);
    // Check if exists (case-insensitive name or canonical)
    const checkQuery = `
      SELECT * FROM world_shops 
      WHERE campaign_id = $1::uuid AND (LOWER(name) = LOWER($2::text) OR metadata->>'canonical_name' = $3::text)
    `;
    const existing = await this.db.query(checkQuery, [campaignId, name, canonical]);
    
    if (existing.rows.length > 0) {
      // Update existing
      const entity = existing.rows[0];
      const updateQuery = `
        UPDATE world_shops
        SET last_mentioned = CURRENT_TIMESTAMP,
            name = COALESCE($2::text, name),
            type = COALESCE($3::text, type),
            description = COALESCE($4::text, description),
            location_id = COALESCE($5::uuid, location_id),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('canonical_name', $6::text)
        WHERE campaign_id = $1::uuid AND id = $7::uuid
        RETURNING *
      `;
      const result = await this.db.query(updateQuery, [campaignId, name, type || null, description || null, locationId || null, canonical, entity.id]);
      return result.rows[0];
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO world_shops (campaign_id, name, type, description, location_id, metadata, last_mentioned)
        VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::uuid, $6::jsonb, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      const result = await this.db.query(insertQuery, [campaignId, name, type || null, description || null, locationId || null, JSON.stringify({ canonical_name: canonical })]);
      return result.rows[0];
    }
  }

  async getShops(campaignId: string, locationId?: string): Promise<WorldShop[]> {
    const query = locationId
      ? 'SELECT * FROM world_shops WHERE campaign_id = $1 AND location_id = $2 ORDER BY last_mentioned DESC'
      : 'SELECT * FROM world_shops WHERE campaign_id = $1 ORDER BY last_mentioned DESC';
    const params = locationId ? [campaignId, locationId] : [campaignId];
    const result = await this.db.query(query, params);
    return result.rows;
  }

  // Items
  async upsertItem(campaignId: string, name: string, type?: string, description?: string, locationId?: string, shopId?: string): Promise<WorldItem> {
    const canonical = canonicalizeWithType(name, type);
    // Check if exists (case-insensitive name or canonical)
    const checkQuery = `
      SELECT * FROM world_items 
      WHERE campaign_id = $1::uuid AND (LOWER(name) = LOWER($2::text) OR metadata->>'canonical_name' = $3::text)
    `;
    const existing = await this.db.query(checkQuery, [campaignId, name, canonical]);
    
    if (existing.rows.length > 0) {
      // Update existing
      const entity = existing.rows[0];
      const updateQuery = `
        UPDATE world_items
        SET last_mentioned = CURRENT_TIMESTAMP,
            name = $2::text,
            type = COALESCE($3::text, type),
            description = COALESCE($4::text, description),
            location_id = COALESCE($5::uuid, location_id),
            shop_id = COALESCE($6::uuid, shop_id),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('canonical_name', $7::text)
        WHERE campaign_id = $1::uuid AND id = $8::uuid
        RETURNING *
      `;
      const result = await this.db.query(updateQuery, [campaignId, name, type || null, description || null, locationId || null, shopId || null, canonical, entity.id]);
      return result.rows[0];
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO world_items (campaign_id, name, type, description, location_id, shop_id, metadata, last_mentioned)
        VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::uuid, $6::uuid, $7::jsonb, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      const result = await this.db.query(insertQuery, [campaignId, name, type || null, description || null, locationId || null, shopId || null, JSON.stringify({ canonical_name: canonical })]);
      return result.rows[0];
    }
  }

  async getItems(campaignId: string, locationId?: string, shopId?: string): Promise<WorldItem[]> {
    let query = 'SELECT * FROM world_items WHERE campaign_id = $1';
    const params: any[] = [campaignId];
    
    if (locationId) {
      query += ' AND location_id = $2';
      params.push(locationId);
    }
    if (shopId) {
      query += ` AND shop_id = $${params.length + 1}`;
      params.push(shopId);
    }
    
    query += ' ORDER BY last_mentioned DESC';
    const result = await this.db.query(query, params);
    return result.rows;
  }
}
