/**
 * LLM Tool Definitions and Handlers for Character Management
 * Allows the LLM to directly modify character state during narrative generation
 */

import { CampaignModel } from '../models/Campaign';
import { CharacterModel } from '../models/Character';
import { QuestModel } from '../models/Quest';
import { WorldEntityModel } from '../models/WorldEntity';
import { logger } from '../utils/logger';
import { suggestEnemies } from './enemySuggestions';

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
}

/**
 * Tool definitions for OpenAI/compatible function calling
 */
export const CHARACTER_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'add_items_to_inventory',
      description: 'Add one or more items to the character\'s inventory. Use this when the player picks up, receives, or purchases items.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of item names to add to inventory (e.g., ["Health Potion", "Silver Dagger"])',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_items_from_inventory',
      description: 'Remove one or more items from the character\'s inventory. Use this when items are used, sold, or lost.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of item names to remove from inventory',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character_gold',
      description: 'Add or subtract gold from the character. Use positive numbers to add gold, negative to subtract.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount of gold to add (positive) or subtract (negative)',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the transaction (e.g., "sold old armor", "received quest reward")',
          },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character_hp',
      description: 'Modify character\'s current HP. Use for damage, healing, or setting HP to a specific value.',
      parameters: {
        type: 'object',
        properties: {
          change: {
            type: 'number',
            description: 'HP change amount (negative for damage, positive for healing)',
          },
          set_value: {
            type: 'number',
            description: 'Set HP to exact value (optional, overrides change)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character_xp',
      description: 'Add experience points to the character. Use when the player completes quests, defeats enemies, or achieves milestones.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount of XP to add (always positive)',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the XP award (e.g., "defeated goblin", "completed quest")',
          },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll dice for ability checks, saving throws, or attack rolls. Use standard D&D notation.',
      parameters: {
        type: 'object',
        properties: {
          dice_expression: {
            type: 'string',
            description: 'Dice notation (e.g., "1d20", "2d6+3", "1d20+5")',
          },
          check_type: {
            type: 'string',
            description: 'Type of check (e.g., "Perception", "Attack Roll", "Saving Throw", "Damage")',
          },
          dc: {
            type: 'number',
            description: 'Difficulty Class for the check (optional)',
          },
        },
        required: ['dice_expression', 'check_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_quest',
      description: 'Add a new quest to track. Use when an NPC gives a quest or the party discovers a new objective.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Quest title (e.g., "Rescue the Missing Villagers")',
          },
          description: {
            type: 'string',
            description: 'Full quest description explaining what needs to be done',
          },
          giver: {
            type: 'string',
            description: 'NPC or source who gave the quest (optional)',
          },
          objectives: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of specific objectives to complete (optional)',
          },
          rewards: {
            type: 'string',
            description: 'Promised rewards for completing the quest (optional)',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_quest',
      description: 'Update quest status or add progress notes. Use when objectives are completed or quest status changes.',
      parameters: {
        type: 'object',
        properties: {
          quest_title: {
            type: 'string',
            description: 'Title of the quest to update (must match existing quest)',
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'failed', 'abandoned'],
            description: 'New quest status (optional)',
          },
          notes: {
            type: 'string',
            description: 'Progress notes or updates (optional)',
          },
        },
        required: ['quest_title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_companions',
        description: 'Add or update party companions/allies who travel with the player. Use when the party gains a follower, pet, or ally that persists across scenes.',
        parameters: {
          type: 'object',
          properties: {
            companions: {
              type: 'array',
              description: 'Companion records to upsert (matched by name, case-insensitive)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Companion name (unique key)' },
                  role: { type: 'string', description: 'Role/archetype (scout, healer, pet, hireling)' },
                  description: { type: 'string', description: 'Brief look/personality/combat style' },
                  hp: { type: 'number', description: 'Current HP if relevant' },
                  maxHp: { type: 'number', description: 'Max HP if relevant' },
                  ac: { type: 'number', description: 'Armor Class if relevant' },
                  dexterity: { type: 'number', description: 'Dex score or modifier for initiative ordering' },
                  level: { type: 'number', description: 'Approximate level or strength' },
                  status: { type: 'string', description: 'State: active, benched, resting, dead, etc.' },
                  notes: { type: 'string', description: 'Any extra notes (abilities, gear, limits)' },
                  id: { type: 'string', description: 'Stable ID if already known; omit to auto-generate' }
                },
                required: ['name']
              }
            }
          },
          required: ['companions']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'remove_companions',
        description: 'Remove companions who leave, die, or stay behind. Use when an ally is no longer traveling with the party.',
        parameters: {
          type: 'object',
          properties: {
            names: {
              type: 'array',
              items: { type: 'string' },
              description: 'Names of companions to remove (case-insensitive match)'
            }
          },
          required: ['names']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'start_combat',
      description: 'Start structured combat. Provide a list of enemies with basic stats. The player character will be included automatically.',
      parameters: {
        type: 'object',
        properties: {
          enemies: {
            type: 'array',
            description: 'List of enemies to engage',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                hp: { type: 'number' },
                maxHp: { type: 'number' },
                ac: { type: 'number' },
                dexterity: { type: 'number' },
                level: { type: 'number', description: 'Optional enemy level for display (not used in calculations)' },
                quantity: { type: 'number', description: 'Number of this enemy type (e.g., 4 for "Cultist x4"). Defaults to 1 if omitted.' },
              },
              required: ['name','hp','maxHp','ac','dexterity']
            }
          }
        },
        required: ['enemies']
      }
    }
  }
  ,
  {
    type: 'function',
    function: {
      name: 'lookup_enemy',
      description: 'Look up a D&D 5e monster/enemy from the SRD to retrieve AC, HP, and actions for accurate combat and descriptions.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Enemy name to search (e.g., "Goblin", "Bandit")' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_enemies',
      description: 'Get CR-appropriate enemy suggestions for the party. Use this to find suitable enemies before introducing combat encounters. Returns a list of enemies that match the party level and difficulty.',
      parameters: {
        type: 'object',
        properties: {
          partyLevel: { type: 'number', description: 'Average level of the party' },
          difficulty: { 
            type: 'string', 
            enum: ['easy', 'medium', 'hard', 'deadly'],
            description: 'Desired encounter difficulty'
          },
          environment: { type: 'string', description: 'Optional: terrain/location (forest, dungeon, urban, mountains, etc.)' },
          enemyType: { type: 'string', description: 'Optional: creature type filter (humanoid, beast, undead, dragon, etc.)' },
          maxResults: { type: 'number', description: 'Max suggestions to return (default 5)' }
        },
        required: ['partyLevel']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'upsert_world_entities',
      description: 'Create or update locations, NPCs, shops, and items in a consistent format to avoid duplicates. Use canonical names (lowercased, trimmed, without leading "the").',
      parameters: {
        type: 'object',
        properties: {
          locations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['name']
            },
            description: 'List of locations to upsert'
          },
          npcs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                description: { type: 'string' },
                personality: { type: 'string' },
                locationName: { type: 'string' },
                formerName: { type: 'string' }
              },
              required: ['name']
            },
            description: 'List of NPCs to upsert'
          },
          shops: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                locationName: { type: 'string' }
              },
              required: ['name']
            },
            description: 'List of shops to upsert'
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                locationName: { type: 'string' },
                shopName: { type: 'string' }
              },
              required: ['name']
            },
            description: 'List of items to upsert'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_turn_order',
      description: 'Get the current combat turn order and whose turn it is. Use this to understand the combat sequence before taking actions.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'end_current_turn',
      description: 'End the current combatant\'s turn and advance to the next combatant in turn order. Use this after the current combatant has taken their action.',
      parameters: {
        type: 'object',
        properties: {
          combatantId: {
            type: 'string',
            description: 'ID of the combatant whose turn is ending (must match the current turn)'
          }
        },
        required: ['combatantId']
      }
    }
  }
];

/**
 * Tool execution handler
 */
export class ToolExecutor {
  private campaignModel: CampaignModel;
  private characterModel: CharacterModel;
  private questModel: QuestModel;
  private worldModel: WorldEntityModel;

  constructor() {
    this.campaignModel = new CampaignModel();
    this.characterModel = new CharacterModel();
    this.questModel = new QuestModel();
    this.worldModel = new WorldEntityModel();
  }

  /**
   * Execute a tool call and return the result
   */
  async executeTool(
    toolCall: ToolCall,
    characterId: string,
    campaignId?: string
  ): Promise<ToolResult> {
    const { name, arguments: argsString } = toolCall.function;
    let args: any;

    try {
      args = JSON.parse(argsString);
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name,
        content: JSON.stringify({ error: 'Invalid tool arguments' }),
      };
    }

    try {
      let result: any;

      switch (name) {
        case 'add_items_to_inventory':
          result = await this.addItemsToInventory(characterId, args.items);
          break;

        case 'remove_items_from_inventory':
          result = await this.removeItemsFromInventory(characterId, args.items);
          break;

        case 'update_character_gold':
          result = await this.updateGold(characterId, args.amount, args.reason);
          break;

        case 'update_character_hp':
          result = await this.updateHP(characterId, args.change, args.set_value);
          break;

        case 'update_character_xp':
          result = await this.updateXP(characterId, args.amount, args.reason);
          break;

        case 'roll_dice':
          result = await this.rollDice(args.dice_expression, args.check_type, args.dc);
          break;

        case 'add_quest':
          result = await this.addQuest(campaignId!, args);
          break;

        case 'update_quest':
          result = await this.updateQuest(campaignId!, args);
          break;

        case 'advance_time':
          result = await this.advanceTime(campaignId!, args);
          break;

        case 'add_companions':
          result = await this.addCompanions(campaignId!, args.companions);
          break;

        case 'remove_companions':
          result = await this.removeCompanions(campaignId!, args.names);
          break;

        case 'start_combat':
          result = await this.startCombat(characterId, campaignId!, args.enemies);
          break;

        case 'lookup_enemy':
          result = await this.lookupEnemy(args.name);
          break;

        case 'suggest_enemies':
          result = await this.suggestEnemies(args);
          break;

        case 'upsert_world_entities':
          result = await this.upsertWorldEntities(campaignId!, args);
          break;

        case 'get_turn_order':
          result = await this.getTurnOrder(campaignId!);
          break;

        case 'end_current_turn':
          result = await this.endCurrentTurn(campaignId!, args.combatantId);
          break;

        default:
          result = { error: `Unknown tool: ${name}` };
      }

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name,
        content: JSON.stringify(result),
      };
    } catch (error) {
      logger.error(`Tool execution error: ${name}`, error);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name,
        content: JSON.stringify({ error: (error as Error).message }),
      };
    }
  }

  /**
   * Add items to character inventory
   * Items can be passed as simple strings (e.g., 'Longsword') or with quantities (e.g., 'Rations (3 days)')
   * Intelligently merges duplicate items by incrementing quantity
   */
  private async addItemsToInventory(
    characterId: string,
    items: string[]
  ): Promise<{ success: boolean; items_added: string[]; new_count: number }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    const inventory = Array.isArray(character.inventory) ? character.inventory : [];
    const updatedInventory = this.normalizeInventory(inventory);
    const itemsAdded: string[] = [];

    for (const itemStr of items) {
      const { name, quantity } = this.parseItemString(itemStr);
      const existingIndex = updatedInventory.findIndex((inv: any) => inv.name.toLowerCase() === name.toLowerCase());

      if (existingIndex !== -1) {
        // Item already exists, increment quantity
        updatedInventory[existingIndex].quantity = (updatedInventory[existingIndex].quantity || 1) + (quantity || 1);
      } else {
        // New item
        updatedInventory.push({ name, quantity: quantity || 1 });
      }
      itemsAdded.push(itemStr);
    }

    await this.characterModel.updateCharacter(characterId, {
      inventory: updatedInventory,
    });

    logger.info(`Added items to character ${characterId}: ${items.join(', ')}`);

    return {
      success: true,
      items_added: itemsAdded,
      new_count: updatedInventory.length,
    };
  }

  /**
   * Lookup enemy details via SRD (Open5e)
   */
  private async lookupEnemy(name: string): Promise<any> {
    const { lookupEnemyByName } = await import('./enemyLookup');
    const res = await lookupEnemyByName(name);
    if ((res as any).success === false) {
      return res;
    }
    return res;
  }

  /**
   * Suggest CR-appropriate enemies for the party
   */
  private async suggestEnemies(params: {
    partyLevel: number;
    difficulty?: 'easy' | 'medium' | 'hard' | 'deadly';
    environment?: string;
    enemyType?: string;
    maxResults?: number;
  }): Promise<any> {
    try {
      const suggestions = await suggestEnemies({
        partyLevel: params.partyLevel,
        difficulty: params.difficulty || 'medium',
        environment: params.environment,
        enemyType: params.enemyType,
        maxResults: params.maxResults || 5,
      });

      if (suggestions.length === 0) {
        return {
          success: false,
          message: 'No suitable enemies found for the specified criteria',
          suggestions: [],
        };
      }

      return {
        success: true,
        count: suggestions.length,
        suggestions: suggestions.map(s => ({
          name: s.name,
          cr: s.cr,
          type: s.type,
          size: s.size,
          ac: s.armor_class,
          hp: s.hit_points,
          environment: s.environment,
        })),
      };
    } catch (error) {
      logger.error('Enemy suggestion failed', error);
      return {
        success: false,
        message: 'Failed to retrieve enemy suggestions',
        suggestions: [],
      };
    }
  }

  /**
   * Upsert world entities in batch (locations, NPCs, shops, items)
   */
  private async upsertWorldEntities(
    campaignId: string,
    args: {
      locations?: Array<{ name: string; type?: string; description?: string }>;
      npcs?: Array<{ name: string; role?: string; description?: string; personality?: string; locationName?: string; formerName?: string }>;
      shops?: Array<{ name: string; type?: string; description?: string; locationName?: string }>;
      items?: Array<{ name: string; type?: string; description?: string; locationName?: string; shopName?: string }>;
    }
  ): Promise<any> {
    const results: any = { locations: [], npcs: [], shops: [], items: [] };

    if (args.locations && Array.isArray(args.locations)) {
      for (const loc of args.locations) {
        const l = await this.worldModel.upsertLocation(campaignId, loc.name, loc.type, loc.description);
        results.locations.push({ id: l.id, name: l.name, type: l.type });
      }
    }

    if (args.npcs && Array.isArray(args.npcs)) {
      for (const npc of args.npcs) {
        let locationId: string | undefined = undefined;
        if (npc.locationName) {
          const found = await this.worldModel.findLocationByName(campaignId, npc.locationName);
          if (found) locationId = found.id;
        }
        const n = await this.worldModel.upsertNPC(campaignId, npc.name, npc.role, npc.description, npc.personality, locationId, npc.formerName);
        results.npcs.push({ id: n.id, name: n.name, role: n.role, location_id: n.location_id });
      }
    }

    if (args.shops && Array.isArray(args.shops)) {
      for (const shop of args.shops) {
        let locationId: string | undefined = undefined;
        if (shop.locationName) {
          const found = await this.worldModel.findLocationByName(campaignId, shop.locationName, shop.type);
          if (found) locationId = found.id;
        }
        const s = await this.worldModel.upsertShop(campaignId, shop.name, shop.type, shop.description, locationId);
        results.shops.push({ id: s.id, name: s.name, type: s.type, location_id: s.location_id });
      }
    }

    if (args.items && Array.isArray(args.items)) {
      for (const item of args.items) {
        let locationId: string | undefined = undefined;
        if (item.locationName) {
          const found = await this.worldModel.findLocationByName(campaignId, item.locationName);
          if (found) locationId = found.id;
        }
        // Shop linking by name could be added later with a shop finder
        const i = await this.worldModel.upsertItem(campaignId, item.name, item.type, item.description, locationId, undefined);
        results.items.push({ id: i.id, name: i.name, type: i.type, location_id: i.location_id, shop_id: i.shop_id });
      }
    }

    return { success: true, ...results };
  }

  private async getCampaignSettings(campaignId: string): Promise<any> {
    const campaign = await this.campaignModel.findById(campaignId);
    return campaign?.settings || {};
  }

  /**
   * Advance in-game time
   */
  private async advanceTime(
    campaignId: string,
    args: { hours?: number; minutes?: number; description?: string }
  ): Promise<{ success: boolean; new_time: string; elapsed: string; time_of_day: string }> {
    const settings = await this.getCampaignSettings(campaignId);
    
    // Initialize game time if not set (default: Day 1, 8:00 AM)
    if (!settings.gameTime) {
      settings.gameTime = {
        day: 1,
        hour: 8,
        minute: 0,
      };
    }

    const currentTime = settings.gameTime;
    const hoursToAdd = (args.hours || 0) + (args.minutes || 0) / 60;
    
    // Calculate new time
    let totalMinutes = currentTime.hour * 60 + currentTime.minute + hoursToAdd * 60;
    let daysToAdd = Math.floor(totalMinutes / (24 * 60));
    totalMinutes = totalMinutes % (24 * 60);
    
    const newDay = currentTime.day + daysToAdd;
    const newHour = Math.floor(totalMinutes / 60);
    const newMinute = Math.floor(totalMinutes % 60);

    settings.gameTime = {
      day: newDay,
      hour: newHour,
      minute: newMinute,
    };

    // Track time log for reference
    if (!settings.timeLog) settings.timeLog = [];
    if (args.description) {
      settings.timeLog.push({
        timestamp: new Date().toISOString(),
        gameTime: `Day ${newDay}, ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`,
        elapsed: `${hoursToAdd.toFixed(1)}h`,
        description: args.description,
      });
      // Keep only last 20 entries
      if (settings.timeLog.length > 20) {
        settings.timeLog = settings.timeLog.slice(-20);
      }
    }

    await this.campaignModel.updateCampaign(campaignId, { settings });

    const timeOfDay = newHour < 6 ? 'night' : newHour < 12 ? 'morning' : newHour < 18 ? 'afternoon' : newHour < 22 ? 'evening' : 'night';
    
    logger.info(`Time advanced: Day ${newDay}, ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')} (${timeOfDay})`);

    return {
      success: true,
      new_time: `Day ${newDay}, ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`,
      elapsed: `${hoursToAdd.toFixed(1)} hours`,
      time_of_day: timeOfDay,
    };
  }

  private generateCompanionId(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ally';
    return `companion:${slug}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async addCompanions(
    campaignId: string,
    companions: Array<{ id?: string; name: string; role?: string; description?: string; hp?: number; maxHp?: number; ac?: number; dexterity?: number; notes?: string; status?: string; level?: number }>
  ): Promise<{ success: boolean; added: string[]; updated: string[]; total: number }> {
    const settings = await this.getCampaignSettings(campaignId);
    const existing = Array.isArray(settings.companions) ? [...settings.companions] : [];
    const added: string[] = [];
    const updated: string[] = [];

    for (const companion of companions || []) {
      if (!companion.name || companion.name.trim().length === 0) {
        continue;
      }

      const name = companion.name.trim();
      const idx = existing.findIndex((c: any) => c.name?.toLowerCase() === name.toLowerCase());
      const status = companion.status || (idx >= 0 ? existing[idx].status : undefined) || 'active';

      if (idx >= 0) {
        const id = existing[idx].id || companion.id || this.generateCompanionId(name);
        existing[idx] = { ...existing[idx], ...companion, name, id, status };
        updated.push(name);
      } else {
        const id = companion.id || this.generateCompanionId(name);
        existing.push({ id, name, status, ...companion });
        added.push(name);
      }
    }

    settings.companions = existing;
    await this.campaignModel.updateCampaign(campaignId, { settings });

    return { success: true, added, updated, total: existing.length };
  }

  private async removeCompanions(
    campaignId: string,
    names: string[]
  ): Promise<{ success: boolean; removed: string[]; not_found: string[]; total: number }> {
    const settings = await this.getCampaignSettings(campaignId);
    const existing = Array.isArray(settings.companions) ? [...settings.companions] : [];
    const removed: string[] = [];
    const notFound: string[] = [];

    const toRemove = (names || []).map((n) => n.toLowerCase());
    const remaining = existing.filter((c: any) => {
      if (c.name && toRemove.includes(c.name.toLowerCase())) {
        removed.push(c.name);
        return false;
      }
      return true;
    });

    for (const name of names) {
      if (!removed.find((r) => r.toLowerCase() === name.toLowerCase())) {
        notFound.push(name);
      }
    }

    settings.companions = remaining;
    await this.campaignModel.updateCampaign(campaignId, { settings });

    return { success: true, removed, not_found: notFound, total: remaining.length };
  }

  /**
   * Remove items from character inventory
   * Items can be passed as simple strings (e.g., 'Longsword') or with quantities (e.g., 'Rations (3 days)')
   * Intelligently decrements quantity instead of removing completely
   */
  private async removeItemsFromInventory(
    characterId: string,
    items: string[]
  ): Promise<{ success: boolean; items_removed: string[]; items_not_found: string[]; new_count: number }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    const inventory = Array.isArray(character.inventory) ? character.inventory : [];
    const updatedInventory = this.normalizeInventory(inventory);
    const itemsRemoved: string[] = [];
    const itemsNotFound: string[] = [];

    for (const itemStr of items) {
      const { name, quantity: requestedQty } = this.parseItemString(itemStr);
      const index = updatedInventory.findIndex((inv: any) => inv.name.toLowerCase() === name.toLowerCase());

      if (index !== -1) {
        const currentItem = updatedInventory[index];
        const currentQty = currentItem.quantity || 1;
        const qtyToRemove = requestedQty || 1;

        if (currentQty > qtyToRemove) {
          // Only decrement quantity
          currentItem.quantity = currentQty - qtyToRemove;
        } else {
          // Remove item entirely
          updatedInventory.splice(index, 1);
        }
        itemsRemoved.push(itemStr);
      } else {
        itemsNotFound.push(itemStr);
      }
    }

    await this.characterModel.updateCharacter(characterId, {
      inventory: updatedInventory,
    });

    logger.info(`Removed items from character ${characterId}: ${itemsRemoved.join(', ')}`);
    if (itemsNotFound.length > 0) {
      logger.warn(`Items not found in inventory: ${itemsNotFound.join(', ')}`);
    }

    return {
      success: true,
      items_removed: itemsRemoved,
      items_not_found: itemsNotFound,
      new_count: updatedInventory.length,
    };
  }

  /**
   * Update character gold
   */
  private async updateGold(
    characterId: string,
    amount: number,
    reason?: string
  ): Promise<{ success: boolean; old_amount: number; new_amount: number; change: number }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    const oldAmount = character.money || 0;
    const newAmount = Math.max(0, oldAmount + amount); // Don't allow negative gold

    await this.characterModel.updateCharacter(characterId, {
      money: newAmount,
    });

    logger.info(
      `Updated gold for character ${characterId}: ${oldAmount} -> ${newAmount} (${amount >= 0 ? '+' : ''}${amount})${reason ? ` - ${reason}` : ''}`
    );

    return {
      success: true,
      old_amount: oldAmount,
      new_amount: newAmount,
      change: amount,
    };
  }

  /**
   * Update character HP
   */
  private async updateHP(
    characterId: string,
    change?: number,
    setValue?: number
  ): Promise<{ success: boolean; old_hp: number; new_hp: number; max_hp: number }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    const oldHP = character.hp || 0;
    const maxHP = character.max_hp || 0;

    let newHP: number;
    if (setValue !== undefined) {
      newHP = Math.max(0, Math.min(maxHP, setValue));
    } else if (change !== undefined) {
      newHP = Math.max(0, Math.min(maxHP, oldHP + change));
    } else {
      throw new Error('Must provide either change or set_value');
    }

    await this.characterModel.updateCharacter(characterId, {
      hp: newHP,
    });

    logger.info(
      `Updated HP for character ${characterId}: ${oldHP} -> ${newHP} (max: ${maxHP})`
    );

    return {
      success: true,
      old_hp: oldHP,
      new_hp: newHP,
      max_hp: maxHP,
    };
  }

  /**
   * Update character XP
   */
  private async updateXP(
    characterId: string,
    amount: number,
    reason?: string
  ): Promise<{ success: boolean; old_xp: number; new_xp: number; gained: number; level_up?: boolean; new_level?: number }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    const oldXP = character.experience || 0;
    const newXP = oldXP + Math.max(0, amount); // XP can't be negative
    const oldLevel = character.level || 1;

    // Simple level calculation (every 1000 XP = 1 level)
    // You can replace this with proper D&D 5e XP thresholds
    const newLevel = Math.floor(newXP / 1000) + 1;
    const levelUp = newLevel > oldLevel;

    await this.characterModel.updateCharacter(characterId, {
      experience: newXP,
      level: newLevel,
    });

    logger.info(
      `Updated XP for character ${characterId}: ${oldXP} -> ${newXP} (+${amount})${reason ? ` - ${reason}` : ''}${levelUp ? ` LEVEL UP! ${oldLevel} -> ${newLevel}` : ''}`
    );

    return {
      success: true,
      old_xp: oldXP,
      new_xp: newXP,
      gained: amount,
      level_up: levelUp,
      new_level: levelUp ? newLevel : undefined,
    };
  }

  /**
   * Roll dice
   */
  private async rollDice(
    diceExpression: string,
    checkType: string,
    dc?: number
  ): Promise<{ success: boolean; expression: string; rolls: number[]; total: number; check_type: string; dc?: number; result?: 'success' | 'failure' }> {
    // Parse dice expression (e.g., "1d20+5", "2d6", "1d20")
    const match = diceExpression.match(/^(\d+)d(\d+)(?:([+\-])(\d+))?$/i);
    
    if (!match) {
      throw new Error(`Invalid dice expression: ${diceExpression}`);
    }

    const numDice = parseInt(match[1]);
    const diceSides = parseInt(match[2]);
    const modifier = match[3] && match[4] ? 
      (match[3] === '+' ? parseInt(match[4]) : -parseInt(match[4])) : 0;

    if (numDice > 100 || diceSides > 1000) {
      throw new Error('Dice parameters too large');
    }

    // Roll the dice
    const rolls: number[] = [];
    for (let i = 0; i < numDice; i++) {
      rolls.push(Math.floor(Math.random() * diceSides) + 1);
    }

    const rollSum = rolls.reduce((sum, roll) => sum + roll, 0);
    const total = rollSum + modifier;

    let result: 'success' | 'failure' | undefined;
    if (dc !== undefined) {
      result = total >= dc ? 'success' : 'failure';
    }

    logger.info(
      `Dice roll: ${checkType} - ${diceExpression} = ${total} (rolls: [${rolls.join(', ')}]${modifier !== 0 ? ` + modifier ${modifier}` : ''})${dc !== undefined ? ` vs DC ${dc}: ${result?.toUpperCase()}` : ''}`
    );

    return {
      success: true,
      expression: diceExpression,
      rolls,
      total,
      check_type: checkType,
      dc,
      result,
    };
  }

  /**
   * Add a new quest
   */
  private async addQuest(campaignId: string, args: {
    title: string;
    description?: string;
    giver?: string;
    objectives?: string[];
    rewards?: string;
  }): Promise<{ success: boolean; quest_id: string; title: string; message: string }> {
    const quest = await this.questModel.createQuest(
      campaignId,
      args.title,
      args.description,
      args.giver,
      undefined, // location - could be added later
      args.objectives,
      args.rewards
    );

    logger.info(`Quest added: ${args.title}`);

    return {
      success: true,
      quest_id: quest.id,
      title: quest.title,
      message: `Quest "${args.title}" added to journal`,
    };
  }

  /**
   * Update an existing quest
   */
  private async updateQuest(campaignId: string, args: {
    quest_title: string;
    status?: 'active' | 'completed' | 'failed' | 'abandoned';
    notes?: string;
  }): Promise<{ success: boolean; quest_title: string; status?: string; message: string }> {
    // Find quest by title
    const quests = await this.questModel.getQuestsByCampaign(campaignId);
    const quest = quests.find(q => q.title.toLowerCase() === args.quest_title.toLowerCase());

    if (!quest) {
      return {
        success: false,
        quest_title: args.quest_title,
        message: `Quest "${args.quest_title}" not found`,
      };
    }

    const updates: any = {};
    if (args.status) updates.status = args.status;
    if (args.notes) updates.notes = quest.notes ? `${quest.notes}\n${args.notes}` : args.notes;

    await this.questModel.updateQuest(quest.id, updates);

    logger.info(`Quest updated: ${args.quest_title}${args.status ? ` - status: ${args.status}` : ''}`);

    return {
      success: true,
      quest_title: quest.title,
      status: args.status,
      message: `Quest "${quest.title}" updated`,
    };
  }

  /**
   * Prepare combat start payload including the player character
   */
  private async startCombat(
    characterId: string,
    campaignId: string,
    enemies: Array<{ name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; quantity?: number }>
  ): Promise<{ success: boolean; message: string; players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; initiative: number }>; enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; quantity?: number; initiative: number }> }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) throw new Error('Character not found');

    if (!campaignId) {
      throw new Error('Campaign ID required to start combat');
    }

    // Roll initiative for player
    const dexMod = Math.floor(((character.ability_scores?.dexterity ?? 10) - 10) / 2);
    const playerInitiative = Math.floor(Math.random() * 20) + 1 + dexMod;

    const player = {
      id: character.id,
      name: character.name,
      hp: character.hp ?? 10,
      maxHp: character.max_hp ?? (character.hp ?? 10),
      ac: character.armor_class ?? 12,
      dexterity: character.ability_scores?.dexterity ?? 10,
      level: character.level ?? undefined,
      initiative: playerInitiative,
    };

    // Add active companions (status not inactive/benched) to player side
    const settings = await this.getCampaignSettings(campaignId);
    const companionsSetting = Array.isArray(settings.companions) ? settings.companions : [];
    let settingsUpdated = false;
    const companions = companionsSetting
      .filter((c: any) => (c.status || 'active').toLowerCase() === 'active')
      .map((c: any) => {
        const id = c.id || this.generateCompanionId(c.name || 'ally');
        if (!c.id) {
          c.id = id;
          settingsUpdated = true;
        }
        const dex = c.dexterity ?? 10;
        const dexMod = Math.floor((dex - 10) / 2);
        const initiative = Math.floor(Math.random() * 20) + 1 + dexMod;
        const hp = c.hp ?? c.maxHp ?? 10;
        const maxHp = c.maxHp ?? hp;
        return {
          id,
          name: c.name,
          hp,
          maxHp,
          ac: c.ac ?? 10,
          dexterity: dex,
          level: c.level,
          initiative,
        };
      });

    if (settingsUpdated) {
      await this.campaignModel.updateCampaign(campaignId, { settings });
    }

    const enemiesWithIds = enemies.map(e => {
      // Roll initiative for each enemy
      const enemyDexMod = Math.floor((e.dexterity - 10) / 2);
      const enemyInitiative = Math.floor(Math.random() * 20) + 1 + enemyDexMod;
      
      return {
        id: `enemy:${Math.random().toString(36).slice(2)}`,
        ...e,
        quantity: e.quantity ?? 1,
        initiative: enemyInitiative,
      };
    });

    return {
      success: true,
      message: `Combat started vs ${enemies.map(e => e.name).join(', ')}`,
      players: [player, ...companions],
      enemies: enemiesWithIds,
    };
  }

  /**
   * Parse an item string into name and quantity
   * Handles formats like:
   *   - 'Longsword' -> { name: 'Longsword', quantity: 1 }
   *   - 'Rations (3 days)' -> { name: 'Rations', quantity: 3 }
   *   - 'Arrows (20)' -> { name: 'Arrows', quantity: 20 }
   */
  private parseItemString(itemStr: string): { name: string; quantity?: number } {
    // Try to extract quantity from parentheses at the end
    const match = itemStr.match(/^(.+?)\s*\((\d+)\s*(?:days?|piece|pieces|qty)?\)$/i);
    if (match) {
      return {
        name: match[1].trim(),
        quantity: parseInt(match[2], 10),
      };
    }
    return { name: itemStr.trim(), quantity: 1 };
  }

  /**
   * Normalize inventory to ensure all items are objects with name and quantity
   * Converts legacy string format to new object format
   */
  private normalizeInventory(inventory: any[]): Array<{ name: string; quantity: number }> {
    return inventory.map((item) => {
      if (typeof item === 'string') {
        const { name, quantity } = this.parseItemString(item);
        return { name, quantity: quantity || 1 };
      }
      return {
        name: item.name || String(item),
        quantity: item.quantity || 1,
      };
    });
  }

  /**
   * Get the current combat turn order and whose turn it is
   */
  private async getTurnOrder(campaignId: string): Promise<any> {
    const pool = (await import('../utils/database')).getDatabase();
    
    // Get active session
    const sessionRes = await pool.query(
      'SELECT id FROM sessions WHERE campaign_id = $1 AND state = $2 LIMIT 1',
      [campaignId, 'active']
    );
    
    if (sessionRes.rows.length === 0) {
      return { error: 'No active combat session' };
    }
    
    const sessionId = sessionRes.rows[0].id;
    
    // Get combat state from Redis if available
    const redis = (await import('../utils/redis')).getRedis();
    const combatKey = `combat:${sessionId}`;
    
    let combatState: any = null;
    if (redis) {
      try {
        const cached = await redis.get(combatKey);
        if (cached) {
          combatState = JSON.parse(cached);
        }
      } catch (err) {
        logger.warn('Failed to get combat state from Redis', err);
      }
    }
    
    if (!combatState || !combatState.turnOrder) {
      return { error: 'No active combat' };
    }

    const currentTurnIndex = combatState.currentTurnIndex || 0;
    const turnOrder = combatState.turnOrder || [];
    const currentCombatant = turnOrder[currentTurnIndex];

    return {
      success: true,
      round: combatState.round || 1,
      current_turn_index: currentTurnIndex,
      current_turn: currentTurnIndex + 1,
      total_combatants: turnOrder.length,
      current_combatant: currentCombatant ? {
        id: currentCombatant.id,
        name: currentCombatant.name,
        type: currentCombatant.type, // 'player' or 'enemy'
        hp: currentCombatant.hp,
        max_hp: currentCombatant.maxHp
      } : null,
      turn_order: turnOrder.map((c: any, idx: number) => ({
        order: idx + 1,
        name: c.name,
        type: c.type,
        hp: c.hp,
        max_hp: c.maxHp,
        is_current: idx === currentTurnIndex
      }))
    };
  }

  /**
   * End the current combatant's turn and advance to the next
   */
  private async endCurrentTurn(campaignId: string, combatantId: string): Promise<any> {
    const pool = (await import('../utils/database')).getDatabase();
    
    // Get active session
    const sessionRes = await pool.query(
      'SELECT id FROM sessions WHERE campaign_id = $1 AND state = $2 LIMIT 1',
      [campaignId, 'active']
    );
    
    if (sessionRes.rows.length === 0) {
      return { error: 'No active combat session' };
    }
    
    const sessionId = sessionRes.rows[0].id;
    
    // Get combat state from Redis
    const redis = (await import('../utils/redis')).getRedis();
    const combatKey = `combat:${sessionId}`;
    
    if (!redis) {
      return { error: 'Combat system not available' };
    }

    try {
      const cached = await redis.get(combatKey);
      if (!cached) {
        return { error: 'No active combat' };
      }
      
      const combatState = JSON.parse(cached);
      const turnOrder = combatState.turnOrder || [];
      const currentTurnIndex = combatState.currentTurnIndex || 0;
      const currentCombatant = turnOrder[currentTurnIndex];

      // Verify the combatant ID matches
      if (currentCombatant.id !== combatantId) {
        return { 
          error: `It is ${currentCombatant.name}'s turn, not the specified combatant. Use get_turn_order to check whose turn it is.`,
          current_turn: currentCombatant.name
        };
      }

      // Advance to next turn
      const nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
      combatState.currentTurnIndex = nextTurnIndex;

      // If we wrapped around to turn 0, increment the round
      if (nextTurnIndex === 0) {
        combatState.round = (combatState.round || 1) + 1;
      }

      // Save updated combat state
      await redis.set(combatKey, JSON.stringify(combatState), 'EX', 3600);

      const nextCombatant = turnOrder[nextTurnIndex];

      return {
        success: true,
        message: `${currentCombatant.name}'s turn ended. Now ${nextCombatant.name}'s turn.`,
        round: combatState.round,
        current_combatant: {
          id: nextCombatant.id,
          name: nextCombatant.name,
          type: nextCombatant.type,
          hp: nextCombatant.hp,
          max_hp: nextCombatant.maxHp
        }
      };
    } catch (err) {
      logger.error('Failed to advance turn', err);
      return { error: 'Failed to advance turn' };
    }
  }
}
