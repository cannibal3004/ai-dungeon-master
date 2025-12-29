export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRoll {
  dice: DiceType;
  modifier: number;
  result: number;
  rolls: number[];
  total: number;
}

export function rollDice(dice: DiceType, count: number = 1, modifier: number = 0): DiceRoll {
  const sides = parseInt(dice.substring(1));
  const rolls: number[] = [];
  
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  
  const result = rolls.reduce((sum, roll) => sum + roll, 0);
  const total = result + modifier;
  
  return {
    dice,
    modifier,
    result,
    rolls,
    total
  };
}

export function formatRollResult(roll: DiceRoll, count: number = 1): string {
  const diceNotation = count > 1 ? `${count}${roll.dice}` : roll.dice;
  const modifierText = roll.modifier !== 0 
    ? ` ${roll.modifier > 0 ? '+' : ''}${roll.modifier}` 
    : '';
  
  if (count > 1) {
    return `${diceNotation}${modifierText} = [${roll.rolls.join(', ')}]${modifierText} = ${roll.total}`;
  }
  
  return `${diceNotation}${modifierText} = ${roll.total}`;
}
