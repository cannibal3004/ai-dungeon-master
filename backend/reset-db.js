#!/usr/bin/env node
/**
 * Database Reset Script
 * Drops all tables and re-runs migrations from scratch
 * Optional: Creates test user, campaign, and character
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createTestData() {
  console.log('\n🧪 Creating test data...\n');

  try {
    // Create test user
    const testPassword = await bcrypt.hash('test123', 10);
    const userId = uuidv4();
    
    await pool.query(
      'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
      [userId, 'testuser', 'test@example.com', testPassword]
    );
    console.log('✓ Test user created: test@example.com / test123');

    // Create test campaign
    const campaignId = uuidv4();
    await pool.query(
      'INSERT INTO campaigns (id, name, description, created_by) VALUES ($1, $2, $3, $4)',
      [campaignId, 'Shadows of the Elder Wyrms', 'In the kingdom of Eldoria, ancient chromatic dragons—beings of godlike power who shaped the world in primordial times—have begun to stir from their millennia-long slumber deep beneath the earth. Their awakening is fracturing reality itself: skies bleed unnatural colors, magic surges unpredictably, and forgotten draconic cults are rising to welcome their returning masters.', userId]
    );
    console.log('✓ Test campaign created: "Shadows of the Elder Wyrms"');

    // Create test character with proper stats and equipment
    const characterId = uuidv4();
    
    // Ranger starting equipment and stats
    const rangerAbilityScores = {
      strength: 14,      // +2 modifier
      dexterity: 16,     // +3 modifier (primary stat)
      constitution: 14,  // +2 modifier
      intelligence: 10,  // +0 modifier
      wisdom: 15,        // +2 modifier (secondary stat)
      charisma: 12       // +1 modifier
    };
    
    const rangerInventory = [
      { name: 'Longsword', quantity: 1 },
      { name: 'Longbow', quantity: 1 },
      { name: 'Arrows', quantity: 20 },
      { name: 'Leather Armor', quantity: 1 },
      { name: 'Explorer\'s Pack', quantity: 1 },
      { name: 'Bedroll', quantity: 1 },
      { name: 'Rope', quantity: 50 },
      { name: 'Torches', quantity: 5 },
      { name: 'Rations', quantity: 5 },
      { name: 'Waterskin', quantity: 1 },
      { name: 'Hunting Trap', quantity: 1 },
      { name: 'Healer\'s Kit', quantity: 1 }
    ];
    
    const rangerTraits = [
      'Favored Enemy: Orcs',
      'Natural Explorer: Forest',
      'Fighting Style: Archery (+2 to ranged attacks)',
      'Ranger Archetype: Hunter',
      'Hunter\'s Prey: Colossus Slayer'
    ];
    
    await pool.query(
      `INSERT INTO characters (
        id, campaign_id, player_id, name, race, class, 
        level, experience, hp, max_hp, armor_class, money,
        ability_scores, inventory, traits
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        characterId,
        campaignId,
        userId,
        'Aragorn',
        'Human',
        'Ranger',
        3,
        1500,
        28,
        28,
        15,
        150,
        JSON.stringify(rangerAbilityScores),
        JSON.stringify(rangerInventory),
        JSON.stringify(rangerTraits)
      ]
    );
    console.log('✓ Test character created: "Aragorn" (Human Ranger, Level 3)');
    console.log('  - Ability Scores: STR 14, DEX 16, CON 14, INT 10, WIS 15, CHA 12');
    console.log('  - Equipment: Longsword, Longbow, Leather Armor, Explorer\'s Pack, etc.');
    console.log('  - Traits: Favored Enemy (Orcs), Natural Explorer (Forest), Hunter Archetype');

    // Create test session
    const sessionId = uuidv4();
    const gameSessionId = uuidv4();
    
    await pool.query(
      'INSERT INTO sessions (id, campaign_id) VALUES ($1, $2)',
      [sessionId, campaignId]
    );
    
    await pool.query(
      `INSERT INTO game_sessions (id, campaign_id, dm_user_id, name, state)
       VALUES ($1, $2, $3, $4, $5)`,
      [gameSessionId, campaignId, userId, 'Test Session', 'active']
    );
    console.log('✓ Test session created');

    console.log('\n📝 Test Data Summary:');
    console.log('   Email: test@example.com');
    console.log('   Password: test123');
    console.log('   Campaign: Test Campaign');
    console.log('   Character: Aragorn (Human Ranger, Level 3)\n');

  } catch (error) {
    console.error('❌ Error creating test data:', error.message);
    throw error;
  }
}

async function resetDatabase(createTestData_flag) {
  console.log('🗑️  Dropping all tables...\n');
  
  try {
    // Drop all tables in order (respecting foreign keys)
    const dropCommands = [
      'DROP TABLE IF EXISTS character_skills CASCADE',
      'DROP TABLE IF EXISTS character_spell_slots CASCADE',
      'DROP TABLE IF EXISTS character_spells CASCADE',
      'DROP TABLE IF EXISTS world_items CASCADE',
      'DROP TABLE IF EXISTS world_shops CASCADE',
      'DROP TABLE IF EXISTS world_npcs CASCADE',
      'DROP TABLE IF EXISTS world_locations CASCADE',
      'DROP TABLE IF EXISTS chat_history CASCADE',
      'DROP TABLE IF EXISTS save_states CASCADE',
      'DROP TABLE IF EXISTS session_players CASCADE',
      'DROP TABLE IF EXISTS sessions CASCADE',
      'DROP TABLE IF EXISTS game_sessions CASCADE',
      'DROP TABLE IF EXISTS characters CASCADE',
      'DROP TABLE IF EXISTS campaigns CASCADE',
      'DROP TABLE IF EXISTS users CASCADE',
      'DROP TABLE IF EXISTS pgmigrations CASCADE', // Migration tracking table
    ];

    for (const command of dropCommands) {
      await pool.query(command);
      console.log(`✓ ${command}`);
    }

    console.log('\n✅ All tables dropped successfully\n');
    console.log('🔄 Running migrations...\n');

    // Read and execute migration SQL files directly
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`### MIGRATION ${file} (UP) ###`);
      await pool.query(sql);
      console.log(`✓ ${file}\n`);
    }

    console.log('✅ Database migrations complete!\n');
    console.log('📊 Fresh database ready with:');
    console.log('   - User authentication tables');
    console.log('   - Campaign & character management');
    console.log('   - Session & chat history');
    console.log('   - World entities (locations, NPCs, shops, items)');
    console.log('   - Character abilities (spells, spell slots, skills)');

    // Create test data if requested
    if (createTestData_flag) {
      await createTestData();
    }

  } catch (error) {
    console.error('\n❌ Error resetting database:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Confirmation prompt
const readline = require('readline');

async function promptUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('⚠️  WARNING: This will DELETE ALL DATA in the database!');
    console.log('   Database:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'), '\n');

    rl.question('Are you sure you want to reset the database? (yes/no): ', (answer) => {
      if (answer.toLowerCase() !== 'yes') {
        rl.close();
        console.log('\n❌ Database reset cancelled');
        process.exit(0);
      }

      rl.question('Create test user/campaign/character? (yes/no): ', (testDataAnswer) => {
        rl.close();
        const shouldCreateTestData = testDataAnswer.toLowerCase() === 'yes';
        resolve(shouldCreateTestData);
      });
    });
  });
}

promptUser().then((createTestData_flag) => {
  resetDatabase(createTestData_flag);
}).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
