#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const campaigns = await pool.query('SELECT COUNT(*) FROM campaigns');
    const characters = await pool.query('SELECT COUNT(*) FROM characters');
    const testUser = await pool.query('SELECT username, email FROM users WHERE email = $1', ['test@example.com']);
    const testChar = await pool.query('SELECT name, race, class FROM characters WHERE name = $1', ['Aragorn']);
    
    console.log('\n📊 Database Verification:');
    console.log('   Users:', users.rows[0].count);
    console.log('   Campaigns:', campaigns.rows[0].count);
    console.log('   Characters:', characters.rows[0].count);
    
    if (testUser.rows[0]) {
      console.log('\n✓ Test User Found:');
      console.log('   Username:', testUser.rows[0].username);
      console.log('   Email:', testUser.rows[0].email);
    } else {
      console.log('\n❌ Test user NOT found');
    }
    
    if (testChar.rows[0]) {
      console.log('\n✓ Test Character Found:');
      console.log('   Name:', testChar.rows[0].name);
      console.log('   Race:', testChar.rows[0].race);
      console.log('   Class:', testChar.rows[0].class);
    } else {
      console.log('\n❌ Test character NOT found');
    }
    
    await pool.end();
  } catch(e) {
    console.error('Error:', e.message);
    await pool.end();
    process.exit(1);
  }
})();
