import { rollDice, rollWithAdvantage, rollWithDisadvantage, getAbilityModifier } from './dice';

export type DamageType = 
  | 'slashing' | 'piercing' | 'bludgeoning' 
  | 'fire' | 'cold' | 'lightning' | 'thunder' | 'acid' | 'poison' 
  | 'radiant' | 'necrotic' | 'psychic' | 'force';

export type Condition = 
  | 'blinded' | 'charmed' | 'deafened' | 'frightened' 
  | 'grappled' | 'incapacitated' | 'invisible' | 'paralyzed' 
  | 'petrified' | 'poisoned' | 'prone' | 'restrained' 
  | 'stunned' | 'unconscious';

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  dexterity: number;
  conditions: Condition[];
  isPlayer: boolean;
  level?: number;
  quantity?: number;
}

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  damage: number;
  damageType: DamageType;
  attackRoll: number;
  damageRoll: string;
}

export interface CombatState {
  round: number;
  turnOrder: Combatant[];
  currentTurnIndex: number;
  active: boolean;
}

/**
 * Roll initiative for a combatant
 */
export function rollInitiativeOverride(dexterity: number, advantage = false, disadvantage = false): number {
  const dexMod = getAbilityModifier(dexterity);
  
  let roll: number;
  if (advantage) {
    roll = rollWithAdvantage(20).roll;
  } else if (disadvantage) {
    roll = rollWithDisadvantage(20).roll;
  } else {
    roll = rollDice(1, 20);
  }
  
  return roll + dexMod;
}

/**
 * Sort combatants by initiative (highest first)
 */
export function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie-breaker: higher dexterity goes first
    if (b.dexterity !== a.dexterity) {
      return b.dexterity - a.dexterity;
    }
    // Final tie-breaker: random
    return Math.random() - 0.5;
  });
}

/**
 * Make an attack roll
 */
export function makeAttackRoll(
  attackBonus: number,
  targetAC: number,
  advantage = false,
  disadvantage = false
): { hit: boolean; critical: boolean; roll: number } {
  let roll: number;
  
  if (advantage && !disadvantage) {
    roll = rollWithAdvantage(20).roll;
  } else if (disadvantage && !advantage) {
    roll = rollWithDisadvantage(20).roll;
  } else {
    roll = rollDice(1, 20);
  }
  
  const critical = roll === 20;
  const criticalMiss = roll === 1;
  
  // Natural 20 always hits, natural 1 always misses
  if (critical) {
    return { hit: true, critical: true, roll };
  }
  if (criticalMiss) {
    return { hit: false, critical: false, roll };
  }
  
  const total = roll + attackBonus;
  return { hit: total >= targetAC, critical: false, roll };
}

/**
 * Roll damage
 */
export function rollDamage(
  damageDice: string, // e.g., "2d6+3"
  critical = false
): { total: number; roll: string } {
  // Parse damage dice (e.g., "2d6+3")
  const match = damageDice.match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!match) {
    throw new Error(`Invalid damage dice format: ${damageDice}`);
  }
  
  const numDice = parseInt(match[1]);
  const dieSize = parseInt(match[2]);
  const bonus = parseInt(match[3] || '0');
  
  // Roll dice (double for critical)
  const diceToRoll = critical ? numDice * 2 : numDice;
  const damage = rollDice(dieSize, diceToRoll);
  const total = damage + bonus;
  
  const rollStr = critical 
    ? `${diceToRoll}d${dieSize}+${bonus} (CRITICAL)`
    : damageDice;
  
  return { total, roll: rollStr };
}

/**
 * Execute a full attack
 */
export function executeAttack(
  attacker: { name: string; attackBonus: number },
  target: Combatant,
  damageDice: string,
  damageType: DamageType,
  advantage = false,
  disadvantage = false
): AttackResult {
  // Check if target has conditions affecting AC
  const targetAdvantage = target.conditions.includes('prone') ? true : advantage;
  const targetDisadvantage = target.conditions.includes('invisible') ? true : disadvantage;
  
  // Make attack roll
  const { hit, critical, roll } = makeAttackRoll(
    attacker.attackBonus,
    target.ac,
    targetAdvantage,
    targetDisadvantage
  );
  
  if (!hit) {
    return {
      hit: false,
      critical: false,
      damage: 0,
      damageType,
      attackRoll: roll,
      damageRoll: 'Miss',
    };
  }
  
  // Roll damage
  const { total, roll: damageRoll } = rollDamage(damageDice, critical);
  
  return {
    hit: true,
    critical,
    damage: total,
    damageType,
    attackRoll: roll,
    damageRoll,
  };
}

/**
 * Apply damage to a combatant
 */
export function applyDamage(
  combatant: Combatant,
  damage: number,
  damageType: DamageType,
  resistances: DamageType[] = [],
  immunities: DamageType[] = [],
  vulnerabilities: DamageType[] = []
): { newHp: number; actualDamage: number; status: string } {
  let actualDamage = damage;
  let status = '';
  
  // Check immunity
  if (immunities.includes(damageType)) {
    actualDamage = 0;
    status = 'immune';
  }
  // Check resistance (half damage)
  else if (resistances.includes(damageType)) {
    actualDamage = Math.floor(damage / 2);
    status = 'resistant';
  }
  // Check vulnerability (double damage)
  else if (vulnerabilities.includes(damageType)) {
    actualDamage = damage * 2;
    status = 'vulnerable';
  }
  
  const newHp = Math.max(0, combatant.hp - actualDamage);
  
  // Check if knocked unconscious
  if (newHp === 0 && combatant.hp > 0) {
    status = status ? `${status}, unconscious` : 'unconscious';
  }
  
  return { newHp, actualDamage, status };
}

/**
 * Apply healing
 */
export function applyHealing(combatant: Combatant, healing: number): number {
  return Math.min(combatant.maxHp, combatant.hp + healing);
}

/**
 * Check if combatant can act (not incapacitated)
 */
export function canAct(combatant: Combatant): boolean {
  const incapacitatingConditions: Condition[] = [
    'incapacitated',
    'paralyzed',
    'petrified',
    'stunned',
    'unconscious',
  ];
  
  return !combatant.conditions.some(c => incapacitatingConditions.includes(c));
}

/**
 * Get advantage/disadvantage on attack based on conditions
 */
export function getAttackModifiers(attacker: Combatant, target: Combatant): {
  advantage: boolean;
  disadvantage: boolean;
} {
  let advantage = false;
  let disadvantage = false;
  
  // Attacker conditions
  if (attacker.conditions.includes('invisible')) advantage = true;
  if (attacker.conditions.includes('prone')) disadvantage = true;
  if (attacker.conditions.includes('blinded')) disadvantage = true;
  if (attacker.conditions.includes('frightened')) disadvantage = true;
  if (attacker.conditions.includes('poisoned')) disadvantage = true;
  if (attacker.conditions.includes('restrained')) disadvantage = true;
  
  // Target conditions
  if (target.conditions.includes('prone')) advantage = true;
  if (target.conditions.includes('paralyzed')) advantage = true;
  if (target.conditions.includes('restrained')) advantage = true;
  if (target.conditions.includes('stunned')) advantage = true;
  if (target.conditions.includes('unconscious')) advantage = true;
  if (target.conditions.includes('invisible')) disadvantage = true;
  
  return { advantage, disadvantage };
}

/**
 * Initialize combat state
 */
export function initializeCombat(combatants: Combatant[]): CombatState {
  return {
    round: 1,
    turnOrder: sortByInitiative(combatants),
    currentTurnIndex: 0,
    active: true,
  };
}

/**
 * Advance to next turn
 */
export function nextTurn(state: CombatState): CombatState {
  const nextIndex = state.currentTurnIndex + 1;
  
  if (nextIndex >= state.turnOrder.length) {
    // New round
    return {
      ...state,
      round: state.round + 1,
      currentTurnIndex: 0,
    };
  }
  
  return {
    ...state,
    currentTurnIndex: nextIndex,
  };
}

/**
 * Get current combatant
 */
export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (state.currentTurnIndex >= state.turnOrder.length) {
    return null;
  }
  return state.turnOrder[state.currentTurnIndex];
}

/**
 * Check if combat should end
 */
export function shouldEndCombat(combatants: Combatant[]): boolean {
  const playersAlive = combatants.filter(c => c.isPlayer && c.hp > 0).length;
  const enemiesAlive = combatants.filter(c => !c.isPlayer && c.hp > 0).length;
  
  return playersAlive === 0 || enemiesAlive === 0;
}
