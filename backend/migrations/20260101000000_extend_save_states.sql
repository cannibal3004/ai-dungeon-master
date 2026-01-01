-- Add missing columns to save_states table
ALTER TABLE save_states
ADD COLUMN IF NOT EXISTS slot_number INTEGER,
ADD COLUMN IF NOT EXISTS turn_number INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS game_state JSONB,
ADD COLUMN IF NOT EXISTS character_states JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS world_state JSONB DEFAULT '{}'::jsonb;

-- Create index on session_id and slot_number for efficient queries
CREATE INDEX IF NOT EXISTS idx_save_states_session_slot ON save_states(session_id, slot_number);
