import { Pool } from 'pg';
import { getDatabase } from '../utils/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface GameSession {
  id: string;
  campaign_id: string;
  name: string;
  current_turn: number;
  state: string;
  world_state: any;
  created_at: Date;
  updated_at: Date;
  last_activity: Date;
}

export interface SaveState {
  id: string;
  session_id: string;
  name: string;
  slot_number: number;
  turn_number: number;
  game_state: any;
  character_states: any;
  world_state: any;
  created_at: Date;
}

export interface AutoSave {
  id: string;
  session_id: string;
  turn_number: number;
  game_state: any;
  character_states: any;
  world_state: any;
  created_at: Date;
}

export class SessionService {
  private pool: Pool;
  // private readonly AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.pool = getDatabase();
  }

  /**
   * Start a new game session
   */
  async startSession(campaignId: string, dmUserId: string, _dmNotes?: string): Promise<GameSession> {
    // If there's already an active session for this campaign, reuse it so chat/history persist across devices
    const activeSession = await this.getActiveSession(campaignId);
    if (activeSession) {
      logger.info(`Reusing active session ${activeSession.id} for campaign ${campaignId}`);
      
      // Ensure the sessions record exists (foreign key for chat_history)
      await this.pool.query(
        'INSERT INTO sessions (id, campaign_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [activeSession.id, campaignId]
      );
      
      return activeSession;
    }

    const sessionNumber = await this.getNextSessionNumber(campaignId);
    const name = `Session ${sessionNumber}`;

    const query = `
      INSERT INTO game_sessions (campaign_id, dm_user_id, name, current_turn, state, world_state)
      VALUES ($1, $2, $3, 0, 'active', '{}'::jsonb)
      RETURNING *
    `;

    const result = await this.pool.query(query, [campaignId, dmUserId, name]);
    const session = result.rows[0];

    // Create corresponding sessions record for chat history tracking
    await this.pool.query(
      'INSERT INTO sessions (id, campaign_id) VALUES ($1, $2)',
      [session.id, campaignId]
    );

    // Autosave timers disabled for now (schema mismatch handled later)
    // this.startAutoSave(session.id);

    logger.info(`Started game session ${session.id} for campaign ${campaignId}`);
    return session;
  }

  /**
   * End a game session
   */
  async endSession(sessionId: string, _dmNotes?: string): Promise<GameSession> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    if (session.state === 'completed') {
      throw new AppError(400, 'Session already ended');
    }

    // Stop autosave timer (currently disabled)
    this.stopAutoSave(sessionId);

    const query = `
      UPDATE game_sessions
      SET state = 'completed', last_activity = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [sessionId]);
    logger.info(`Ended game session ${sessionId}`);
    return result.rows[0];
  }

  /**
   * Get active session for a campaign
   */
  async getActiveSession(campaignId: string): Promise<GameSession | null> {
    const query = `
      SELECT * FROM game_sessions
      WHERE campaign_id = $1 AND state = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [campaignId]);
    return result.rows[0] || null;
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<GameSession | null> {
    const query = 'SELECT * FROM game_sessions WHERE id = $1';
    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0] || null;
  }

  /**
   * Get all sessions for a campaign
   */
  async getCampaignSessions(campaignId: string): Promise<GameSession[]> {
    const query = `
      SELECT * FROM game_sessions
      WHERE campaign_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [campaignId]);
    return result.rows;
  }

  /**
   * Create a manual save state
   */
  async createSaveState(
    sessionId: string,
    saveName: string,
    stateData: any,
    turnNumber = 0,
    slotNumber?: number
  ): Promise<SaveState> {
    const slot = slotNumber ?? (await this.getNextSlotNumber(sessionId));

    const query = `
      INSERT INTO save_states (session_id, name, slot_number, turn_number, game_state, character_states, world_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      sessionId,
      saveName,
      slot,
      turnNumber,
      JSON.stringify(stateData),
      '[]',
      '{}',
    ]);

    logger.info(`Created save state "${saveName}" for session ${sessionId}`);
    return result.rows[0];
  }

  /**
   * Load a save state
   */
  async loadSaveState(saveId: string): Promise<SaveState> {
    const query = 'SELECT * FROM save_states WHERE id = $1';
    const result = await this.pool.query(query, [saveId]);

    if (result.rows.length === 0) {
      throw new AppError(404, 'Save state not found');
    }

    return result.rows[0];
  }

  /**
   * Get all save states for a campaign
   */
  async getCampaignSaveStates(campaignId: string): Promise<SaveState[]> {
    const query = `
      SELECT ss.* FROM save_states ss
      JOIN game_sessions gs ON gs.id = ss.session_id
      WHERE gs.campaign_id = $1
      ORDER BY ss.created_at DESC
    `;

    const result = await this.pool.query(query, [campaignId]);
    return result.rows;
  }

  /**
   * Get chat history for a session
   */
  async getSessionChatHistory(sessionId: string, limit: number = 100): Promise<any[]> {
    const query = `
      SELECT id, sender, player_id, character_id, content, message_type, metadata, created_at
      FROM chat_history
      WHERE session_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [sessionId, limit]);
    return result.rows;
  }

  /**
   * Delete a save state
   */
  async deleteSaveState(saveId: string): Promise<void> {
    const query = 'DELETE FROM save_states WHERE id = $1';
    const result = await this.pool.query(query, [saveId]);

    if (result.rowCount === 0) {
      throw new AppError(404, 'Save state not found');
    }

    logger.info(`Deleted save state ${saveId}`);
  }

  /**
   * Create an autosave
   */
  async createAutoSave(
    sessionId: string,
    stateData: any,
    turnNumber = 0
  ): Promise<AutoSave> {
    const query = `
      INSERT INTO autosaves (session_id, turn_number, game_state, character_states, world_state)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      sessionId,
      turnNumber,
      JSON.stringify(stateData),
      '[]',
      '{}',
    ]);

    await this.cleanupAutosaves(sessionId);

    return result.rows[0];
  }

  /**
   * Get latest autosave for a session
   */
  async getLatestAutoSave(sessionId: string): Promise<AutoSave | null> {
    const query = `
      SELECT * FROM autosaves
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0] || null;
  }

  /**
   * Get all autosaves for a session
   */
  async getSessionAutosaves(sessionId: string, limit = 10): Promise<AutoSave[]> {
    const query = `
      SELECT * FROM autosaves
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [sessionId, limit]);
    return result.rows;
  }

  /**
   * Start autosave timer for a session
   */
  // @ts-ignore - Method intentionally unused (autosave disabled)
  private _startAutoSave(sessionId: string): void {
    // Autosave disabled in this implementation (schema mismatch handled later)
    this.stopAutoSave(sessionId);
  }

  /**
   * Stop autosave timer for a session
   */
  private stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
      logger.info(`Stopped autosave for session ${sessionId}`);
    }
  }

  /**
   * Clean up old autosaves, keeping only the most recent ones
   */
  private async cleanupAutosaves(sessionId: string, keepCount = 10): Promise<void> {
    const query = `
      DELETE FROM autosaves
      WHERE session_id = $1
      AND id NOT IN (
        SELECT id FROM autosaves
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      )
    `;

    await this.pool.query(query, [sessionId, keepCount]);
  }

  /**
   * Get next session number for a campaign
   */
  private async getNextSessionNumber(campaignId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) + 1 as next_number
      FROM game_sessions
      WHERE campaign_id = $1
    `;

    const result = await this.pool.query(query, [campaignId]);
    return parseInt(result.rows[0].next_number, 10);
  }

  private async getNextSlotNumber(sessionId: string): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(slot_number), -1) + 1 as next_slot
      FROM save_states
      WHERE session_id = $1
    `;

    const result = await this.pool.query(query, [sessionId]);
    return parseInt(result.rows[0].next_slot, 10);
  }

  /**
   * Cleanup - stop all autosave timers (call on server shutdown)
   */
  cleanup(): void {
    for (const [sessionId, timer] of this.autoSaveTimers.entries()) {
      clearInterval(timer);
      logger.info(`Stopped autosave for session ${sessionId} during cleanup`);
    }
    this.autoSaveTimers.clear();
  }
}
