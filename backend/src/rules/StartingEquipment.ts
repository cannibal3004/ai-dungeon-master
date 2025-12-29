// Starting equipment by class (D&D 5e simplified)
export const STARTING_EQUIPMENT: Record<string, Array<{ name: string; quantity: number }>> = {
  fighter: [
    { name: 'Chain Mail', quantity: 1 },
    { name: 'Longsword', quantity: 1 },
    { name: 'Shield', quantity: 1 },
    { name: 'Light Crossbow', quantity: 1 },
    { name: 'Bolts', quantity: 20 },
    { name: "Explorer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  wizard: [
    { name: 'Quarterstaff', quantity: 1 },
    { name: 'Spellbook', quantity: 1 },
    { name: 'Component Pouch', quantity: 1 },
    { name: "Scholar's Pack", quantity: 1 },
    { name: 'Robes', quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  rogue: [
    { name: 'Rapier', quantity: 1 },
    { name: 'Shortbow', quantity: 1 },
    { name: 'Arrows', quantity: 20 },
    { name: 'Leather Armor', quantity: 1 },
    { name: "Burglar's Pack", quantity: 1 },
    { name: "Thieves' Tools", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  cleric: [
    { name: 'Mace', quantity: 1 },
    { name: 'Scale Mail', quantity: 1 },
    { name: 'Shield', quantity: 1 },
    { name: 'Holy Symbol', quantity: 1 },
    { name: "Priest's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  ranger: [
    { name: 'Longbow', quantity: 1 },
    { name: 'Arrows', quantity: 20 },
    { name: 'Shortsword', quantity: 1 },
    { name: 'Leather Armor', quantity: 1 },
    { name: "Explorer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  paladin: [
    { name: 'Longsword', quantity: 1 },
    { name: 'Shield', quantity: 1 },
    { name: 'Chain Mail', quantity: 1 },
    { name: 'Holy Symbol', quantity: 1 },
    { name: "Priest's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  barbarian: [
    { name: 'Greataxe', quantity: 1 },
    { name: 'Handaxe', quantity: 2 },
    { name: "Explorer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  bard: [
    { name: 'Rapier', quantity: 1 },
    { name: 'Lute', quantity: 1 },
    { name: 'Leather Armor', quantity: 1 },
    { name: "Entertainer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  druid: [
    { name: 'Wooden Shield', quantity: 1 },
    { name: 'Scimitar', quantity: 1 },
    { name: 'Leather Armor', quantity: 1 },
    { name: 'Druidic Focus', quantity: 1 },
    { name: "Explorer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  warlock: [
    { name: 'Light Crossbow', quantity: 1 },
    { name: 'Bolts', quantity: 20 },
    { name: 'Leather Armor', quantity: 1 },
    { name: 'Arcane Focus', quantity: 1 },
    { name: "Scholar's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  monk: [
    { name: 'Shortsword', quantity: 1 },
    { name: 'Darts', quantity: 10 },
    { name: "Dungeoneer's Pack", quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
  sorcerer: [
    { name: 'Light Crossbow', quantity: 1 },
    { name: 'Bolts', quantity: 20 },
    { name: 'Component Pouch', quantity: 1 },
    { name: "Dungeoneer's Pack", quantity: 1 },
    { name: 'Robes', quantity: 1 },
    { name: 'Waterskin', quantity: 1 },
    { name: 'Rations', quantity: 10 }
  ],
};

// Starting gold by class (in gold pieces)
export const STARTING_GOLD: Record<string, number> = {
  fighter: 50,
  wizard: 40,
  rogue: 40,
  cleric: 50,
  ranger: 50,
  paladin: 50,
  barbarian: 20,
  bard: 50,
  druid: 20,
  warlock: 40,
  monk: 5,
  sorcerer: 30,
};

export function getStartingEquipment(characterClass: string): { inventory: Array<{ name: string; quantity: number }>; gold: number } {
  const normalizedClass = characterClass.toLowerCase();
  
  return {
    inventory: STARTING_EQUIPMENT[normalizedClass] || [
      { name: 'Dagger', quantity: 1 },
      { name: "Adventurer's Pack", quantity: 1 },
      { name: 'Waterskin', quantity: 1 },
      { name: 'Rations', quantity: 10 }
    ],
    gold: STARTING_GOLD[normalizedClass] || 25
  };
}
