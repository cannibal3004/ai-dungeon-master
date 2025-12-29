// D&D 5e constants and reference data

export const ABILITY_SCORES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
export type AbilityScore = typeof ABILITY_SCORES[number];

export const RACES = {
  human: { name: 'Human', abilityBonuses: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 }, speed: 30 },
  elf: { name: 'Elf', abilityBonuses: { dexterity: 2 }, speed: 30 },
  dwarf: { name: 'Dwarf', abilityBonuses: { constitution: 2 }, speed: 25 },
  halfling: { name: 'Halfling', abilityBonuses: { dexterity: 2 }, speed: 25 },
  dragonborn: { name: 'Dragonborn', abilityBonuses: { strength: 2, charisma: 1 }, speed: 30 },
  gnome: { name: 'Gnome', abilityBonuses: { intelligence: 2 }, speed: 25 },
  'half-elf': { name: 'Half-Elf', abilityBonuses: { charisma: 2 }, speed: 30 },
  'half-orc': { name: 'Half-Orc', abilityBonuses: { strength: 2, constitution: 1 }, speed: 30 },
  tiefling: { name: 'Tiefling', abilityBonuses: { charisma: 2, intelligence: 1 }, speed: 30 },
} as const;

export type Race = keyof typeof RACES;

export const CLASSES = {
  barbarian: { name: 'Barbarian', hitDie: 12, primaryAbility: 'strength' as AbilityScore },
  bard: { name: 'Bard', hitDie: 8, primaryAbility: 'charisma' as AbilityScore },
  cleric: { name: 'Cleric', hitDie: 8, primaryAbility: 'wisdom' as AbilityScore },
  druid: { name: 'Druid', hitDie: 8, primaryAbility: 'wisdom' as AbilityScore },
  fighter: { name: 'Fighter', hitDie: 10, primaryAbility: 'strength' as AbilityScore },
  monk: { name: 'Monk', hitDie: 8, primaryAbility: 'dexterity' as AbilityScore },
  paladin: { name: 'Paladin', hitDie: 10, primaryAbility: 'strength' as AbilityScore },
  ranger: { name: 'Ranger', hitDie: 10, primaryAbility: 'dexterity' as AbilityScore },
  rogue: { name: 'Rogue', hitDie: 8, primaryAbility: 'dexterity' as AbilityScore },
  sorcerer: { name: 'Sorcerer', hitDie: 6, primaryAbility: 'charisma' as AbilityScore },
  warlock: { name: 'Warlock', hitDie: 8, primaryAbility: 'charisma' as AbilityScore },
  wizard: { name: 'Wizard', hitDie: 6, primaryAbility: 'intelligence' as AbilityScore },
} as const;

export type CharacterClass = keyof typeof CLASSES;

export const SKILLS = {
  acrobatics: { name: 'Acrobatics', ability: 'dexterity' as AbilityScore },
  'animal-handling': { name: 'Animal Handling', ability: 'wisdom' as AbilityScore },
  arcana: { name: 'Arcana', ability: 'intelligence' as AbilityScore },
  athletics: { name: 'Athletics', ability: 'strength' as AbilityScore },
  deception: { name: 'Deception', ability: 'charisma' as AbilityScore },
  history: { name: 'History', ability: 'intelligence' as AbilityScore },
  insight: { name: 'Insight', ability: 'wisdom' as AbilityScore },
  intimidation: { name: 'Intimidation', ability: 'charisma' as AbilityScore },
  investigation: { name: 'Investigation', ability: 'intelligence' as AbilityScore },
  medicine: { name: 'Medicine', ability: 'wisdom' as AbilityScore },
  nature: { name: 'Nature', ability: 'intelligence' as AbilityScore },
  perception: { name: 'Perception', ability: 'wisdom' as AbilityScore },
  performance: { name: 'Performance', ability: 'charisma' as AbilityScore },
  persuasion: { name: 'Persuasion', ability: 'charisma' as AbilityScore },
  religion: { name: 'Religion', ability: 'intelligence' as AbilityScore },
  'sleight-of-hand': { name: 'Sleight of Hand', ability: 'dexterity' as AbilityScore },
  stealth: { name: 'Stealth', ability: 'dexterity' as AbilityScore },
  survival: { name: 'Survival', ability: 'wisdom' as AbilityScore },
} as const;

export type Skill = keyof typeof SKILLS;

export const ALIGNMENTS = [
  'lawful-good',
  'neutral-good',
  'chaotic-good',
  'lawful-neutral',
  'true-neutral',
  'chaotic-neutral',
  'lawful-evil',
  'neutral-evil',
  'chaotic-evil',
] as const;

export type Alignment = typeof ALIGNMENTS[number];
