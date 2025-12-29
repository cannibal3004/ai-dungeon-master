import { RACES, CLASSES, SKILLS } from '../rules/constants';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface DMContext {
  campaignId: string;
  campaignName?: string;
  campaignDescription?: string;
  currentLocation?: string;
  currentLocationDescription?: string;
  currentLocationType?: string;
  nearbyLocations?: Array<{ 
    name: string; 
    type: string; 
    description?: string;
    travelTime?: string;
  }>;
  npcAtCurrentLocation?: Array<{
    id: string;
    name: string;
    role?: string;
    personality?: string;
    relationship?: string;
    description?: string;
  }>;
  shopsAtCurrentLocation?: Array<{
    id: string;
    name: string;
    type?: string;
    description?: string;
  }>;
  itemsAtCurrentLocation?: Array<{
    id: string;
    name: string;
    type?: string;
    description?: string;
  }>;
  activeNPCs: Array<{
    id: string;
    name: string;
    personality: string;
    relationship: string;
  }>;
  partyMembers: Array<{
    id: string;
    name: string;
    race: string;
    class: string;
    level: number;
  }>;
  recentEvents: string[];
  questObjectives: string[];
  activeQuests?: Array<{
    title: string;
    description?: string;
    giver?: string;
    objectives: string[];
    rewards?: string;
  }>;
  sessionSummary?: string;
  knownLocations?: Array<{ name: string; type: string }>;
  knownNPCs?: Array<{ name: string; role: string; location: string }>;
  knownShops?: Array<{ name: string; type: string; location: string }>;
  knownItems?: Array<{ name: string; type: string; location: string }>;
  activeCharacter?: {
    name: string;
    inventory: string[];
    gold: number;
  };
}

export interface EncounterRequest {
  partyLevel: number;
  partySize: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  terrain?: string;
  enemyTypes?: string[];
}

export interface GeneratedEncounter {
  description: string;
  enemies: Array<{
    name: string;
    count: number;
    hp: number;
    ac: number;
    challenge: number;
  }>;
  terrain: string;
  tactics?: string;
}

export const SYSTEM_PROMPTS = {
  DUNGEON_MASTER: `You are an experienced Dungeon Master running a D&D 5th Edition campaign. Your role is to:
- Create engaging narratives and vivid descriptions
- Respond to player actions with appropriate consequences
- Maintain consistency with established lore and characters
- Balance challenge and fun
- Encourage player creativity and roleplay
- Follow D&D 5e rules when relevant

NAMING CONVENTIONS:
- When naming is needed (places, NPCs, items), YOU provide the names - never ask the player to name things
- It's fine for things to start mysterious ("a hooded stranger", "a small village") - that's part of discovery
- But when a name is revealed or needed, YOU decide it confidently
- Example: DON'T say "What would you like to name this village?" - DO say "The village elder introduces it as Thornhaven"
- The player controls their CHARACTER, you control the WORLD

CRITICAL RULES FOR DICE ROLLS:
- NEVER roll dice for the player or assume their roll results
- When a check is needed, ASK the player to roll (e.g., "Roll a Dexterity check" or "Make a Perception check")
- WAIT for the player to provide their roll result before continuing the narrative
- Do NOT say things like "we'll say you rolled a 16" or progress the story assuming an outcome
- The player must have agency over their own dice rolls

AFTER ROLLS:
- When the player provides a roll result, APPLY it, RESOLVE the outcome (hit/miss, damage, success/failure), and CONTINUE the narrative promptly.
- In combat, after damage is rolled and applied, briefly describe effects and prompt the next meaningful decision (enemy reaction, player choices, or next turn). 

TOOLS:
INVENTORY & STATE MANAGEMENT:
- **ALWAYS use add_items_to_inventory() when characters receive, find, pick up, or are given items**
- **ALWAYS use remove_items_from_inventory() when characters lose, sell, give away, or use up items**
- **ALWAYS use update_character_gold() when gold is gained or spent**
- **ALWAYS use update_character_hp() when HP changes occur**
- After calling inventory tools, the narrative will automatically continue - describe what happened naturally
- Example: If a character finds "leather armor" and a "rusty sword", call add_items_to_inventory with both items
- DO NOT just mention items in narrative text without using the tools - this causes inventory desync

OTHER AVAILABLE TOOLS:
- start_combat(enemies: [{ name, hp, maxHp, ac, dexterity }]): initialize structured combat tracking
- lookup_enemy(name: string): fetch SRD monster stats for accurate combat descriptions
- upsert_world_entities(locations, npcs, shops, items): create/update world entities with canonical names
- update_character_xp() / roll_dice() / add_quest() / update_quest()

Keep responses concise but atmospheric. Describe scenes, NPC reactions, and outcomes clearly. Ask for dice rolls when appropriate. Present meaningful choices to players.`,

  NPC_DIALOGUE: `You are roleplaying as an NPC in a D&D campaign. Stay in character based on the provided personality and background. Respond naturally to player questions and actions. Show emotion and motivation through dialogue. Keep responses brief but characterful (2-4 sentences typically).`,

  ENCOUNTER_GENERATOR: `You are a D&D encounter designer. Create balanced, thematic combat encounters based on party composition and difficulty. Include:
- Enemy selection appropriate to the setting
- Tactical positioning and terrain
- Number of enemies based on action economy
- CR-appropriate challenges

Return encounters as structured data with enemy stats.`,

  SESSION_SUMMARY: `Summarize the key events of this D&D session. Focus on:
- Major plot developments
- Important NPC interactions
- Combat outcomes
- Character decisions
- Unresolved threads

Keep it concise (3-5 paragraphs). Write in past tense.`,

  LOCATION_DESCRIPTION: `Describe this D&D location with rich sensory detail. Include:
- Visual appearance and atmosphere
- Sounds, smells, and textures
- Points of interest
- Potential dangers or opportunities

Keep it concise (2-3 paragraphs) but evocative. Match the tone to the setting.`,
};

/**
 * Build D&D 5e rules reference for LLM context
 */
export function buildRulesContext(): string {
  const racesList = Object.entries(RACES)
    .map(([_key, race]) => {
      const bonusStr = Object.entries(race.abilityBonuses)
        .filter(([_, bonus]) => bonus > 0)
        .map(([ability, bonus]) => `+${bonus} ${ability}`)
        .join(', ');
      return `${race.name}: ${bonusStr}, Speed ${race.speed}ft`;
    })
    .join('\n');

  const classesList = Object.entries(CLASSES)
    .map(([_key, cls]) => `${cls.name}: d${cls.hitDie} hit die, primary ability ${cls.primaryAbility}`)
    .join('\n');

  const skillsList = Object.entries(SKILLS)
    .map(([_key, skill]) => `${skill.name} (${skill.ability})`)
    .join(', ');

  return `D&D 5E RULES REFERENCE:

RACES (with ability bonuses):
${racesList}

CLASSES (with hit die and primary ability):
${classesList}

SKILLS (and their base abilities):
${skillsList}

KEY MECHANICS:
- Advantage: roll 2d20, take higher
- Disadvantage: roll 2d20, take lower
- Ability Check: 1d20 + ability modifier
- Skill Check: 1d20 + ability modifier + proficiency (if applicable)
- Attack Roll: 1d20 + attack bonus (DEX or STR modifier + weapon bonus)
- Saving Throw: 1d20 + ability modifier + proficiency (if applicable)
- Proficiency Bonus: +2 for levels 1-4, +3 for levels 5-8, +4 for levels 9-12, +5 for levels 13+

DIFFICULTY CLASSES (DC):
- Very easy: 5
- Easy: 10
- Medium: 15
- Hard: 20
- Very hard: 25
- Nearly impossible: 30

DAMAGE BY WEAPON TYPE:
- Light: 1d4 (dagger)
- Short: 1d6 (shortsword, mace)
- Medium: 1d8 (longsword, spear)
- Heavy: 1d10-1d12 (greataxe, greatsword)
- Ranged: 1d6-1d8 (bow, crossbow)

Use these rules when describing combat outcomes, ability checks, or suggesting challenges to ensure mechanical accuracy.`;
}

export function buildDMPrompt(context: DMContext, playerAction: string): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPTS.DUNGEON_MASTER,
    },
    {
      role: 'system',
      content: buildRulesContext(),
    },
  ];

  // Campaign name and description inform setting and tone
  if (context.campaignName) {
    messages.push({ role: 'system', content: `Campaign: ${context.campaignName}` });
  }
  if (context.campaignDescription) {
    messages.push({ role: 'system', content: `Campaign premise: ${context.campaignDescription}` });
  }

  // Add campaign context
  if (context.sessionSummary) {
    messages.push({
      role: 'system',
      content: `Previous session summary: ${context.sessionSummary}`,
    });
  }

  // Add current party info
  const partyInfo = context.partyMembers
    .map((p) => `${p.name} (Level ${p.level} ${p.race} ${p.class})`)
    .join(', ');
  messages.push({
    role: 'system',
    content: `Current party: ${partyInfo}`,
  });

  // Add location context (detailed)
  if (context.currentLocation) {
    const locationDetails: string[] = [
      `Current location: ${context.currentLocation}`,
    ];
    
    if (context.currentLocationType) {
      locationDetails.push(`Location type: ${context.currentLocationType}`);
    }
    
    if (context.currentLocationDescription) {
      locationDetails.push(`Description: ${context.currentLocationDescription}`);
    }
    
    if (context.npcAtCurrentLocation && context.npcAtCurrentLocation.length > 0) {
      // Provide rich NPC context to help LLM distinguish similar characters
      const npcDetails = context.npcAtCurrentLocation
        .map((npc) => {
          let npcStr = npc.name;
          if (npc.role) npcStr += ` (${npc.role})`;
          // Add personality or description snippet to help differentiate NPCs with similar names/roles
          if (npc.personality) {
            npcStr += ` - ${npc.personality.substring(0, 50)}${npc.personality.length > 50 ? '...' : ''}`;
          } else if (npc.description) {
            npcStr += ` - ${npc.description.substring(0, 50)}${npc.description.length > 50 ? '...' : ''}`;
          }
          return npcStr;
        })
        .join(', ');
      locationDetails.push(`NPCs here: ${npcDetails}`);
    }
    
    if (context.shopsAtCurrentLocation && context.shopsAtCurrentLocation.length > 0) {
      const shopsHere = context.shopsAtCurrentLocation
        .map((shop) => `${shop.name}${shop.type ? ` (${shop.type})` : ''}`)
        .join(', ');
      locationDetails.push(`Shops here: ${shopsHere}`);
    }
    
    if (context.itemsAtCurrentLocation && context.itemsAtCurrentLocation.length > 0) {
      const itemsHere = context.itemsAtCurrentLocation
        .map((item) => `${item.name}${item.type ? ` (${item.type})` : ''}`)
        .join(', ');
      locationDetails.push(`Items available: ${itemsHere}`);
    }
    
    if (context.nearbyLocations && context.nearbyLocations.length > 0) {
      const nearby = context.nearbyLocations
        .map((loc) => `${loc.name} (${loc.type})${loc.travelTime ? ` - ${loc.travelTime}` : ''}`)
        .join(', ');
      locationDetails.push(`Nearby locations: ${nearby}`);
    }
    
    messages.push({
      role: 'system',
      content: locationDetails.join('\n'),
    });
  }


  // Add active NPCs
  if (context.activeNPCs.length > 0) {
    const npcInfo = context.activeNPCs
      .map((npc) => `${npc.name}: ${npc.personality} (${npc.relationship})`)
      .join('\n');
    messages.push({
      role: 'system',
      content: `Active NPCs:\n${npcInfo}`,
    });
  }

  // Add recent events for context
  if (context.recentEvents.length > 0) {
    messages.push({
      role: 'system',
      content: `Recent events:\n${context.recentEvents.slice(-5).join('\n')}`,
    });
  }

  // Add quest objectives
  if (context.questObjectives.length > 0) {
    messages.push({
      role: 'system',
      content: `Active objectives:\n${context.questObjectives.join('\n')}`,
    });
  }

  // Add active quests with details
  if (context.activeQuests && context.activeQuests.length > 0) {
    const questDetails = context.activeQuests.map(q => {
      let details = `**${q.title}**`;
      if (q.giver) details += ` (from ${q.giver})`;
      if (q.description) details += `\n  ${q.description}`;
      if (q.objectives.length > 0) details += `\n  Objectives: ${q.objectives.join(', ')}`;
      if (q.rewards) details += `\n  Rewards: ${q.rewards}`;
      return details;
    }).join('\n\n');
    
    messages.push({
      role: 'system',
      content: `Active Quests:\n${questDetails}`,
    });
  }

  // Add relevant world knowledge (limited to nearby locations to save tokens)
  // The LLM already knows about current location NPCs/shops/items from the location context above
  const worldKnowledge: string[] = [];
  
  // Only include nearby locations (not the full list of all discovered locations)
  if (context.nearbyLocations && context.nearbyLocations.length > 0) {
    // Already included in location context, so skip to avoid duplication
  }
  
  // Only include NPCs/shops/items from current + nearby locations (not the entire world)
  if (context.knownNPCs && context.knownNPCs.length > 0 && context.nearbyLocations) {
    const nearbyLocationNames = context.nearbyLocations.map(l => l.name);
    const currentLocationName = context.currentLocation;
    
    const relevantNPCs = context.knownNPCs.filter(n => 
      n.location === currentLocationName || nearbyLocationNames.includes(n.location)
    );
    
    if (relevantNPCs.length > 0) {
      worldKnowledge.push(`NPCs in nearby area: ${relevantNPCs.map(n => `${n.name} (${n.role}) at ${n.location}`).join(', ')}`);
    }
  }
  
  if (context.knownShops && context.knownShops.length > 0 && context.nearbyLocations) {
    const nearbyLocationNames = context.nearbyLocations.map(l => l.name);
    const currentLocationName = context.currentLocation;
    
    const relevantShops = context.knownShops.filter(s => 
      s.location === currentLocationName || nearbyLocationNames.includes(s.location)
    );
    
    if (relevantShops.length > 0) {
      worldKnowledge.push(`Shops in nearby area: ${relevantShops.map(s => `${s.name} (${s.type}) at ${s.location}`).join(', ')}`);
    }
  }

  if (worldKnowledge.length > 0) {
    messages.push({
      role: 'system',
      content: `Nearby area knowledge:\n${worldKnowledge.join('\n')}`,
    });
  }

  // Add active character's inventory
  if (context.activeCharacter) {
    const inventoryList = context.activeCharacter.inventory.length > 0 
      ? context.activeCharacter.inventory.join(', ')
      : 'empty';
    messages.push({
      role: 'system',
      content: `${context.activeCharacter.name}'s current inventory: ${inventoryList}\nGold: ${context.activeCharacter.gold} gp\n\nIMPORTANT: When the player asks about their inventory, list these exact items. Track changes accurately.`,
    });
  }

  // Add the player's action
  messages.push({
    role: 'user',
    content: playerAction,
  });

  return messages;
}

export function buildNPCPrompt(
  npcName: string,
  personality: string,
  background: string,
  conversationHistory: ChatMessage[],
  playerMessage: string
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPTS.NPC_DIALOGUE,
    },
    {
      role: 'system',
      content: `You are ${npcName}. Personality: ${personality}. Background: ${background}`,
    },
    ...conversationHistory.slice(-10), // Last 10 messages for context
    {
      role: 'user',
      content: playerMessage,
      name: 'Player',
    },
  ];
}

export function buildEncounterPrompt(request: EncounterRequest): string {
  return `${SYSTEM_PROMPTS.ENCOUNTER_GENERATOR}

Party: ${request.partySize} characters, average level ${request.partyLevel}
Difficulty: ${request.difficulty}
${request.terrain ? `Terrain: ${request.terrain}` : ''}
${request.enemyTypes ? `Preferred enemies: ${request.enemyTypes.join(', ')}` : ''}

Generate a balanced encounter. Return JSON with this structure:
{
  "description": "Brief encounter setup",
  "enemies": [
    {"name": "Enemy Type", "count": 2, "hp": 30, "ac": 15, "challenge": 2}
  ],
  "terrain": "Description of battlefield",
  "tactics": "Enemy strategy"
}`;
}

export function buildLocationPrompt(
  locationType: string,
  atmosphere: string,
  details?: string
): string {
  return `${SYSTEM_PROMPTS.LOCATION_DESCRIPTION}

Location type: ${locationType}
Atmosphere: ${atmosphere}
${details ? `Additional details: ${details}` : ''}

Describe this location for players.`;
}

export function buildSummaryPrompt(events: string[]): string {
  return `${SYSTEM_PROMPTS.SESSION_SUMMARY}

Session events:
${events.join('\n')}

Provide a session summary.`;
}
