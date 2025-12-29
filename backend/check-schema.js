#!/usr/bin/env node
require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'world_locations'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 world_locations table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    console.log(`\n✓ Total: ${result.rows.length} columns\n`);
    
    // Check if last_mentioned column exists
    const hasLastMentioned = result.rows.some(r => r.column_name === 'last_mentioned');
    if (hasLastMentioned) {
      console.log('✓ last_mentioned column exists!\n');
    } else {
      console.log('✗ last_mentioned column is MISSING!\n');
    }
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
