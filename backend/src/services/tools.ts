/**
 * LLM Tool Definitions and Handlers for Character Management
 * Allows the LLM to directly modify character state during narrative generation
 */

import { CharacterModel } from '../models/Character';
import { QuestModel } from '../models/Quest';
import { WorldEntityModel } from '../models/WorldEntity';
import { logger } from '../utils/logger';

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
  }
];

/**
 * Tool execution handler
 */
export class ToolExecutor {
  private characterModel: CharacterModel;
  private questModel: QuestModel;
  private worldModel: WorldEntityModel;

  constructor() {
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

        case 'start_combat':
          result = await this.startCombat(characterId, args.enemies);
          break;

        case 'lookup_enemy':
          result = await this.lookupEnemy(args.name);
          break;

        case 'upsert_world_entities':
          result = await this.upsertWorldEntities(campaignId!, args);
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
    enemies: Array<{ name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; quantity?: number }>
  ): Promise<{ success: boolean; message: string; players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; initiative: number }>; enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number; level?: number; quantity?: number; initiative: number }> }> {
    const character = await this.characterModel.findById(characterId);
    if (!character) throw new Error('Character not found');

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
      players: [player],
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
}
