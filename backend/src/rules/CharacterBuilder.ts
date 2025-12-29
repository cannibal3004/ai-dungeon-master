import { RACES, CLASSES, Race, CharacterClass, AbilityScore } from './constants';
import { getAbilityModifier, getProficiencyBonus, generateAbilityScores, rollDie } from './dice';

export interface CharacterAbilities {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface CharacterData {
  name: string;
  race: Race;
  class: CharacterClass;
  level: number;
  abilityScores: CharacterAbilities;
  hp: number;
  maxHp: number;
  armorClass: number;
  proficientSkills: string[];
  background?: string;
}

export class CharacterBuilder {
  /**
   * Create a new character with random ability scores
   */
  static createCharacter(
    name: string,
    race: Race,
    characterClass: CharacterClass,
    background?: string
  ): CharacterData {
    // Generate base ability scores
    const baseScores = generateAbilityScores();

    // Apply racial bonuses
    const abilityScores = this.applyRacialBonuses(baseScores, race);

    // Calculate HP
    const classData = CLASSES[characterClass];
    const conModifier = getAbilityModifier(abilityScores.constitution);
    const maxHp = classData.hitDie + conModifier;

    // Calculate AC (base 10 + dex modifier, assuming no armor initially)
    const dexModifier = getAbilityModifier(abilityScores.dexterity);
    const armorClass = 10 + dexModifier;

    return {
      name,
      race,
      class: characterClass,
      level: 1,
      abilityScores,
      hp: maxHp,
      maxHp,
      armorClass,
      proficientSkills: [],
      background,
    };
  }

  /**
   * Create a character with custom ability scores
   */
  static createCharacterWithScores(
    name: string,
    race: Race,
    characterClass: CharacterClass,
    scores: CharacterAbilities,
    background?: string
  ): CharacterData {
    // Apply racial bonuses
    const abilityScores = this.applyRacialBonuses(scores, race);

    // Calculate HP
    const classData = CLASSES[characterClass];
    const conModifier = getAbilityModifier(abilityScores.constitution);
    const maxHp = classData.hitDie + conModifier;

    // Calculate AC
    const dexModifier = getAbilityModifier(abilityScores.dexterity);
    const armorClass = 10 + dexModifier;

    return {
      name,
      race,
      class: characterClass,
      level: 1,
      abilityScores,
      hp: maxHp,
      maxHp,
      armorClass,
      proficientSkills: [],
      background,
    };
  }

  /**
   * Apply racial ability bonuses
   */
  private static applyRacialBonuses(
    baseScores: CharacterAbilities,
    race: Race
  ): CharacterAbilities {
    const racialBonuses = RACES[race].abilityBonuses;
    const result = { ...baseScores };

    for (const [ability, bonus] of Object.entries(racialBonuses)) {
      result[ability as AbilityScore] += bonus;
    }

    return result;
  }

  /**
   * Level up a character
   */
  static levelUp(character: CharacterData): CharacterData {
    const newLevel = character.level + 1;
    const classData = CLASSES[character.class];
    
    // Roll for HP increase
    const hpRoll = rollDie(classData.hitDie);
    const conModifier = getAbilityModifier(character.abilityScores.constitution);
    const hpIncrease = Math.max(1, hpRoll + conModifier);

    return {
      ...character,
      level: newLevel,
      maxHp: character.maxHp + hpIncrease,
      hp: character.hp + hpIncrease,
    };
  }

  /**
   * Calculate all ability modifiers for a character
   */
  static getAbilityModifiers(character: CharacterData): Record<AbilityScore, number> {
    return {
      strength: getAbilityModifier(character.abilityScores.strength),
      dexterity: getAbilityModifier(character.abilityScores.dexterity),
      constitution: getAbilityModifier(character.abilityScores.constitution),
      intelligence: getAbilityModifier(character.abilityScores.intelligence),
      wisdom: getAbilityModifier(character.abilityScores.wisdom),
      charisma: getAbilityModifier(character.abilityScores.charisma),
    };
  }

  /**
   * Get character's proficiency bonus
   */
  static getProficiencyBonus(character: CharacterData): number {
    return getProficiencyBonus(character.level);
  }

  /**
   * Update character HP (healing or damage)
   */
  static updateHP(character: CharacterData, amount: number): CharacterData {
    const newHp = Math.max(0, Math.min(character.maxHp, character.hp + amount));
    return {
      ...character,
      hp: newHp,
    };
  }

  /**
   * Validate ability scores (standard array or point buy rules)
   */
  static validateAbilityScores(scores: CharacterAbilities): boolean {
    const values = Object.values(scores);
    
    // Each score should be between 3 and 18 before racial bonuses
    if (values.some(v => v < 3 || v > 18)) {
      return false;
    }

    // Sum should be reasonable (between 45 and 90 for most methods)
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum < 45 || sum > 90) {
      return false;
    }

    return true;
  }
}
