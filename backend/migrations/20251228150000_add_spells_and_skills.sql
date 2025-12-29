-- Create character_spells table
CREATE TABLE IF NOT EXISTS character_spells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    level INT DEFAULT 0, -- 0 for cantrips, 1-9 for spell levels
    school VARCHAR(100), -- evocation, abjuration, etc.
    casting_time VARCHAR(100), -- 1 action, bonus action, etc.
    range VARCHAR(100), -- 30 feet, self, etc.
    duration VARCHAR(100), -- instantaneous, concentration up to 1 hour, etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(character_id, name)
);

-- Create character_spell_slots table
CREATE TABLE IF NOT EXISTS character_spell_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    spell_level INT NOT NULL, -- 1-9 (0 for cantrips is unlimited)
    max_slots INT NOT NULL,
    remaining_slots INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, spell_level)
);

-- Create character_skills table
CREATE TABLE IF NOT EXISTS character_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    ability_modifier VARCHAR(3), -- STR, DEX, CON, INT, WIS, CHA
    proficiency_bonus INT DEFAULT 0,
    expertise BOOLEAN DEFAULT false, -- double proficiency
    bonus INT DEFAULT 0, -- additional bonuses from items, etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(character_id, name)
);

-- Create indexes
CREATE INDEX idx_character_spells_character_id ON character_spells(character_id);
CREATE INDEX idx_character_spell_slots_character_id ON character_spell_slots(character_id);
CREATE INDEX idx_character_skills_character_id ON character_skills(character_id);
