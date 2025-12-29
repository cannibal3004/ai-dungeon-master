-- Create quests table
CREATE TABLE IF NOT EXISTS quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    giver VARCHAR(255), -- NPC who gave the quest
    location VARCHAR(255), -- Where quest was received
    status VARCHAR(50) DEFAULT 'active', -- active, completed, failed, abandoned
    objectives JSONB DEFAULT '[]'::jsonb, -- Array of objective strings
    rewards TEXT,
    notes TEXT, -- DM or player notes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quests_campaign_status ON quests(campaign_id, status);
