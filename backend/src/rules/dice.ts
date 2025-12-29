import { AbilityScore } from './constants';

/**
 * Roll a die with the specified number of sides
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll multiple dice and return the sum
 */
export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += rollDie(sides);
  }
  return total;
}

/**
 * Roll 4d6, drop the lowest, for ability score generation
 */
export function rollAbilityScore(): number {
  const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)];
  rolls.sort((a, b) => a - b);
  rolls.shift(); // Remove lowest
  return rolls.reduce((sum, roll) => sum + roll, 0);
}

/**
 * Generate a complete set of ability scores (roll 4d6 drop lowest for each)
 */
export function generateAbilityScores(): Record<AbilityScore, number> {
  return {
    strength: rollAbilityScore(),
    dexterity: rollAbilityScore(),
    constitution: rollAbilityScore(),
    intelligence: rollAbilityScore(),
    wisdom: rollAbilityScore(),
    charisma: rollAbilityScore(),
  };
}

/**
 * Calculate ability modifier from ability score
 */
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calculate proficiency bonus based on level
 */
export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/**
 * Roll with advantage (roll twice, take higher)
 */
export function rollWithAdvantage(sides: number = 20): { roll: number; dice: number[] } {
  const roll1 = rollDie(sides);
  const roll2 = rollDie(sides);
  return {
    roll: Math.max(roll1, roll2),
    dice: [roll1, roll2],
  };
}

/**
 * Roll with disadvantage (roll twice, take lower)
 */
export function rollWithDisadvantage(sides: number = 20): { roll: number; dice: number[] } {
  const roll1 = rollDie(sides);
  const roll2 = rollDie(sides);
  return {
    roll: Math.min(roll1, roll2),
    dice: [roll1, roll2],
  };
}

/**
 * Make a skill check
 */
export interface SkillCheckResult {
  total: number;
  roll: number;
  modifier: number;
  proficiencyBonus: number;
  success: boolean;
}

export function makeSkillCheck(
  abilityScore: number,
  isProficient: boolean,
  proficiencyBonus: number,
  dc: number,
  advantage?: 'advantage' | 'disadvantage'
): SkillCheckResult {
  let roll: number;
  
  if (advantage === 'advantage') {
    roll = rollWithAdvantage(20).roll;
  } else if (advantage === 'disadvantage') {
    roll = rollWithDisadvantage(20).roll;
  } else {
    roll = rollDie(20);
  }

  const modifier = getAbilityModifier(abilityScore);
  const profBonus = isProficient ? proficiencyBonus : 0;
  const total = roll + modifier + profBonus;

  return {
    total,
    roll,
    modifier,
    proficiencyBonus: profBonus,
    success: total >= dc,
  };
}

/**
 * Make a saving throw
 */
export function makeSavingThrow(
  abilityScore: number,
  isProficient: boolean,
  proficiencyBonus: number,
  dc: number,
  advantage?: 'advantage' | 'disadvantage'
): SkillCheckResult {
  return makeSkillCheck(abilityScore, isProficient, proficiencyBonus, dc, advantage);
}

/**
 * Calculate initiative
 */
export function rollInitiative(dexterityScore: number): number {
  return rollDie(20) + getAbilityModifier(dexterityScore);
}
