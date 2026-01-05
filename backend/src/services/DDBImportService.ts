import axios from 'axios';
import { CharacterModel } from '../models/Character';
import { getCharacterAbilitiesModel } from '../models/CharacterAbilities';
import { CampaignModel } from '../models/Campaign';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

interface ImportResult {
  character: any;
  combatSummary: string;
  roleplaySummary: string;
}

const ABILITY_ID_MAP: Record<number, AbilityKey> = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma',
};

function abilityMod(score?: number): number {
  if (!score && score !== 0) return 0;
  return Math.floor((score - 10) / 2);
}

function stripHtml(input?: string | null): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(level, 1) - 1) / 4);
}

export class DDBImportService {
  private characters: CharacterModel;
  private abilities = getCharacterAbilitiesModel();
  private campaigns = new CampaignModel();

  constructor() {
    this.characters = new CharacterModel();
  }

  async importCharacter(campaignId: string, playerId: string, raw: any): Promise<ImportResult> {
    const payload = await this.resolvePayload(raw);
    const data = payload?.data ?? payload;

    if (!data?.name) {
      throw new AppError(400, 'Invalid D&D Beyond payload: missing name');
    }

    // Ability scores
    const abilityScores: Record<AbilityKey, number> = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    };
    (data.stats || []).forEach((stat: any) => {
      const key = ABILITY_ID_MAP[stat.id];
      if (key) abilityScores[key] = stat.value ?? abilityScores[key];
    });

    // Class & level
    const classInfo = Array.isArray(data.classes) ? data.classes[0] : undefined;
    const className = classInfo?.definition?.name ?? 'Unknown';
    const level = classInfo?.level ?? 1;
    const spellRules = classInfo?.definition?.spellRules;
    const spellcastingAbilityId = classInfo?.definition?.spellCastingAbilityId;
    const spellAbilityKey = spellcastingAbilityId ? ABILITY_ID_MAP[spellcastingAbilityId] : undefined;

    // Race & background
    const raceName = data.race?.fullName ?? data.race?.baseRaceName ?? 'Unknown';
    const backgroundName = data.background?.definition?.name ?? 'Unknown background';
    const backgroundSnippet = stripHtml(data.background?.definition?.shortDescription || data.background?.definition?.description)?.slice(0, 240);

    // HP / AC
    const baseHp = data.baseHitPoints ?? 0;
    const bonusHp = data.bonusHitPoints ?? 0;
    const removedHp = data.removedHitPoints ?? 0;
    const tempHp = data.temporaryHitPoints ?? 0;
    const maxHp = baseHp + bonusHp;
    const hp = Math.max(0, maxHp - removedHp + tempHp);
    const dexMod = abilityMod(abilityScores.dexterity);
    // Best-effort AC: base 10 + DEX mod; add item/class bonuses if present
    const acBonuses = this.extractACBonuses(data);
    const armorClass = 10 + dexMod + acBonuses;

    // Money to gp
    const currencies = data.currencies || {};
    const money = (currencies.gp || 0) + (currencies.sp || 0) * 0.1 + (currencies.cp || 0) * 0.01 + (currencies.ep || 0) * 0.5 + (currencies.pp || 0) * 10;

    // Inventory names
    const inventory = Array.isArray(data.inventory)
      ? data.inventory.map((item: any) => {
          const name = item.definition?.name || 'Unknown item';
          const qty = item.quantity && item.quantity !== 1 ? ` x${item.quantity}` : '';
          return `${name}${qty}`;
        })
      : [];

    // Spells
    const classSpells = (data.classSpells?.[0]?.spells || []).map((spell: any) => {
      const def = spell.definition || {};
      return {
        name: def.name,
        level: def.level,
        school: def.school,
        casting_time: def.activation?.activationTime ? `${def.activation.activationTime} action` : undefined,
        range: def.range?.rangeValue ? `${def.range.rangeValue} ${def.range.aoeType || ''}`.trim() : undefined,
        duration: def.duration?.durationType,
        description: stripHtml(def.description)?.slice(0, 500),
        metadata: { ritual: def.ritual, concentration: def.concentration },
      };
    });

    // Spell slots
    const slotRow = Array.isArray(spellRules?.levelSpellSlots) ? spellRules.levelSpellSlots[level] : [];
    const spellSlots = Array.isArray(slotRow)
      ? slotRow.map((count: number, idx: number) => ({ spell_level: idx + 1, max_slots: count, remaining_slots: count })).filter((s: any) => s.max_slots > 0)
      : [];

    // Traits (race + class names only, compact)
    const traitNames: string[] = [];
    if (Array.isArray(data.race?.racialTraits)) {
      data.race.racialTraits.forEach((t: any) => t?.definition?.name && traitNames.push(t.definition.name));
    }
    if (Array.isArray(classInfo?.definition?.classFeatures)) {
      classInfo.definition.classFeatures.slice(0, 10).forEach((f: any) => f?.name && traitNames.push(f.name));
    }

    // Skills from modifiers
    const skillProficiencies = this.extractSkillProficiencies(data);

    // Build character record
    const character = await this.characters.createCharacter({
      campaign_id: campaignId,
      player_id: playerId,
      name: data.name,
      race: raceName,
      class: className,
      level,
      experience: data.currentXp ?? 0,
      ability_scores: abilityScores,
      skills: skillProficiencies,
      hp,
      max_hp: maxHp,
      armor_class: armorClass,
      inventory,
      spells: classSpells,
      traits: traitNames,
      background: backgroundName,
      money,
    });

    // Persist spells and slots to detail tables
    for (const spell of classSpells) {
      if (spell.name) {
        await this.abilities.addSpell(character.id, spell as any);
      }
    }
    for (const slot of spellSlots) {
      await this.abilities.setSpellSlots(character.id, slot.spell_level, slot.max_slots);
    }

    // Build summaries for prompt gating
    const profBonus = proficiencyBonus(level);
    const spellAbilityMod = spellAbilityKey ? abilityMod(abilityScores[spellAbilityKey]) : 0;
    const spellSaveDc = spellAbilityKey ? 8 + profBonus + spellAbilityMod : undefined;
    const slotSummary = spellSlots.map((s) => `${s.spell_level}:${s.max_slots}`).join(' ');
    const combatSummaryParts = [
      `${data.name}, Level ${level} ${raceName} ${className}`,
      `HP ${hp}/${maxHp}`,
      `AC ${armorClass}`,
      `Prof +${profBonus}`,
    ];
    if (spellSaveDc) {
      combatSummaryParts.push(`Spell save DC ${spellSaveDc}`);
    }
    if (slotSummary) {
      combatSummaryParts.push(`Slots ${slotSummary}`);
    }
    const combatSummary = combatSummaryParts.join('; ');

    const rpSummary = `${data.name}: ${raceName} ${className}, background ${backgroundName}. ${backgroundSnippet}`.trim();

    await this.upsertCharacterSummary(campaignId, {
      name: data.name,
      combatSummary,
      roleplaySummary: rpSummary,
    });

    logger.info('DDB import complete', { name: data.name, className, level, raceName });

    return { character, combatSummary, roleplaySummary: rpSummary };
  }

  private async resolvePayload(raw: any): Promise<any> {
    // If raw is a URL string, fetch it
    if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) {
      const id = this.extractIdFromUrl(raw);
      if (!id) throw new AppError(400, 'Could not parse character id from URL');
      return this.fetchFromDDB(id);
    }

    // If raw is a number, treat as id
    if (typeof raw === 'number') {
      return this.fetchFromDDB(raw.toString());
    }

    // If raw looks like already-parsed payload
    if (typeof raw === 'object') {
      return raw;
    }

    // If raw is JSON string
    try {
      return JSON.parse(raw);
    } catch {
      throw new AppError(400, 'Invalid import payload');
    }
  }

  private extractIdFromUrl(url: string): string | null {
    const match = url.match(/characters\/(\d+)/i) || url.match(/character\/(\d+)/i);
    return match ? match[1] : null;
  }

  private async fetchFromDDB(id: string): Promise<any> {
    const endpoints = [
      `https://character-service.dndbeyond.com/character/v5/character/${id}`,
      `https://character-service.dndbeyond.com/character/v5/character/${id}?includeCustomItems=true`,
      `https://www.dndbeyond.com/character/${id}/json`,
    ];

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; AIDM/1.0)'
    } as const;

    const errors: Array<{ url: string; status?: number; message?: string }> = [];

    for (const url of endpoints) {
      try {
        const res = await axios.get(url, {
          timeout: 8000,
          headers,
          validateStatus: (s) => s >= 200 && s < 300,
        });
        if (res?.data) return res.data;
      } catch (err: any) {
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.message;
        errors.push({ url, status, message });
        logger.warn('DDB fetch failed, trying fallback', { url, status, message });
      }
    }

    const detail = errors.length ? ` (tried: ${errors.map(e => `${e.url}${e.status ? ' [' + e.status + ']' : ''}`).join(', ')})` : '';
    throw new AppError(502, `Failed to fetch character from D&D Beyond. Ensure the URL is correct and public.${detail}`);
  }

  private extractACBonuses(data: any): number {
    const sources = [data?.modifiers?.item, data?.modifiers?.class, data?.modifiers?.race, data?.modifiers?.background, data?.modifiers?.feat].filter(Boolean);
    let bonus = 0;
    for (const src of sources) {
      for (const m of src || []) {
        if (m?.type === 'bonus' && m?.subType === 'armor-class') {
          bonus += m.fixedValue ?? m.value ?? 0;
        }
      }
    }
    return bonus;
  }

  private extractSkillProficiencies(data: any): any[] {
    const skills: Record<string, { proficiency_bonus: number; expertise: boolean }> = {};
    const addSkill = (name: string, expertise = false) => {
      if (!skills[name]) {
        skills[name] = { proficiency_bonus: 2, expertise };
      } else if (expertise) {
        skills[name].expertise = true;
      }
    };

    const sources = [data?.modifiers?.race, data?.modifiers?.class, data?.modifiers?.background, data?.modifiers?.feat];
    sources.filter(Boolean).forEach((src) => {
      (src as any[]).forEach((m) => {
        if (m?.type === 'proficiency' && m?.subType) {
          addSkill(m.subType, false);
        }
        if (m?.type === 'expertise' && m?.subType) {
          addSkill(m.subType, true);
        }
      });
    });

    return Object.entries(skills).map(([name, meta]) => ({ name, proficiency_bonus: meta.expertise ? meta.proficiency_bonus * 2 : meta.proficiency_bonus, expertise: meta.expertise }));
  }

  private async upsertCharacterSummary(
    campaignId: string,
    summary: { name: string; combatSummary?: string; roleplaySummary?: string }
  ): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return;

    const settings = campaign.settings || {};
    const list: Array<any> = Array.isArray(settings.characterSummaries) ? settings.characterSummaries : [];
    const existingIdx = list.findIndex((c) => c.name?.toLowerCase() === summary.name.toLowerCase());
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...summary };
    } else {
      list.push(summary);
    }
    settings.characterSummaries = list;
    await this.campaigns.updateCampaign(campaignId, { settings });
  }
}

let importer: DDBImportService;

export function getDDBImportService(): DDBImportService {
  if (!importer) {
    importer = new DDBImportService();
  }
  return importer;
}