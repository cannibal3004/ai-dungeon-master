#!/usr/bin/env node
/**
 * Quick Test: Verify test data was created correctly
 * Run this after doing a reset with test data
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verify() {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const campaigns = await pool.query('SELECT COUNT(*) FROM campaigns');
    const characters = await pool.query('SELECT COUNT(*) FROM characters');
    const testUser = await pool.query(
      'SELECT username, email FROM users WHERE email = $1',
      ['test@example.com']
    );
    const testChar = await pool.query(
      'SELECT name, race, class, level FROM characters WHERE name = $1',
      ['Aragorn']
    );
    
    console.log('\n📊 Database Summary:');
    console.log(`   Total Users: ${users.rows[0].count}`);
    console.log(`   Total Campaigns: ${campaigns.rows[0].count}`);
    console.log(`   Total Characters: ${characters.rows[0].count}`);
    
    if (testUser.rows[0]) {
      const user = testUser.rows[0];
      console.log('\n✅ Test User Found:');
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: test123`);
    } else {
      console.log('\n❌ Test user not found');
    }
    
    if (testChar.rows[0]) {
      const char = testChar.rows[0];
      console.log('\n✅ Test Character Found:');
      console.log(`   Name: ${char.name}`);
      console.log(`   Race: ${char.race}`);
      console.log(`   Class: ${char.class}`);
      console.log(`   Level: ${char.level}`);
    } else {
      console.log('\n❌ Test character not found');
    }
    
    console.log('\n');
    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    await pool.end();
    process.exit(1);
  }
}

verify();
