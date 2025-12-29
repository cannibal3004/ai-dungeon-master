import { CharacterModel, Character } from '../models/Character';
import { CharacterBuilder } from '../rules/CharacterBuilder';
import { Race, CharacterClass } from '../rules/constants';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { getStartingEquipment } from '../rules/StartingEquipment';

export class CharacterService {
  private characterModel: CharacterModel;

  constructor() {
    this.characterModel = new CharacterModel();
  }

  async createCharacter(
    campaignId: string,
    playerId: string,
    name: string,
    race: Race,
    characterClass: CharacterClass,
    background?: string,
    customScores?: any
  ): Promise<Character> {
    // Build character using rules engine
    const characterData = customScores
      ? CharacterBuilder.createCharacterWithScores(name, race, characterClass, customScores, background)
      : CharacterBuilder.createCharacter(name, race, characterClass, background);

    // Get starting equipment for this class
    const startingEquipment = getStartingEquipment(characterClass);

    // Save to database
    const character = await this.characterModel.createCharacter({
      campaign_id: campaignId,
      player_id: playerId,
      name: characterData.name,
      race: characterData.race,
      class: characterData.class,
      level: characterData.level,
      ability_scores: characterData.abilityScores,
      hp: characterData.hp,
      max_hp: characterData.maxHp,
      armor_class: characterData.armorClass,
      skills: characterData.proficientSkills,
      background: characterData.background || null,
      inventory: startingEquipment.inventory,
      money: startingEquipment.gold,
    });

    logger.info(`Character created: ${name} (${race} ${characterClass})`);
    return character;
  }

  async getCharacter(id: string, userId: string): Promise<Character> {
    const character = await this.characterModel.findById(id);
    
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    // Verify ownership
    if (character.player_id !== userId) {
      throw new AppError(403, 'Not authorized to view this character');
    }

    return character;
  }

  async getPlayerCharacters(playerId: string): Promise<Character[]> {
    return await this.characterModel.findByPlayer(playerId);
  }

  async getCampaignCharacters(campaignId: string): Promise<Character[]> {
    return await this.characterModel.findByCampaign(campaignId);
  }

  async updateCharacter(id: string, userId: string, updates: Partial<Character>): Promise<Character> {
    const character = await this.characterModel.findById(id);
    
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    if (character.player_id !== userId) {
      throw new AppError(403, 'Not authorized to update this character');
    }

    return await this.characterModel.updateCharacter(id, updates);
  }

  async levelUpCharacter(id: string, userId: string): Promise<Character> {
    const character = await this.characterModel.findById(id);
    
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    if (character.player_id !== userId) {
      throw new AppError(403, 'Not authorized to level up this character');
    }

    // Use rules engine to calculate level up
    const characterData = {
      name: character.name,
      race: character.race as Race,
      class: character.class as CharacterClass,
      level: character.level,
      abilityScores: character.ability_scores,
      hp: character.hp,
      maxHp: character.max_hp,
      armorClass: character.armor_class,
      proficientSkills: character.skills,
      background: character.background || undefined,
    };

    const leveledUp = CharacterBuilder.levelUp(characterData);

    return await this.characterModel.updateCharacter(id, {
      level: leveledUp.level,
      max_hp: leveledUp.maxHp,
      hp: leveledUp.hp,
    });
  }

  async updateHP(id: string, userId: string, amount: number): Promise<Character> {
    const character = await this.characterModel.findById(id);
    
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    if (character.player_id !== userId) {
      throw new AppError(403, 'Not authorized to update this character');
    }

    const newHp = Math.max(0, Math.min(character.max_hp, character.hp + amount));

    return await this.characterModel.updateCharacter(id, { hp: newHp });
  }

  async deleteCharacter(id: string, userId: string): Promise<void> {
    const character = await this.characterModel.findById(id);
    
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    if (character.player_id !== userId) {
      throw new AppError(403, 'Not authorized to delete this character');
    }

    await this.characterModel.deleteCharacter(id);
    logger.info(`Character deleted: ${character.name} (ID: ${id})`);
  }
}
