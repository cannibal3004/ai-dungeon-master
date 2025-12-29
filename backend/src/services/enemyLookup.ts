import axios from 'axios';
import { getRedis } from '../utils/redis';

export interface EnemyInfo {
  success: boolean;
  name: string;
  slug?: string;
  type?: string;
  size?: string;
  alignment?: string;
  armor_class: number;
  hit_points: number;
  hit_dice?: string;
  challenge_rating?: string | number;
  speed?: Record<string, any> | string;
  senses?: string;
  languages?: string;
  actions?: Array<{ name: string; desc: string }>;
  special_abilities?: Array<{ name: string; desc: string }>;
}

const ENEMY_CACHE_TTL = parseInt(process.env.ENEMY_CACHE_TTL || '86400'); // default 24h
const memoryCache = new Map<string, EnemyInfo>();

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function sanitizeMonster(m: any): EnemyInfo {
  return {
    success: true,
    name: m.name,
    slug: m.slug,
    type: m.type,
    size: m.size,
    alignment: m.alignment,
    armor_class: Number(m.armor_class ?? m.ac ?? 0),
    hit_points: Number(m.hit_points ?? m.hp ?? 0),
    hit_dice: m.hit_dice,
    challenge_rating: m.challenge_rating ?? m.cr,
    speed: m.speed,
    senses: m.senses,
    languages: m.languages,
    actions: Array.isArray(m.actions) ? m.actions.map((a: any) => ({ name: a.name, desc: a.desc })) : undefined,
    special_abilities: Array.isArray(m.special_abilities) ? m.special_abilities.map((a: any) => ({ name: a.name, desc: a.desc })) : undefined,
  };
}

/**
 * Look up enemy/monster details from the Open5e SRD API by name.
 * Returns a sanitized subset suitable for LLM consumption.
 */
export async function lookupEnemyByName(name: string): Promise<EnemyInfo | { success: false; error: string }> {
  const baseUrl = 'https://api.open5e.com/monsters/';
  const key = `srd:monster:${normalizeKey(name)}`;
  try {
    // Try Redis cache first
    try {
      const redis = getRedis();
      const cached = await redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.success) {
          return parsed as EnemyInfo;
        }
      }
    } catch {}

    // Try in-memory cache
    if (memoryCache.has(key)) {
      return memoryCache.get(key)!;
    }

    // Use search for broader matching; limit to 1 for token efficiency
    const url = `${baseUrl}?search=${encodeURIComponent(name)}&limit=1`;
    const resp = await axios.get(url, { timeout: 8000 });
    const results = resp.data?.results ?? [];
    if (!Array.isArray(results) || results.length === 0) {
      return { success: false, error: `No SRD monster found for \"${name}\"` };
    }
    const monster = results[0];
    const info = sanitizeMonster(monster);

    // Populate caches
    try {
      const redis = getRedis();
      await redis.set(key, JSON.stringify(info), 'EX', ENEMY_CACHE_TTL);
    } catch {}
    memoryCache.set(key, info);

    return info;
  } catch (err: any) {
    const msg = err?.response?.status ? `HTTP ${err.response.status}` : (err?.message || 'Unknown error');
    return { success: false, error: `Lookup failed: ${msg}` };
  }
}
