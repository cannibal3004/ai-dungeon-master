import { Server, Socket } from 'socket.io';
import { AIDMService } from '../services/AIDMService';
import { Combatant, executeAttack, applyDamage, DamageType, initializeCombat, nextTurn, shouldEndCombat } from '../rules/Combat';
import { CharacterModel } from '../models/Character';
import { rollDice, makeSkillCheck, makeSavingThrow, rollInitiative } from '../rules/dice';
import { logger } from '../utils/logger';

let aiDMService: AIDMService;
const combats = new Map<string, { state: { round: number; currentTurnIndex: number; active: boolean; turnOrder: Combatant[] }; combatants: Map<string, Combatant> }>();
let characterModel: CharacterModel | null = null;

function getAIDMService(): AIDMService {
  if (!aiDMService) {
    aiDMService = new AIDMService();
  }
  return aiDMService;
}

function getCharacterModel(): CharacterModel {
  if (!characterModel) {
    characterModel = new CharacterModel();
  }
  return characterModel;
}

export function setupGameEvents(io: Server, socket: Socket) {
  const getUserId = () => (socket as any).userId as string | undefined;
  const ensureCampaignRoom = (campaignId: string) => {
    const room = `campaign:${campaignId}`;
    if (!socket.rooms.has(room)) {
      socket.join(room);
      (socket as any).campaignId = campaignId;
      logger.info(`Socket ${socket.id} joined ${room} on first action`);
    }
    return room;
  };

  const startCombatInternal = (campaignId: string, players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>, enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>) => {
    const room = ensureCampaignRoom(campaignId);
    const combatants: Combatant[] = [];
    for (const p of players) {
      combatants.push({ ...p, initiative: rollInitiative(p.dexterity), conditions: [], isPlayer: true });
    }
    for (const e of enemies) {
      combatants.push({ ...e, initiative: rollInitiative(e.dexterity), conditions: [], isPlayer: false });
    }
    const state = initializeCombat(combatants);
    const map = new Map<string, Combatant>(combatants.map(c => [c.id, c]));
    combats.set(campaignId, { state, combatants: map });
    io.to(room).emit('combat:state', {
      campaignId,
      round: state.round,
      currentTurnIndex: state.currentTurnIndex,
      turnOrder: state.turnOrder.map(c => ({ id: c.id, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac, initiative: c.initiative, isPlayer: c.isPlayer, level: c.level })),
    });
  };

  /**
   * Start structured combat
   */
  socket.on('combat:start', (data: {
    campaignId: string;
    players: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>;
    enemies: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number; dexterity: number }>;
  }) => {
    try {
      ensureCampaignRoom(data.campaignId);

      startCombatInternal(data.campaignId, data.players, data.enemies);
    } catch (error) {
      logger.error('Error starting combat:', error);
      socket.emit('game:error', { message: 'Failed to start combat' });
    }
  });

  /**
   * Advance to next turn
   */
  socket.on('combat:next-turn', (data: { campaignId: string }) => {
    try {
      const room = ensureCampaignRoom(data.campaignId);
      const combat = combats.get(data.campaignId);
      if (!combat) return;
      combat.state = nextTurn(combat.state);
      io.to(room).emit('combat:state', {
        campaignId: data.campaignId,
        round: combat.state.round,
        currentTurnIndex: combat.state.currentTurnIndex,
        turnOrder: combat.state.turnOrder.map(c => ({ id: c.id, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac, initiative: c.initiative, isPlayer: c.isPlayer })),
      });
    } catch (error) {
      logger.error('Error advancing turn:', error);
      socket.emit('game:error', { message: 'Failed to advance turn' });
    }
  });

  /**
   * Player sends an action/message to the DM
   */
  socket.on('game:action', async (data: { campaignId: string; action: string; characterId?: string }) => {
    try {
      const userId = getUserId();
      const room = ensureCampaignRoom(data.campaignId);

      logger.info(`Player action from ${userId} in campaign ${data.campaignId}: ${data.action}`);

      // Generate DM response
      const result = await getAIDMService().generateNarrative(
        data.campaignId,
        data.action,
        userId,
        data.characterId
      );

      logger.info('Generated narrative result:', {
        narrativeLength: result.narrative?.length || 0,
        narrativePreview: result.narrative?.substring(0, 100),
        hasInventoryChanges: !!result.inventoryChanges,
        inventoryChanges: result.inventoryChanges
      });

      // Broadcast to all players in the campaign
      const payload = {
        campaignId: data.campaignId,
        narrative: result.narrative,
        inventoryChanges: result.inventoryChanges,
        characterId: data.characterId,
        timestamp: new Date(),
        enemyInfo: (result as any).enemyInfo || [],
      };

      logger.info('Sending payload to frontend:', {
        narrativeLength: payload.narrative?.length || 0,
        campaignId: payload.campaignId
      });

      // Always send to the requester, and broadcast to the rest of the room
      socket.emit('game:narrative', payload);
      socket.to(room).emit('game:narrative', payload);

      // If characterId provided, emit a character:update payload so UI refreshes immediately
      if (data.characterId) {
        try {
          const character = await getCharacterModel().findById(data.characterId);
          if (character) {
            const updatePayload = {
              id: character.id,
              name: character.name,
              hp: character.hp,
              max_hp: character.max_hp,
              experience: character.experience,
              level: character.level,
              money: character.money,
              inventory: Array.isArray(character.inventory) ? character.inventory : [],
            };
            socket.emit('character:update', updatePayload);
            socket.to(room).emit('character:update', updatePayload);
          }
        } catch (err) {
          logger.warn('Failed to emit character:update', err);
        }
      }

      // If LLM requested combat start, initialize combat server-side
      if (result.combatStart) {
        startCombatInternal(data.campaignId, result.combatStart.players, result.combatStart.enemies);
      }
    } catch (error) {
      logger.error('Error handling game action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
      socket.emit('game:error', { message: errorMessage });
    }
  });

  /**
   * Player talks to an NPC
   */
  socket.on('game:npc-dialogue', async (data: { 
    campaignId: string; 
    npcId: string; 
    message: string;
    characterName: string;
  }) => {
    try {
      const userId = getUserId();
      const room = ensureCampaignRoom(data.campaignId);

      logger.info(`NPC dialogue from ${userId} to NPC ${data.npcId}`);

      // Generate NPC response
      const dialogue = await getAIDMService().generateNPCDialogue(
        data.campaignId,
        data.npcId,
        data.message,
        userId
      );

      // Broadcast to campaign
      const payload = {
        npcId: data.npcId,
        dialogue,
        inResponseTo: data.characterName,
        timestamp: new Date(),
      };

      socket.emit('game:npc-response', payload);
      socket.to(room).emit('game:npc-response', payload);
    } catch (error) {
      logger.error('Error handling NPC dialogue:', error);
      socket.emit('game:error', { message: 'Failed to generate NPC dialogue' });
    }
  });

  /**
   * Player rolls dice
   */
  socket.on('game:roll-dice', (data: {
    campaignId: string;
    characterName: string;
    dieSize: number;
    count: number;
    modifier?: number;
    reason?: string;
  }) => {
    try {
      const result = rollDice(data.dieSize, data.count);
      const total = result + (data.modifier || 0);

      // Broadcast roll result
      io.to(`campaign:${data.campaignId}`).emit('game:dice-result', {
        characterName: data.characterName,
        roll: result,
        modifier: data.modifier || 0,
        total,
        dice: `${data.count}d${data.dieSize}`,
        reason: data.reason,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error handling dice roll:', error);
      socket.emit('game:error', { message: 'Failed to roll dice' });
    }
  });

  /**
   * Player makes a skill check
   */
  socket.on('game:skill-check', (data: {
    campaignId: string;
    characterName: string;
    skill: string;
    abilityModifier: number;
    proficient: boolean;
    proficiencyBonus: number;
    advantage?: boolean;
    disadvantage?: boolean;
  }) => {
    try {
      const advType = data.advantage ? 'advantage' : data.disadvantage ? 'disadvantage' : undefined;
      const { roll, total } = makeSkillCheck(
        data.abilityModifier, // Note: This should be abilityScore, but maintaining compatibility
        data.proficient,
        data.proficiencyBonus,
        10, // Default DC
        advType
      );

      // Broadcast skill check result
      io.to(`campaign:${data.campaignId}`).emit('game:skill-check-result', {
        characterName: data.characterName,
        skill: data.skill,
        roll,
        total,
        advantage: data.advantage,
        disadvantage: data.disadvantage,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error handling skill check:', error);
      socket.emit('game:error', { message: 'Failed to make skill check' });
    }
  });

  /**
   * Player makes a saving throw
   */
  socket.on('game:saving-throw', (data: {
    campaignId: string;
    characterName: string;
    ability: string;
    abilityModifier: number;
    proficient: boolean;
    proficiencyBonus: number;
    dc: number;
    advantage?: boolean;
    disadvantage?: boolean;
  }) => {
    try {
      const advType = data.advantage ? 'advantage' : data.disadvantage ? 'disadvantage' : undefined;
      const { roll, total, success } = makeSavingThrow(
        data.abilityModifier, // Note: This should be abilityScore, but maintaining compatibility
        data.proficient,
        data.proficiencyBonus,
        data.dc,
        advType
      );

      // Broadcast saving throw result
      io.to(`campaign:${data.campaignId}`).emit('game:saving-throw-result', {
        characterName: data.characterName,
        ability: data.ability,
        roll,
        total,
        dc: data.dc,
        success,
        advantage: data.advantage,
        disadvantage: data.disadvantage,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error handling saving throw:', error);
      socket.emit('game:error', { message: 'Failed to make saving throw' });
    }
  });

  /**
   * Combat - player attacks
   */
  socket.on('combat:attack', (data: {
    campaignId: string;
    attackerId: string;
    attackerName: string;
    targetId: string;
    targetName: string;
    attackBonus: number;
    targetAC: number;
    damageDice: string;
    damageType: DamageType;
    advantage?: boolean;
    disadvantage?: boolean;
  }) => {
    try {
      // Enforce turn order if a structured combat is active
      const activeCombat = combats.get(data.campaignId);
      if (activeCombat && activeCombat.state.active) {
        const current = activeCombat.state.turnOrder[activeCombat.state.currentTurnIndex];
        if (!current || current.id !== data.attackerId) {
          io.to(`campaign:${data.campaignId}`).emit('combat:error', {
            message: 'Action out of turn',
            attackerId: data.attackerId,
            currentId: current?.id,
          });
          return;
        }
      }
      const result = executeAttack(
        { name: data.attackerName, attackBonus: data.attackBonus },
        { 
          id: data.targetId, 
          name: data.targetName, 
          ac: data.targetAC,
          hp: 0, // Not needed for attack roll
          maxHp: 0,
          initiative: 0,
          dexterity: 0,
          conditions: [],
          isPlayer: false,
        },
        data.damageDice,
        data.damageType,
        data.advantage,
        data.disadvantage
      );

      // Broadcast attack result
      io.to(`campaign:${data.campaignId}`).emit('combat:attack-result', {
        attackerId: data.attackerId,
        attackerName: data.attackerName,
        targetId: data.targetId,
        targetName: data.targetName,
        hit: result.hit,
        critical: result.critical,
        damage: result.damage,
        damageType: result.damageType,
        attackRoll: result.attackRoll,
        damageRoll: result.damageRoll,
        timestamp: new Date(),
      });

      // If using structured combat, auto-apply damage to target and emit HP update
      const combat = combats.get(data.campaignId);
      if (combat && result.hit) {
        const target = combat.combatants.get(data.targetId);
        if (target) {
          const applied = applyDamage(target, result.damage, result.damageType);
          target.hp = applied.newHp;

          io.to(`campaign:${data.campaignId}`).emit('combat:hp-updated', {
            combatantId: target.id,
            combatantName: target.name,
            newHp: target.hp,
            maxHp: target.maxHp,
            reason: `Damage ${result.damage} (${result.damageType})${applied.status ? ` - ${applied.status}` : ''}`,
          });

          // If the target is a player, persist HP to DB and emit character:update
          if (target.isPlayer) {
            (async () => {
              try {
                await characterModel.updateCharacter(target.id, { hp: target.hp });
                const character = await characterModel.findById(target.id);
                if (character) {
                  const updatePayload = {
                    id: character.id,
                    name: character.name,
                    hp: character.hp,
                    max_hp: character.max_hp,
                    experience: character.experience,
                    level: character.level,
                    money: character.money,
                    inventory: Array.isArray(character.inventory) ? character.inventory : [],
                  };
                  io.to(`campaign:${data.campaignId}`).emit('character:update', updatePayload);
                }
              } catch (err) {
                logger.warn('Failed to persist player HP after combat damage', err);
              }
            })();
          }

          // Check combat end condition
          const currentOrder = Array.from(combat.combatants.values());
          if (shouldEndCombat(currentOrder)) {
            combat.state.active = false;
            io.to(`campaign:${data.campaignId}`).emit('combat:end', { campaignId: data.campaignId });
          }
        }
      }
    } catch (error) {
      logger.error('Error handling combat attack:', error);
      socket.emit('game:error', { message: 'Failed to execute attack' });
    }
  });

  /**
   * Combat - update HP
   */
  socket.on('combat:update-hp', (data: {
    campaignId: string;
    combatantId: string;
    combatantName: string;
    newHp: number;
    maxHp: number;
    reason: string;
  }) => {
    try {
      // Broadcast HP update
      io.to(`campaign:${data.campaignId}`).emit('combat:hp-updated', {
        combatantId: data.combatantId,
        combatantName: data.combatantName,
        newHp: data.newHp,
        maxHp: data.maxHp,
        reason: data.reason,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error updating HP:', error);
      socket.emit('game:error', { message: 'Failed to update HP' });
    }
  });

  /**
   * Combat - next turn
   */
  socket.on('combat:next-turn', (data: {
    campaignId: string;
    currentCombatantId: string;
    currentCombatantName: string;
    round: number;
  }) => {
    try {
      // Broadcast turn change
      io.to(`campaign:${data.campaignId}`).emit('combat:turn-changed', {
        combatantId: data.currentCombatantId,
        combatantName: data.currentCombatantName,
        round: data.round,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error changing turn:', error);
      socket.emit('game:error', { message: 'Failed to change turn' });
    }
  });

  /**
   * Combat - start combat
   */
  socket.on('combat:start', (data: {
    campaignId: string;
    combatants: Array<{ id: string; name: string; initiative: number }>;
  }) => {
    try {
      // Broadcast combat start
      io.to(`campaign:${data.campaignId}`).emit('combat:started', {
        combatants: data.combatants,
        round: 1,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error starting combat:', error);
      socket.emit('game:error', { message: 'Failed to start combat' });
    }
  });

  /**
   * Combat - end combat
   */
  socket.on('combat:end', (data: {
    campaignId: string;
    summary: string;
  }) => {
    try {
      // Broadcast combat end
      io.to(`campaign:${data.campaignId}`).emit('combat:ended', {
        summary: data.summary,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error ending combat:', error);
      socket.emit('game:error', { message: 'Failed to end combat' });
    }
  });

  /**
   * Player typing indicator
   */
  socket.on('game:typing', (data: {
    campaignId: string;
    characterName: string;
    isTyping: boolean;
  }) => {
    socket.to(`campaign:${data.campaignId}`).emit('game:player-typing', {
      characterName: data.characterName,
      isTyping: data.isTyping,
    });
  });
}
