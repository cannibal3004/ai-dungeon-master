/**
 * Enemy suggestion helper for CR-appropriate encounters
 * Provides level/location-based enemy recommendations to guide DM narrative generation
 */

import axios from 'axios';
import { getRedis } from '../utils/redis';
import { logger } from '../utils/logger';

export interface EnemySuggestion {
  name: string;
  cr: string | number;
  type: string;
  size?: string;
  armor_class?: number;
  hit_points?: number;
  environment?: string;
}

export interface SuggestEnemiesParams {
  partyLevel: number;
  partySize?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'deadly';
  environment?: string; // forest, dungeon, urban, etc.
  enemyType?: string; // undead, beast, humanoid, etc.
  maxResults?: number;
}

const SUGGESTION_CACHE_TTL = 3600; // 1 hour
const memoryCache = new Map<string, EnemySuggestion[]>();

/**
 * Calculate CR range based on party level and difficulty
 */
function calculateCRRange(partyLevel: number, difficulty: 'easy' | 'medium' | 'hard' | 'deadly'): { min: number; max: number } {
  // Simplified CR calculation based on D&D 5e guidelines
  // For a party of 4, CR roughly equals party level for medium difficulty
  const baseCR = partyLevel;
  
  switch (difficulty) {
    case 'easy':
      return { min: Math.max(0, baseCR - 2), max: baseCR - 1 };
    case 'medium':
      return { min: Math.max(0, baseCR - 1), max: baseCR + 1 };
    case 'hard':
      return { min: baseCR, max: baseCR + 2 };
    case 'deadly':
      return { min: baseCR + 1, max: baseCR + 4 };
    default:
      return { min: Math.max(0, baseCR - 1), max: baseCR + 1 };
  }
}

/**
 * Suggest enemies appropriate for the party's level and environment
 */
export async function suggestEnemies(params: SuggestEnemiesParams): Promise<EnemySuggestion[]> {
  const {
    partyLevel,
    partySize = 4,
    difficulty = 'medium',
    environment,
    enemyType,
    maxResults = 5
  } = params;

  // Generate cache key
  const cacheKey = `enemy-suggestions:${partyLevel}:${partySize}:${difficulty}:${environment || 'any'}:${enemyType || 'any'}`;

  try {
    // Try cache first
    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}

    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey)!;
    }

    // Calculate appropriate CR range
    const crRange = calculateCRRange(partyLevel, difficulty);
    
    // Build API query
    const baseUrl = 'https://api.open5e.com/monsters/';
    const queryParams: string[] = [
      `limit=${maxResults * 3}`, // Fetch more to filter
      `challenge_rating__range=${crRange.min},${crRange.max}`
    ];

    if (enemyType) {
      queryParams.push(`type=${encodeURIComponent(enemyType)}`);
    }

    if (environment) {
      queryParams.push(`search=${encodeURIComponent(environment)}`);
    }

    const url = `${baseUrl}?${queryParams.join('&')}`;
    
    logger.info(`Fetching enemy suggestions: ${url}`);
    
    const response = await axios.get(url, { timeout: 8000 });
    const results = response.data?.results ?? [];

    if (!Array.isArray(results) || results.length === 0) {
      // Fallback: if no results with filters, try just CR range
      if (enemyType || environment) {
        logger.warn('No results with filters, retrying with just CR range');
        const fallbackUrl = `${baseUrl}?limit=${maxResults * 2}&challenge_rating__range=${crRange.min},${crRange.max}`;
        const fallbackResp = await axios.get(fallbackUrl, { timeout: 8000 });
        const fallbackResults = fallbackResp.data?.results ?? [];
        
        if (fallbackResults.length > 0) {
          return processSuggestions(fallbackResults, maxResults, cacheKey);
        }
      }
      
      return [];
    }

    return processSuggestions(results, maxResults, cacheKey);
  } catch (err: any) {
    logger.error('Failed to fetch enemy suggestions', err);
    // Return some generic fallbacks based on level
    return getGenericFallbacks(partyLevel, difficulty, maxResults);
  }
}

function processSuggestions(results: any[], maxResults: number, cacheKey: string): EnemySuggestion[] {
  const suggestions: EnemySuggestion[] = results
    .slice(0, maxResults)
    .map((monster) => ({
      name: monster.name,
      cr: monster.challenge_rating ?? '0',
      type: monster.type ?? 'unknown',
      size: monster.size,
      armor_class: monster.armor_class ?? monster.ac,
      hit_points: monster.hit_points ?? monster.hp,
      environment: monster.environments?.[0],
    }));

  // Cache the results
  try {
    const redis = getRedis();
    redis.set(cacheKey, JSON.stringify(suggestions), 'EX', SUGGESTION_CACHE_TTL).catch(() => {});
  } catch {}
  
  memoryCache.set(cacheKey, suggestions);

  return suggestions;
}

/**
 * Provide generic fallback suggestions when API is unavailable
 */
function getGenericFallbacks(partyLevel: number, _difficulty: 'easy' | 'medium' | 'hard' | 'deadly', maxResults: number): EnemySuggestion[] {
  const levelGroups = [
    { maxLevel: 2, enemies: [
      { name: 'Goblin', cr: '1/4', type: 'humanoid' },
      { name: 'Kobold', cr: '1/8', type: 'humanoid' },
      { name: 'Wolf', cr: '1/4', type: 'beast' },
      { name: 'Bandit', cr: '1/8', type: 'humanoid' },
    ]},
    { maxLevel: 5, enemies: [
      { name: 'Orc', cr: '1/2', type: 'humanoid' },
      { name: 'Hobgoblin', cr: '1/2', type: 'humanoid' },
      { name: 'Bugbear', cr: '1', type: 'humanoid' },
      { name: 'Ogre', cr: '2', type: 'giant' },
    ]},
    { maxLevel: 10, enemies: [
      { name: 'Troll', cr: '5', type: 'giant' },
      { name: 'Hill Giant', cr: '5', type: 'giant' },
      { name: 'Manticore', cr: '3', type: 'monstrosity' },
      { name: 'Minotaur', cr: '3', type: 'monstrosity' },
    ]},
    { maxLevel: 20, enemies: [
      { name: 'Fire Giant', cr: '9', type: 'giant' },
      { name: 'Adult Red Dragon', cr: '17', type: 'dragon' },
      { name: 'Vampire', cr: '13', type: 'undead' },
      { name: 'Beholder', cr: '13', type: 'aberration' },
    ]},
  ];

  const group = levelGroups.find(g => partyLevel <= g.maxLevel) ?? levelGroups[levelGroups.length - 1];
  return group.enemies.slice(0, maxResults).map(e => ({
    ...e,
    armor_class: 12,
    hit_points: 20,
  }));
}
