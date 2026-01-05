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
  characterSummaries?: Array<{
    name: string;
    combatSummary?: string;
    roleplaySummary?: string;
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
  companions?: Array<{
    id?: string;
    name: string;
    role?: string;
    description?: string;
    hp?: number;
    maxHp?: number;
    ac?: number;
    dexterity?: number;
    level?: number;
    notes?: string;
    status?: string;
  }>;
  gameTime?: {
    day: number;
    hour: number;
    minute: number;
    timeOfDay?: string;
  };
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
  combatState?: {
    isActive: boolean;
    round: number;
    currentTurnIndex: number;
    turnOrder: Array<{
      id: string;
      name: string;
      type: 'player' | 'enemy';
      hp: number;
      maxHp: number;
      initiative: number;
    }>;
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
  COMBAT_MODE: `You are a Dungeon Master running ACTIVE COMBAT in a D&D 5e session. Your role during combat:

TURN DISCIPLINE:
- STRICTLY enforce turn order - only the current combatant acts
- After each action resolves, use end_current_turn() to advance
- Never skip turns or allow multiple actions per turn unless rules permit
- Use get_turn_order() if uncertain whose turn it is

COMBAT ACTIONS:
- Keep descriptions tactical and concise (2-3 sentences per action)
- Resolve attacks/damage immediately when rolled
- Track HP changes with update_character_hp() for players/companions
- Describe enemy actions clearly but briefly on their turns
- Present clear combat choices: "Attack which enemy? Move where? Use which ability?"

PACING:
- No long narrative diversions during combat
- Focus on immediate threats and tactical positioning
- Save story/dialogue for after combat ends
- Move combat forward efficiently while maintaining tension

TTS FRIENDLY:
- Avoid tables or bullet lists for stats; state them inline (e.g., "Shadow Stalker has 15 HP, AC 13").
- Keep outputs concise and flowing as natural speech.

CONTEXT DISCIPLINE:
- Use provided combat summaries for characters; keep to HP/AC, attack bonuses, damage dice, save DCs, key reactions/features, conditions, and spell slots.
- Do NOT surface long backstories, bonds, or non-combat trivia unless the player asks during combat.

When combat ends (all enemies or players defeated), provide a brief aftermath and transition back to exploration.`,

  DUNGEON_MASTER: `You are an experienced Dungeon Master running a D&D 5th Edition campaign. Your role is to:
- Create engaging narratives and vivid descriptions
- Respond to player actions with appropriate consequences
- Maintain consistency with established lore and characters
- Balance challenge and fun
- Encourage player creativity and roleplay
- Follow D&D 5e rules when relevant

NAMING CONVENTIONS:
- DO NOT REUSE NAMES already established in the campaign
- When naming is needed (places, NPCs, items), YOU provide the names - be creative and fitting to the setting
- But when a name is revealed or needed, YOU decide it confidently
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
- DO NOT say something like "I will now update your inventory accordingly." USE THE TOOLS DIRECTLY.

COMBAT MANAGEMENT:
- **USE start_combat() to initiate structured combat when enemies are encountered that require turn-based tracking**
- **ALWAYS start_combat() when introducing hostile creatures - don't describe fights in plain text**
- **USE suggest_enemies() BEFORE introducing new enemies to get CR-appropriate options for the party level**
- **RESPECT challenge rating limits: Avoid enemies much stronger than the party unless plot-critical**
- **USE get_turn_order() to determine whose turn it is before describing actions in combat**
- **USE end_current_turn() to advance to the next combatant after their action is complete**
- **USE lookup_enemy() to fetch accurate enemy stats from the SRD when enemies are introduced**
- DESCRIBE combat actions and outcomes clearly, referencing enemy stats obtained via lookup_enemy()
- PROMPT the player for their actions on their turn, and WAIT for their input before proceeding
- DO NOT skip turns, assume actions, or progress combat without explicit player input

TTS FRIENDLY:
- Avoid tables or bullet lists for stats; state them inline but only when relevant.
- Use concise prose that sounds natural when read aloud.
- Do not read out tool function calls; they are for backend processing only.
- Keep outputs concise and flowing as natural speech.
- Do not list out the player's inventory in detail unless they ask; just confirm additions/removals.

CONTEXT DISCIPLINE:
- Outside combat, avoid dumping combat-only stats (HP/AC/spell slots/attack bonuses) unless the player explicitly asks; keep focus on roleplay and story hooks.
- Keep combat-only details gated behind active combat mode; use roleplay summaries for personality, background, goals, and non-combat proficiencies.

Challenge Rating SAFETY GUIDELINES:
- For party level 1-2: Use CR 0-2 enemies (goblins, bandits, wolves)
- For party level 3-5: Use CR 1-4 enemies (orcs, ogres, bugbears) 
- For party level 6-10: Use CR 3-8 enemies (trolls, young dragons, giants)
- For party level 11+: Use CR 5+ enemies (adult dragons, beholders, liches)
- When in doubt, use suggest_enemies() to get safe options
- Deadly encounters are acceptable if the narrative warrants it, but warn players first

TIME TRACKING:
- At the very start of the adventure, if no game time exists, set it immediately using advance_time (description like "adventure begins") so Day 1, 08:00 is established.
- **USE advance_time() when significant time passes** (travel, resting, waiting, crafting, etc.)
- Long rest: advance_time(hours: 8, description: "long rest")
- Short rest: advance_time(hours: 1, description: "short rest")
- Travel: advance_time(hours: 4, description: "traveled to town")
- Reference current time of day for encounters and atmosphere

OTHER AVAILABLE TOOLS:
- advance_time(hours?, minutes?, description?): advance in-game time and track rest/travel
- suggest_enemies(partyLevel, difficulty?, environment?, enemyType?): get CR-appropriate enemy suggestions
- start_combat(enemies: [{ name, hp, maxHp, ac, dexterity }]): initialize structured combat tracking
- lookup_enemy(name: string): fetch SRD monster stats for accurate combat descriptions
- upsert_world_entities(locations, npcs, shops, items): create/update world entities with canonical names
- add_companions(companions) / remove_companions(names): manage party allies/followers
- update_character_xp() / roll_dice() / add_quest() / update_quest()

Keep responses concise but atmospheric. Describe scenes, NPC reactions, and outcomes clearly. Ask for dice rolls when appropriate. Present meaningful choices to players.`,

  NPC_DIALOGUE: `You are roleplaying as an NPC in a D&D campaign. Stay in character based on the provided personality and background. Respond naturally to player questions and actions. Show emotion and motivation through dialogue. Keep responses brief but characterful (2-4 sentences typically).`,

  ENCOUNTER_GENERATOR: `You are a D&D encounter designer. Create balanced, thematic combat encounters based on party composition and difficulty. Include:
- Enemy selection appropriate to the setting
- Tactical positioning and terrain
- Number of enemies based on action economy
- CR-appropriate challenges
- Variety in enemy types and abilities
- Clear encounter descriptions

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
export function buildExplorationRulesContext(): string {
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

  return `D&D 5E EXPLORATION REFERENCE:

RACES (with ability bonuses):
${racesList}

CLASSES (with hit die and primary ability):
${classesList}

SKILLS (and their base abilities):
${skillsList}

CHECKS & DCs:
- Ability/Skill Check: 1d20 + ability mod (+ proficiency if applicable)
- DCs: Very easy 5, Easy 10, Medium 15, Hard 20, Very hard 25, Nearly impossible 30
- Advantage: roll 2d20, take higher; Disadvantage: roll 2d20, take lower

Use these for travel, social, investigation, downtime, and other non-combat actions.`;
}

export function buildCombatRulesContext(): string {
  return `D&D 5E COMBAT REFERENCE:
- Attack Roll: d20 + attack bonus (STR/DEX mod + prof + weapon bonus)
- Damage: roll weapon/spell dice, add STR/DEX for weapon; apply resistances/vulnerabilities
- Saving Throw: d20 + ability mod (+ proficiency if proficient)
- Spell save DC: 8 + proficiency bonus + spellcasting ability mod
- Advantage/Disadvantage: roll 2d20, take higher/lower
- Typical weapon dice: light 1d4, shorts 1d6, martial 1d8, heavy 1d10-1d12, bows 1d6-1d8
Keep outputs concise and resolve rolls immediately.`;
}

export function buildDMPrompt(context: DMContext, playerAction: string): ChatMessage[] {
  const isInCombat = context.combatState?.isActive && context.combatState.turnOrder && context.combatState.turnOrder.length > 0;
  
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: isInCombat ? SYSTEM_PROMPTS.COMBAT_MODE : SYSTEM_PROMPTS.DUNGEON_MASTER,
    },
    {
      role: 'system',
      content: isInCombat ? buildCombatRulesContext() : buildExplorationRulesContext(),
    },
  ];

  // In combat mode, skip campaign lore to save tokens
  if (!isInCombat) {
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
  }

  // Add current party info
  const partyInfo = context.partyMembers
    .map((p) => `${p.name} (Level ${p.level} ${p.race} ${p.class})`)
    .join(', ');
  messages.push({
    role: 'system',
    content: `Current party: ${partyInfo}`,
  });

  // Add role-specific character summaries, gated by mode to save context
  const combatSummaries = (context.characterSummaries || [])
    .filter((c) => c.combatSummary && c.combatSummary.trim().length > 0)
    .map((c) => `${c.name}: ${c.combatSummary!.slice(0, 320)}${c.combatSummary!.length > 320 ? '…' : ''}`);
  const rpSummaries = (context.characterSummaries || [])
    .filter((c) => c.roleplaySummary && c.roleplaySummary.trim().length > 0)
    .map((c) => `${c.name}: ${c.roleplaySummary!.slice(0, 320)}${c.roleplaySummary!.length > 320 ? '…' : ''}`);

  if (isInCombat && combatSummaries.length > 0) {
    messages.push({
      role: 'system',
      content: `Combat summaries (use these instead of guessing stats; keep RP flavor minimal in combat): ${combatSummaries.join(' | ')}`,
    });
  } else if (!isInCombat && rpSummaries.length > 0) {
    messages.push({
      role: 'system',
      content: `Roleplay summaries (omit combat stats unless the player asks): ${rpSummaries.join(' | ')}`,
    });
  }

  // Add game time if available
  if (context.gameTime) {
    const timeStr = `Day ${context.gameTime.day}, ${String(context.gameTime.hour).padStart(2, '0')}:${String(context.gameTime.minute).padStart(2, '0')} (${context.gameTime.timeOfDay})`;
    messages.push({
      role: 'system',
      content: `Current game time: ${timeStr}`,
    });
  }

  if (context.companions && context.companions.length > 0) {
    const companionInfo = context.companions
      .map((c) => {
        const stats: string[] = [];
        if (c.hp !== undefined && c.maxHp !== undefined) stats.push(`HP ${c.hp}/${c.maxHp}`);
        if (c.ac !== undefined) stats.push(`AC ${c.ac}`);
        if (c.dexterity !== undefined) stats.push(`DEX ${c.dexterity}`);
        if (c.level !== undefined) stats.push(`Lvl ${c.level}`);
        const role = c.role ? `${c.role}` : 'companion';
        const summary = c.description ? ` - ${c.description.slice(0, 80)}${c.description.length > 80 ? '…' : ''}` : '';
        const statStr = stats.length > 0 ? ` [${stats.join(', ')}]` : '';
        const notes = c.notes ? ` (${c.notes.slice(0, 60)}${c.notes.length > 60 ? '…' : ''})` : '';
        const status = c.status && c.status !== 'active' ? ` {${c.status}}` : '';
        return `${c.name} (${role})${statStr}${status}${summary}${notes}`;
      })
      .join(', ');

    messages.push({
      role: 'system',
      content: `Traveling companions/allies: ${companionInfo}`,
    });
  }

  // Add location context (detailed in exploration, minimal in combat)
  if (context.currentLocation) {
    const locationDetails: string[] = [
      `Current location: ${context.currentLocation}`,
    ];
    
    if (!isInCombat && context.currentLocationType) {
      locationDetails.push(`Location type: ${context.currentLocationType}`);
    }
    
    if (!isInCombat && context.currentLocationDescription) {
      locationDetails.push(`Description: ${context.currentLocationDescription}`);
    }
    
    if (!isInCombat && context.npcAtCurrentLocation && context.npcAtCurrentLocation.length > 0) {
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
    
    if (!isInCombat && context.shopsAtCurrentLocation && context.shopsAtCurrentLocation.length > 0) {
      const shopsHere = context.shopsAtCurrentLocation
        .map((shop) => `${shop.name}${shop.type ? ` (${shop.type})` : ''}`)
        .join(', ');
      locationDetails.push(`Shops here: ${shopsHere}`);
    }
    
    if (!isInCombat && context.itemsAtCurrentLocation && context.itemsAtCurrentLocation.length > 0) {
      const itemsHere = context.itemsAtCurrentLocation
        .map((item) => `${item.name}${item.type ? ` (${item.type})` : ''}`)
        .join(', ');
      locationDetails.push(`Items available: ${itemsHere}`);
    }
    
    if (!isInCombat && context.nearbyLocations && context.nearbyLocations.length > 0) {
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


  // Add active NPCs (skip in combat unless they're combatants)
  if (!isInCombat && context.activeNPCs.length > 0) {
    const npcInfo = context.activeNPCs
      .map((npc) => `${npc.name}: ${npc.personality} (${npc.relationship})`)
      .join('\n');
    messages.push({
      role: 'system',
      content: `Active NPCs:\n${npcInfo}`,
    });
  }

  // Add recent events for context (skip in combat)
  if (!isInCombat && context.recentEvents.length > 0) {
    messages.push({
      role: 'system',
      content: `Recent events:\n${context.recentEvents.slice(-5).join('\n')}`,
    });
  }

  // Add quest objectives (skip in combat)
  if (!isInCombat && context.questObjectives.length > 0) {
    messages.push({
      role: 'system',
      content: `Active objectives:\n${context.questObjectives.join('\n')}`,
    });
  }

  // Add active quests with details (skip in combat)
  if (!isInCombat && context.activeQuests && context.activeQuests.length > 0) {
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

  // Add relevant world knowledge (skip in combat to save tokens)
  if (!isInCombat) {
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
  }

  // Add active character's inventory
  if (context.activeCharacter) {
    const inventoryList = Array.isArray(context.activeCharacter.inventory) && context.activeCharacter.inventory.length > 0
      ? context.activeCharacter.inventory.map((item: any) => {
          if (typeof item === 'string') return item;
          const qty = item.quantity && item.quantity !== 1 ? ` (x${item.quantity})` : '';
          return `${item.name ?? 'Unknown item'}${qty}`;
        }).join(', ')
      : 'empty';
    messages.push({
      role: 'system',
      content: `${context.activeCharacter.name}'s current inventory: ${inventoryList}\nGold: ${context.activeCharacter.gold} gp\n\nIMPORTANT: When the player asks about their inventory, list these exact items. Track changes accurately.`,
    });
  }

  // Add combat state if active
  if (context.combatState?.isActive && context.combatState.turnOrder && context.combatState.turnOrder.length > 0) {
    const currentTurnIndex = context.combatState.currentTurnIndex || 0;
    const currentCombatant = context.combatState.turnOrder[currentTurnIndex];
    
    const turnOrderStr = context.combatState.turnOrder
      .map((c, idx) => {
        const current = idx === currentTurnIndex ? ' ← CURRENT TURN' : '';
        const hpBar = `${c.hp}/${c.maxHp} HP`;
        return `${idx + 1}. ${c.name} (${c.type})${current} - ${hpBar}`;
      })
      .join('\n');

    messages.push({
      role: 'system',
      content: `⚔️ ACTIVE COMBAT - Round ${context.combatState.round}

Turn Order:
${turnOrderStr}

CRITICAL: It is ${currentCombatant.name}'s turn right now. Do not skip turns or give multiple consecutive turns to the same combatant.
When ${currentCombatant.name}'s action is complete, use the end_current_turn tool to advance to the next combatant.
Use get_turn_order tool to verify whose turn it is before any combat action.`,
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
