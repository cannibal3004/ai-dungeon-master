import { getLLMManager, LLMManager } from '../llm/manager';
import type { ProviderType } from '../llm/types';
import { initializeRedis, getRedis } from '../utils/redis';
import { logger } from '../utils/logger';
import type Redis from 'ioredis';
import crypto from 'crypto';
import { Pool } from 'pg';
import { getDatabase } from '../utils/database';
import {
  DMContext,
  ChatMessage,
  EncounterRequest,
  GeneratedEncounter,
  buildDMPrompt,
  buildNPCPrompt,
  buildEncounterPrompt,
  buildLocationPrompt,
  buildSummaryPrompt,
} from './prompts';
import { AppError } from '../middleware/errorHandler';
import { WorldEntityModel } from '../models/WorldEntity';
import { QuestModel } from '../models/Quest';
import { CHARACTER_TOOLS, ToolExecutor } from './tools';
import { TTSService, getTTSService } from './TTSService';
import { AudioFXService } from './AudioFXService';

export interface NPCState {
  id: string;
  name: string;
  personality: string;
  background: string;
  currentMood: string;
  relationship: string;
}

export class AIDMService {
  private llmManager: LLMManager;
  private pool: Pool;
  private worldEntityModel: WorldEntityModel;
  private questModel: QuestModel;
  private redis: Redis | null = null;
  private toolExecutor: ToolExecutor;
  ttsService: TTSService;
  audioFxService: AudioFXService;
  // Context/tokens limits can be added here if needed

  constructor() {
    this.llmManager = getLLMManager();
    this.pool = getDatabase();
    this.worldEntityModel = new WorldEntityModel();
    this.questModel = new QuestModel();
    this.toolExecutor = new ToolExecutor();
    this.ttsService = getTTSService();
    this.audioFxService = new AudioFXService();
    // Initialize redis if available
    (async () => {
      try {
        this.redis = await initializeRedis();
      } catch {
        this.redis = null;
      }
    })();
  }

  private getTaskConfig(task: 'narrative' | 'npc' | 'encounter' | 'location' | 'summary' | 'extract'):
    { model?: string; provider?: ProviderType } {
    const modelMap: Record<string, string | undefined> = {
      extract: process.env.EXTRACT_MODEL || process.env.FAST_MODEL || 'gpt-3.5-turbo',
      narrative: process.env.NARRATIVE_MODEL || process.env.DEFAULT_MODEL,
      npc: process.env.NPC_MODEL || process.env.NARRATIVE_MODEL || process.env.DEFAULT_MODEL,
      encounter: process.env.ENCOUNTER_MODEL || process.env.DEFAULT_MODEL,
      location: process.env.LOCATION_MODEL || process.env.DEFAULT_MODEL,
      summary: process.env.SUMMARY_MODEL || process.env.FAST_MODEL || process.env.DEFAULT_MODEL,
    };

    const providerEnvMap: Record<string, string | undefined> = {
      extract: process.env.EXTRACT_PROVIDER,
      narrative: process.env.NARRATIVE_PROVIDER,
      npc: process.env.NPC_PROVIDER,
      encounter: process.env.ENCOUNTER_PROVIDER,
      location: process.env.LOCATION_PROVIDER,
      summary: process.env.SUMMARY_PROVIDER,
    };

    const provider = providerEnvMap[task] as ProviderType | undefined;
    const model = modelMap[task];
    return { model, provider };
  }

  private serializeMessages(messages: ChatMessage[]): { promptText: string; systemPrompt?: string } {
    const systemParts: string[] = [];
    const conversationParts: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else if (msg.role === 'user') {
        conversationParts.push(`${msg.name ? msg.name + ': ' : 'User: '}${msg.content}`);
      } else if (msg.role === 'assistant') {
        conversationParts.push(`${msg.name ? msg.name + ': ' : 'Assistant: '}${msg.content}`);
      }
    }

    const systemPrompt = systemParts.length ? systemParts.join('\n\n') : undefined;
    const promptText = conversationParts.join('\n');
    return { promptText, systemPrompt };
  }

  /**
   * Generate DM response to player action
   */
  async generateNarrative(
    campaignId: string,
    playerAction: string,
    userId?: string,
    characterId?: string
  ): Promise<{ narrative: string; inventoryChanges: { itemsAdded: string[]; itemsRemoved: string[]; goldChange: number }; combatStart?: { players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>; enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }> }; enemyInfo?: any[]; audioUrl?: string; ambienceUrl?: string }>
  {
    // Build context from database
    const context = await this.buildContext(campaignId, characterId);

    // Build prompt with context
    const messages = buildDMPrompt(context, playerAction);
    const { promptText, systemPrompt } = this.serializeMessages(messages);

    console.log('\n\n========== NARRATIVE GENERATION ==========');
    console.log('SYSTEM_PROMPT:');
    console.log(systemPrompt);
    console.log('\nUSER_PROMPT:');
    console.log(promptText);
    console.log('==========================================\n');

    // Generate response with tool calling enabled (if character ID provided)
    const narrativeCfg = this.getTaskConfig('narrative');
    const response = await this.llmManager.generateCompletion(
      promptText,
      {
        maxTokens: 4000, // Increased for gpt-5 models which need more output tokens
        temperature: 0.8, // More creative
        systemPrompt,
        model: narrativeCfg.model,
        tools: characterId ? CHARACTER_TOOLS : undefined, // Only enable tools if we have a character
        tool_choice: characterId ? 'auto' : undefined,
      },
      narrativeCfg.provider
    );

    console.log('\n========== LLM RESPONSE ==========');
    console.log('CONTENT:');
    console.log(response.content);
    console.log('\nTOOL_CALLS:', response.tool_calls ? JSON.stringify(response.tool_calls, null, 2) : 'none');
    console.log('==================================\n');

    // Handle tool calls if present
    let toolResults: string[] = [];
    let combatStartPayload: { players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>; enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }> } | undefined;
    const enemyInfoCollected: any[] = [];
    let finalNarrative = response.content;
    
    if (response.tool_calls && response.tool_calls.length > 0 && characterId) {
      logger.info(`LLM_TOOL_EXECUTION: ${response.tool_calls.length} tool calls to execute`);
      
      const toolMessages: any[] = [];
      
      for (const toolCall of response.tool_calls) {
        logger.info(`  Executing: ${toolCall.function.name} with args:`, toolCall.function.arguments);
        const result = await this.toolExecutor.executeTool(toolCall, characterId, campaignId);
        const parsedResult = JSON.parse(result.content);
        logger.info(`  Result:`, parsedResult);
        
        // Add tool result to messages for second LLM call
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: result.content
        });
        
        // Format tool results for display
        if (result.name === 'add_items_to_inventory' && parsedResult.success) {
          toolResults.push(`✓ Added to inventory: ${parsedResult.items_added.join(', ')}`);
        } else if (result.name === 'remove_items_from_inventory' && parsedResult.success) {
          toolResults.push(`✓ Removed from inventory: ${parsedResult.items_removed.join(', ')}`);
        } else if (result.name === 'update_character_gold' && parsedResult.success) {
          const change = parsedResult.change;
          toolResults.push(`✓ Gold ${change >= 0 ? '+' : ''}${change} gp (now ${parsedResult.new_amount} gp)`);
        } else if (result.name === 'update_character_hp' && parsedResult.success) {
          const hpChange = parsedResult.new_hp - parsedResult.old_hp;
          toolResults.push(`✓ HP ${hpChange >= 0 ? '+' : ''}${hpChange} (now ${parsedResult.new_hp}/${parsedResult.max_hp})`);
        } else if (result.name === 'update_character_xp' && parsedResult.success) {
          let xpMsg = `✓ XP +${parsedResult.gained} (now ${parsedResult.new_xp} XP)`;
          if (parsedResult.level_up) {
            xpMsg += ` 🎉 LEVEL UP! Now level ${parsedResult.new_level}!`;
          }
          toolResults.push(xpMsg);
        } else if (result.name === 'roll_dice' && parsedResult.success) {
          const rollDetail = `[${parsedResult.rolls.join(' + ')}]`;
          let rollMsg = `🎲 ${parsedResult.check_type}: ${parsedResult.expression} = ${parsedResult.total} ${rollDetail}`;
          if (parsedResult.dc !== undefined) {
            rollMsg += ` vs DC ${parsedResult.dc}: **${parsedResult.result?.toUpperCase()}**`;
          }
          toolResults.push(rollMsg);
        } else if (result.name === 'add_quest' && parsedResult.success) {
          toolResults.push(`📜 Quest Added: "${parsedResult.title}"`);
        } else if (result.name === 'update_quest' && parsedResult.success) {
          const statusMsg = parsedResult.status ? ` - Status: ${parsedResult.status}` : '';
          toolResults.push(`📜 Quest Updated: "${parsedResult.quest_title}"${statusMsg}`);
        } else if (result.name === 'start_combat' && parsedResult.success) {
          toolResults.push(`⚔️ ${parsedResult.message}`);
          combatStartPayload = {
            players: parsedResult.players,
            enemies: parsedResult.enemies,
          };
        } else if (result.name === 'lookup_enemy' && parsedResult.success) {
          const basic = `📚 Enemy Info: ${parsedResult.name} — AC ${parsedResult.armor_class}, HP ${parsedResult.hit_points}${parsedResult.hit_dice ? ` (${parsedResult.hit_dice})` : ''}${parsedResult.challenge_rating ? `, CR ${parsedResult.challenge_rating}` : ''}`;
          let actionsSummary = '';
          if (Array.isArray(parsedResult.actions) && parsedResult.actions.length > 0) {
            const first = parsedResult.actions[0];
            actionsSummary = `; Action: ${first.name} — ${first.desc.replace(/\s+/g, ' ').slice(0, 120)}${first.desc && first.desc.length > 120 ? '…' : ''}`;
          }
          toolResults.push(basic + actionsSummary);
          enemyInfoCollected.push(parsedResult);
        }
      }
      
      // Make a second LLM call with tool results to reconcile stats and present clean narration
      if (toolMessages.length > 0) {
        logger.info('Making second LLM call with tool results to generate narrative');

        // Build continuation prompt with tool results and the draft (if any)
        const reconciliationPrompt = `${promptText}

The following tools were executed; use THEIR RESULTS as the source of truth for mechanics (HP/AC/items/gold/XP/enemy stats/turn order). Rewrite the DM response concisely in-world (no bullet lists), and keep it TTS-friendly (avoid markdown lists/headings unless necessary). If combat started, state enemy stats from the tool results, not guesses.
Tool results: ${toolResults.join('; ')}

Draft (may be inconsistent, fix it): ${response.content || '[no draft provided]'}`;

        const secondResponse = await this.llmManager.generateCompletion(
          reconciliationPrompt,
          {
            maxTokens: 4000, // Increased for gpt-5 models which need more output tokens
            temperature: 0.8,
            systemPrompt,
            model: narrativeCfg.model,
            // Don't allow tool calls in the second response
            tools: undefined,
            tool_choice: undefined,
          },
          narrativeCfg.provider
        );

        finalNarrative = secondResponse.content;
        logger.info('Second LLM call generated narrative', { contentLength: finalNarrative.length });
      }
    }

    // Store in chat history
    await this.storeChatMessage(campaignId, 'user', playerAction, userId);

    // Update context with this event
    await this.addRecentEvent(campaignId, `Player: ${playerAction}\nDM: ${finalNarrative}`);

    // Extract inventory changes and entities in parallel (fallback for models without tool support)
    // Inventory changes are needed immediately; entity extraction can run in the background
    const inventoryChanges = await (response.tool_calls
      ? this.convertToolCallsToInventoryChanges(toolResults)
      : this.extractInventoryChanges(finalNarrative));

    // Fire-and-forget entity extraction so it doesn't block TTS or UI updates
    this.extractAndStoreEntities(campaignId, finalNarrative).catch(err => {
      logger.warn('Entity extraction failed (non-blocking)', err);
    });

    logger.info('=== NARRATIVE SUMMARY ===');
    logger.info('FINAL_NARRATIVE', { narrative: finalNarrative });
    logger.info('INVENTORY_CHANGES', inventoryChanges);
    logger.info('COMBAT_START', { combatStart: combatStartPayload ? 'yes' : 'no' });
    logger.info('ENEMY_INFO_COUNT', { count: enemyInfoCollected.length });

    await this.storeChatMessage(campaignId, 'assistant', finalNarrative, undefined, { audioUrl: undefined });

    return {
      narrative: finalNarrative,
      inventoryChanges,
      combatStart: combatStartPayload,
      enemyInfo: enemyInfoCollected,
      audioUrl: undefined,
      ambienceUrl: undefined,
    };
  }

  /**
   * Convert tool execution results to inventory changes format
   */
  private convertToolCallsToInventoryChanges(_toolResults: string[]): Promise<{ itemsAdded: string[]; itemsRemoved: string[]; goldChange: number }> {
    // Tool results already applied to database, just return empty changes
    // The actual changes are already persisted by the tool executor
    return Promise.resolve({
      itemsAdded: [],
      itemsRemoved: [],
      goldChange: 0
    });
  }

  /**
   * Generate NPC dialogue
   */
  async generateNPCDialogue(
    campaignId: string,
    npcId: string,
    playerMessage: string,
    userId?: string
  ): Promise<string> {
    // Get NPC details
    const npc = await this.getNPCState(npcId);
    if (!npc) {
      throw new AppError(404, 'NPC not found');
    }

    // Get recent conversation history
    const history = await this.getChatHistoryByCampaign(campaignId, 10);

    // Build NPC prompt
    const messages = buildNPCPrompt(
      npc.name,
      npc.personality,
      npc.background,
      history,
      playerMessage
    );

    // Generate response
    const { promptText, systemPrompt } = this.serializeMessages(messages);
    const npcCfg = this.getTaskConfig('npc');
    const response = await this.llmManager.generateCompletion(
      promptText,
      {
        maxTokens: 4000,
        temperature: 0.9, // Very creative for personality
        systemPrompt,
        model: npcCfg.model,
      },
      npcCfg.provider
    );

    // Store in chat history with NPC name
    await this.storeChatMessage(campaignId, 'user', playerMessage, userId, { speakerName: npc.name });
    await this.storeChatMessage(campaignId, 'assistant', response.content, undefined, { speakerName: npc.name });

    return response.content;
  }

  /**
   * Generate combat encounter
   */
  async generateEncounter(request: EncounterRequest): Promise<GeneratedEncounter> {
    const prompt = buildEncounterPrompt(request);

    const encounterCfg = this.getTaskConfig('encounter');
    const response = await this.llmManager.generateCompletion(
      prompt,
      {
        maxTokens: 4000,
        temperature: 0.7,
        model: encounterCfg.model,
      },
      encounterCfg.provider
    );

    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      const content = response.content;
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      throw new AppError(500, 'Failed to parse encounter data from AI response');
    }
  }

  /**
   * Generate location description
   */
  async generateLocationDescription(
    locationType: string,
    atmosphere: string,
    details?: string
  ): Promise<string> {
    const prompt = buildLocationPrompt(locationType, atmosphere, details);

    const locationCfg = this.getTaskConfig('location');
    const response = await this.llmManager.generateCompletion(
      prompt,
      {
        maxTokens: 4000,
        temperature: 0.8,
        model: locationCfg.model,
      },
      locationCfg.provider
    );
    return response.content;
  }

  /**
   * Generate session summary for context compression
   */
  async generateSessionSummary(campaignId: string): Promise<string> {
    // Get recent events
    const events = await this.getRecentEvents(campaignId, 50);

    if (events.length === 0) {
      return '';
    }

    const prompt = buildSummaryPrompt(events);

    const summaryCfg = this.getTaskConfig('summary');
    const response = await this.llmManager.generateCompletion(
      prompt,
      {
        maxTokens: 4000,
        temperature: 0.5, // More factual
        model: summaryCfg.model,
      },
      summaryCfg.provider
    );
    const summary = response.content;

    // Update campaign with summary
    await this.pool.query(
      `UPDATE campaigns SET settings = 
        COALESCE(settings, '{}'::jsonb) || jsonb_build_object('lastSummary', $1, 'summaryDate', NOW())
       WHERE id = $2`,
      [summary, campaignId]
    );

    return summary;
  }

  /**
   * Build context from campaign data
   */
  private async buildContext(campaignId: string, characterId?: string): Promise<DMContext> {
    // Get campaign details with summary
    const campaignResult = await this.pool.query(
      'SELECT name, description, settings FROM campaigns WHERE id = $1',
      [campaignId]
    );

    const settings = campaignResult.rows[0]?.settings || {};
    const campaignName: string | undefined = campaignResult.rows[0]?.name;
    const campaignDescription: string | undefined = campaignResult.rows[0]?.description;

    // Get active character's inventory if characterId provided
    let activeCharacterInventory: string[] = [];
    let activeCharacterMoney: number = 0;
    let activeCharacterName: string | undefined;
    
    if (characterId) {
      const charResult = await this.pool.query(
        `SELECT name, inventory, money FROM characters WHERE id = $1`,
        [characterId]
      );
      if (charResult.rows[0]) {
        activeCharacterName = charResult.rows[0].name;
        const inv = charResult.rows[0].inventory;
        activeCharacterInventory = Array.isArray(inv) ? inv : (typeof inv === 'string' ? JSON.parse(inv) : []);
        activeCharacterMoney = charResult.rows[0].money || 0;
      }
    }

    // Get party members
    const partyResult = await this.pool.query(
      `SELECT id, name, race, class, level
       FROM characters
       WHERE campaign_id = $1
       ORDER BY name ASC`,
      [campaignId]
    );

    // Get known world entities
    const locations = await this.worldEntityModel.getLocations(campaignId);
    const npcs = await this.worldEntityModel.getNPCs(campaignId);
    const shops = await this.worldEntityModel.getShops(campaignId);
    const items = await this.worldEntityModel.getItems(campaignId);

    // Get active NPCs (placeholder - you'd need NPC tracking)
    const activeNPCs: any[] = [];

    // Get recent events
    const recentEvents = await this.getRecentEvents(campaignId, 10);

    // Get active quests
    const activeQuests = await this.questModel.getQuestsByCampaign(campaignId, 'active');

    // Build location-specific context
    const currentLocation = settings.currentLocation;
    let currentLocationData: any = null;
    let npcAtCurrentLocation: any[] = [];
    let shopsAtCurrentLocation: any[] = [];
    let itemsAtCurrentLocation: any[] = [];
    let nearbyLocations: any[] = [];

    if (currentLocation) {
      // Find current location details
      currentLocationData = locations.find(l => l.name === currentLocation);

      // Get NPCs at current location
      if (currentLocationData) {
        npcAtCurrentLocation = npcs.filter(n => n.location_id === currentLocationData.id);
        shopsAtCurrentLocation = shops.filter(s => s.location_id === currentLocationData.id);
        itemsAtCurrentLocation = items.filter(i => i.location_id === currentLocationData.id);

        // Get nearby locations (all other locations as potential destinations)
        nearbyLocations = locations
          .filter(l => l.id !== currentLocationData.id)
          .map(l => ({
            name: l.name,
            type: l.type || 'unknown',
            description: l.description,
            travelTime: 'variable' // Could be enhanced with actual travel time
          }));
      }
    }

    const companions = Array.isArray(settings.companions) ? settings.companions : [];
    const characterSummaries = Array.isArray(settings.characterSummaries) ? settings.characterSummaries : [];
    
    // Extract game time if available
    let gameTime: DMContext['gameTime'] = undefined;
    if (settings.gameTime) {
      const hour = settings.gameTime.hour ?? 8;
      const timeOfDay = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : hour < 22 ? 'evening' : 'night';
      gameTime = {
        day: settings.gameTime.day ?? 1,
        hour,
        minute: settings.gameTime.minute ?? 0,
        timeOfDay,
      };
    }

    return {
      campaignId,
      campaignName,
      campaignDescription,
      gameTime,
      currentLocation,
      currentLocationDescription: currentLocationData?.description,
      currentLocationType: currentLocationData?.type,
      npcAtCurrentLocation: npcAtCurrentLocation.map(n => ({
        id: n.id,
        name: n.name,
        role: n.role,
        personality: n.personality,
        relationship: n.metadata?.relationship || 'neutral',
        description: n.description,
      })),
      shopsAtCurrentLocation: shopsAtCurrentLocation.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
      })),
      itemsAtCurrentLocation: itemsAtCurrentLocation.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        description: i.description,
      })),
      nearbyLocations,
      activeNPCs,
      partyMembers: partyResult.rows,
      recentEvents,
      questObjectives: settings.questObjectives || [],
      activeQuests: activeQuests.map(q => ({
        title: q.title,
        description: q.description,
        giver: q.giver,
        objectives: q.objectives,
        rewards: q.rewards,
      })),
      companions,
      characterSummaries,
      sessionSummary: settings.lastSummary,
      knownLocations: locations.map(l => ({ name: l.name, type: l.type || '' })),
      knownNPCs: npcs.map(n => {
        const location = locations.find(l => l.id === n.location_id);
        return {
          name: n.name,
          role: n.role || '',
          location: location?.name || 'unknown'
        };
      }),
      knownShops: shops.map(s => {
        const location = locations.find(l => l.id === s.location_id);
        return {
          name: s.name,
          type: s.type || '',
          location: location?.name || 'unknown'
        };
      }),
      knownItems: items.map(i => {
        const location = locations.find(l => l.id === i.location_id);
        return {
          name: i.name,
          type: i.type || '',
          location: location?.name || 'unknown'
        };
      }),
      activeCharacter: activeCharacterName ? {
        name: activeCharacterName,
        inventory: activeCharacterInventory,
        gold: activeCharacterMoney
      } : undefined,
      combatState: await this.getCombatState(campaignId),
    };
  }

  /**
   * Get current combat state if active
   */
  private async getCombatState(campaignId: string): Promise<DMContext['combatState'] | undefined> {
    try {
      // Get the latest active session (sessions table doesn't have a state column)
      const sessionRes = await this.pool.query(
        'SELECT id FROM sessions WHERE campaign_id = $1 ORDER BY started_at DESC LIMIT 1',
        [campaignId]
      );
      
      if (sessionRes.rows.length === 0) {
        return undefined;
      }
      
      const sessionId = sessionRes.rows[0].id;
      const combatKey = `combat:${sessionId}`;
      
      // Try to get from Redis
      if (!this.redis) {
        return undefined;
      }

      const cached = await this.redis.get(combatKey);
      if (!cached) {
        return undefined;
      }

      const combatData = JSON.parse(cached);
      const battlefield = combatData.battlefield;
      
      return {
        isActive: true,
        round: combatData.round || 1,
        currentTurnIndex: combatData.currentTurnIndex || 0,
        turnOrder: (combatData.turnOrder || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type as 'player' | 'enemy',
          hp: c.hp,
          maxHp: c.maxHp,
          initiative: c.initiative || 0,
        })),
        battlefield: battlefield
          ? {
              zones: Array.isArray(battlefield.zones) ? battlefield.zones : [],
              positions: battlefield.positions || {},
              engagements: Array.isArray(battlefield.engagements) ? battlefield.engagements : [],
            }
          : undefined,
      };
    } catch (err) {
      logger.warn('Failed to get combat state', err);
      return undefined;
    }
  }

  /**
   * Store chat message in database
   */
  private async storeChatMessage(
    campaignId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId?: string,
    metadata?: { speakerName?: string; audioUrl?: string }
  ): Promise<void> {
    const sessionId = await this.getActiveSessionId(campaignId);
    if (!sessionId) {
      return; // No active session; skip chat logging
    }

    // Ensure the sessions record exists (foreign key requirement for chat_history)
    // This handles cases where the sessions record wasn't created in startSession
    try {
      await this.pool.query(
        `INSERT INTO sessions (id, campaign_id) VALUES ($1, $2) 
         ON CONFLICT (id) DO NOTHING`,
        [sessionId, campaignId]
      );
    } catch (err) {
      // Log but don't fail if sessions insert has issues
      logger.warn('Failed to ensure sessions record exists:', err);
    }

    const sender = role === 'assistant' ? 'dm' : role === 'user' ? 'player' : 'system';
    await this.pool.query(
      `INSERT INTO chat_history (session_id, sender, player_id, character_id, content, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionId,
        sender,
        userId || null,
        null,
        content,
        'narrative',
        metadata ? JSON.stringify(metadata) : '{}'
      ]
    );
  }

  /**
   * Update the audioUrl in a chat message's metadata
   */
  async updateChatMessageAudioUrl(
    campaignId: string,
    content: string,
    audioUrl: string
  ): Promise<void> {
    const sessionId = await this.getActiveSessionId(campaignId);
    if (!sessionId) {
      logger.warn('Cannot update audio URL: no active session');
      return;
    }

    try {
      const result = await this.pool.query(
        `UPDATE chat_history
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{audioUrl}',
           $1::jsonb
         )
         WHERE session_id = $2 
         AND content = $3 
         AND sender = 'dm'
         ORDER BY timestamp DESC
         LIMIT 1`,
        [JSON.stringify(audioUrl), sessionId, content]
      );
      
      if (result.rowCount && result.rowCount > 0) {
        logger.info('Updated chat message with audio URL', { 
          sessionId, 
          audioUrl,
          contentPreview: content.substring(0, 50)
        });
      } else {
        logger.warn('No chat message found to update with audio URL', {
          sessionId,
          contentPreview: content.substring(0, 50)
        });
      }
    } catch (err) {
      logger.error('Failed to update chat message audio URL:', err);
    }
  }

  /**
   * Get recent chat history
   */
  private async getChatHistoryByCampaign(campaignId: string, limit: number): Promise<ChatMessage[]> {
    const sessionId = await this.getActiveSessionId(campaignId);
    if (!sessionId) return [];

    const result = await this.pool.query(
      `SELECT sender, content, metadata
       FROM chat_history
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [sessionId, limit]
    );

    return result.rows.reverse().map((row) => ({
      role: row.sender === 'dm' ? 'assistant' : row.sender === 'player' ? 'user' : 'system',
      content: row.content,
      name: row.metadata?.speakerName || undefined,
      audioUrl: row.metadata?.audioUrl || undefined,
    }));
  }

  private async getActiveSessionId(campaignId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT id FROM game_sessions
       WHERE campaign_id = $1 AND state = 'active'
       ORDER BY last_activity DESC
       LIMIT 1`,
      [campaignId]
    );
    return result.rows[0]?.id || null;
  }

  /**
   * Public method to get the active session ID for a campaign (used by WebSocket)
   */
  async getSessionId(campaignId: string): Promise<string | null> {
    return this.getActiveSessionId(campaignId);
  }

  /**
   * Add event to recent events tracking
   */
  private async addRecentEvent(campaignId: string, event: string): Promise<void> {
    await this.pool.query(
      `UPDATE campaigns
       SET settings = COALESCE(settings, '{}'::jsonb) || 
         jsonb_build_object('recentEvents', 
           COALESCE(settings->'recentEvents', '[]'::jsonb) || jsonb_build_array(to_jsonb($1::text))
         )
       WHERE id = $2`,
      [event, campaignId]
    );
  }

  /**
   * Get recent events from campaign settings
   */
  private async getRecentEvents(campaignId: string, limit: number): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT settings->'recentEvents' as events FROM campaigns WHERE id = $1`,
      [campaignId]
    );

    const events = result.rows[0]?.events || [];
    return Array.isArray(events) ? events.slice(-limit) : [];
  }

  /**
   * Get NPC state
   */
  private async getNPCState(npcId: string): Promise<NPCState | null> {
    const result = await this.pool.query(
      `SELECT id, name, personality, background, current_mood, relationship_status
       FROM npcs WHERE id = $1`,
      [npcId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const npc = result.rows[0];
    return {
      id: npc.id,
      name: npc.name,
      personality: npc.personality,
      background: npc.background,
      currentMood: npc.current_mood,
      relationship: npc.relationship_status,
    };
  }

  /**
   * Extract inventory changes from narrative
   */
  private async extractInventoryChanges(narrative: string): Promise<{
    itemsAdded: string[];
    itemsRemoved: string[];
    goldChange: number;
  }> {
    try {
      // Cache by narrative hash to avoid repeated extraction calls
      const hash = crypto.createHash('sha1').update(narrative).digest('hex');
      const cacheKey = `inv:${hash}`;
      if (this.redis) {
        const cached = await getRedis().get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const extractionPrompt = `Analyze this D&D narrative and extract any inventory changes.
Return ONLY valid JSON with this exact structure:
{
  "itemsAdded": ["item name"],
  "itemsRemoved": ["item name"],
  "goldChange": 0
}

Rules:
- itemsAdded: Items the player received, found, obtained, equipped, or was given
- itemsRemoved: Items the player lost, sold, used up, or gave away
- goldChange: Positive number for gold gained, negative for gold spent/lost
- Use exact item names from the narrative
- Return empty arrays if no changes

Narrative: ${narrative}`;

      console.log('\n\n========== INVENTORY EXTRACTION ==========');
      console.log('PROMPT:');
      console.log(extractionPrompt);
      console.log('==========================================\n');

      const extractCfg = this.getTaskConfig('extract');
      const response = await this.llmManager.generateCompletion(
        extractionPrompt,
        {
          maxTokens: 4000, // Increased for JSON responses with reasoning models
          temperature: 0.1, // Lower temp = less reasoning, faster
          model: extractCfg.model,
        },
        extractCfg.provider
      );

      console.log('\n========== INVENTORY EXTRACTION RESPONSE ==========');
      console.log('RAW_RESPONSE:');
      console.log(response.content);
      console.log('===================================================\n');

      // Parse JSON response
      const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.content;
      console.log('PARSED_JSON:');
      console.log(jsonStr);
      const changes = JSON.parse(jsonStr.trim());
      console.log('FINAL_RESULT:', JSON.stringify(changes, null, 2));

      const result = {
        itemsAdded: changes.itemsAdded || [],
        itemsRemoved: changes.itemsRemoved || [],
        goldChange: changes.goldChange || 0,
      };

      // Store in cache for a short TTL (10 minutes)
      if (this.redis) {
        await getRedis().set(cacheKey, JSON.stringify(result), 'EX', 600);
      }
      return result;
    } catch (error) {
      console.warn('Inventory extraction failed:', error);
      return { itemsAdded: [], itemsRemoved: [], goldChange: 0 };
    }
  }

  /**
   * Extract entities from narrative and store them
   */
  private async extractAndStoreEntities(campaignId: string, narrative: string): Promise<void> {
    try {
      // Cache by narrative hash to avoid repeated extraction calls
      const hash = crypto.createHash('sha1').update(narrative).digest('hex');
      const cacheKey = `ent:${hash}`;
      let entities: any | null = null;
      if (this.redis) {
        const cached = await getRedis().get(cacheKey);
        if (cached) {
          entities = JSON.parse(cached);
        }
      }

      if (!entities) {
      // Fetch existing entities to help LLM match rather than duplicate
      const existingLocations = await this.worldEntityModel.getLocations(campaignId);
      const existingNPCs = await this.worldEntityModel.getNPCs(campaignId);
      const existingShops = await this.worldEntityModel.getShops(campaignId);
      const existingItems = await this.worldEntityModel.getItems(campaignId);

      const existingContext = {
        locations: existingLocations.map(l => l.name),
        npcs: existingNPCs.map(n => n.name),
        shops: existingShops.map(s => s.name),
        items: existingItems.map(i => i.name)
      };

      const extractionPrompt = `Extract any locations, NPCs, shops, or notable items mentioned in the following narrative. Include brief descriptions where available.

EXISTING ENTITIES (already known in this campaign):
Locations: ${existingContext.locations.length > 0 ? existingContext.locations.join(', ') : 'none yet'}
NPCs: ${existingContext.npcs.length > 0 ? existingContext.npcs.join(', ') : 'none yet'}
Shops: ${existingContext.shops.length > 0 ? existingContext.shops.join(', ') : 'none yet'}
Items: ${existingContext.items.length > 0 ? existingContext.items.join(', ') : 'none yet'}

MATCHING RULES:
- If an entity in the narrative refers to an existing entity (even with different wording), use the EXISTING name and set "formerName" if it was called something else
- Example: If "Elder" already exists and narrative says "the old village leader", extract as name: "Elder", formerName: "old village leader"
- Only create NEW entities if they are clearly different from existing ones
- Remove leading articles (the, a, an) from all names

NAME REVEALS & INTRODUCTIONS: CRITICAL - Catch these patterns:
- "I am known as [NAME]" → Extract as proper NPC with that name
- "My name is [NAME]" → Extract as proper NPC with that name
- "[Character] introduces [himself/herself/themselves] as [NAME]" → Extract as proper NPC
- "Call me [NAME]" → Extract as proper NPC
- If a previously generic reference ("hooded stranger", "the figure") gets a real name, the real name becomes the primary name
- Set formerName to the generic descriptor only if it was previously mentioned as a separate entity

EXAMPLE: "a hooded stranger" → later reveals "I am Kael" 
Result: {"name": "Kael", "role": "seeker", "description": "A weathered figure seeking truths", "formerName": "hooded stranger"}

Return ONLY valid JSON with this exact structure (empty arrays if nothing found):
{
  "locations": [{"name": "string", "type": "town|city|dungeon|landmark", "description": "brief description if mentioned", "formerName": "optional - if this matches an existing entity with different wording"}],
  "npcs": [{"name": "string", "role": "string", "description": "brief character description if mentioned", "formerName": "optional - previous name/descriptor or existing entity name"}],
  "shops": [{"name": "string", "type": "blacksmith|tavern|general store", "description": "brief description if mentioned", "formerName": "optional - if this matches existing entity"}],
  "items": [{"name": "string", "type": "weapon|armor|potion|quest item", "description": "brief description if mentioned", "formerName": "optional - if this matches existing entity"}]
}

Narrative: ${narrative}`;
        console.log('\n\n========== ENTITY EXTRACTION ==========');
        console.log('PROMPT:');
        console.log(extractionPrompt);
        console.log('========================================\n');

        const extractCfg = this.getTaskConfig('extract');
        const response = await this.llmManager.generateCompletion(
          extractionPrompt,
          {
            maxTokens: 4000, // Increased for JSON responses with reasoning models
            temperature: 0.1, // Lower temp = less reasoning, faster
            model: extractCfg.model,
          },
          extractCfg.provider
        );

        console.log('\n========== ENTITY EXTRACTION RESPONSE ==========');
        console.log('RAW_RESPONSE:');
        console.log(response.content);
        console.log('===============================================\n');

        // Parse JSON response
        const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.content;
        console.log('PARSED_JSON:');
        console.log(jsonStr);
        entities = JSON.parse(jsonStr.trim());
        console.log('FINAL_RESULT:', JSON.stringify(entities, null, 2));

        // Cache entities for a short TTL (10 minutes)
        if (this.redis) {
          await getRedis().set(cacheKey, JSON.stringify(entities), 'EX', 600);
        }
      }

      // Helper function to normalize entity names (remove articles)
      const normalizeEntityName = (name: string): string => {
        return name.replace(/^(the|a|an)\s+/i, '').trim();
      };

      // Store locations
      for (const loc of entities.locations || []) {
        const normalizedName = normalizeEntityName(loc.name);
        await this.worldEntityModel.upsertLocation(
          campaignId, 
          normalizedName, 
          loc.type || null, 
          loc.description || null
        );
      }

      // Store NPCs
      for (const npc of entities.npcs || []) {
        const normalizedName = normalizeEntityName(npc.name);
        const normalizedFormerName = npc.formerName ? normalizeEntityName(npc.formerName) : undefined;
        await this.worldEntityModel.upsertNPC(
          campaignId, 
          normalizedName, 
          npc.role || null, 
          npc.description || null, 
          undefined, 
          undefined, 
          normalizedFormerName
        );
      }

      // Store shops
      for (const shop of entities.shops || []) {
        const normalizedName = normalizeEntityName(shop.name);
        await this.worldEntityModel.upsertShop(
          campaignId, 
          normalizedName, 
          shop.type || null, 
          shop.description || null
        );
      }

      // Store items
      for (const item of entities.items || []) {
        const normalizedName = normalizeEntityName(item.name);
        await this.worldEntityModel.upsertItem(
          campaignId, 
          normalizedName, 
          item.type || null, 
          item.description || null
        );
      }
    } catch (error) {
      // Don't fail narrative generation if entity extraction fails
      console.warn('Entity extraction failed:', error);
    }
  }
}
