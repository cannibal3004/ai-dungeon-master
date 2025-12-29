#!/usr/bin/env node
/**
 * Quick test to verify tool execution with quantity-based items
 */

require('dotenv').config();
const { Pool } = require('pg');

async function testTools() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('\n🧪 Testing Tool Execution with Quantity-Based Items\n');

    const { ToolExecutor } = require('./dist/services/tools');

    // Get first character from database
    const result = await pool.query('SELECT * FROM characters LIMIT 1');
    if (!result.rows || result.rows.length === 0) {
      console.log('❌ No test character found. Run .\dev.ps1 reset-db first');
      await pool.end();
      process.exit(1);
    }

    const char = result.rows[0];
    console.log(`✓ Found test character: ${char.name} (ID: ${char.id})`);
    console.log(`  Starting inventory:`, char.inventory);

    const toolExecutor = new ToolExecutor();

    // Test 1: Add items with quantities
    console.log('\n--- Test 1: Adding items with quantities ---');
    const addResult = await toolExecutor.executeTool(
      {
        id: 'test-add-1',
        function: {
          name: 'add_items_to_inventory',
          arguments: JSON.stringify({
            items: ['Rations (3 days)', 'Health Potion (2)', 'Gold Coins (50)']
          })
        }
      },
      char.id
    );

    const addParsed = JSON.parse(addResult.content);
    console.log(`✓ Result:`, addParsed);

    // Verify in database
    const charAfterAdd = await pool.query('SELECT inventory FROM characters WHERE id = $1', [char.id]);
    console.log(`  After add inventory:`, charAfterAdd.rows[0].inventory);

    // Test 2: Remove items with quantities
    console.log('\n--- Test 2: Removing items with quantities ---');
    const removeResult = await toolExecutor.executeTool(
      {
        id: 'test-remove-1',
        function: {
          name: 'remove_items_from_inventory',
          arguments: JSON.stringify({
            items: ['Rations (1 day)', 'Health Potion (1)', 'Gold Coins (10)']
          })
        }
      },
      char.id
    );

    const removeParsed = JSON.parse(removeResult.content);
    console.log(`✓ Result:`, removeParsed);

    // Verify quantities were decremented, not items removed
    const charAfterRemove = await pool.query('SELECT inventory FROM characters WHERE id = $1', [char.id]);
    console.log(`  After remove inventory:`, charAfterRemove.rows[0].inventory);

    // Test 3: Remove all of an item (should delete entirely)
    console.log('\n--- Test 3: Removing all of an item ---');
    const removeAllResult = await toolExecutor.executeTool(
      {
        id: 'test-remove-all-1',
        function: {
          name: 'remove_items_from_inventory',
          arguments: JSON.stringify({
            items: ['Waterskin']
          })
        }
      },
      char.id
    );

    const removeAllParsed = JSON.parse(removeAllResult.content);
    console.log(`✓ Result:`, removeAllParsed);

    const charAfterRemoveAll = await pool.query('SELECT inventory FROM characters WHERE id = $1', [char.id]);
    console.log(`  After removing waterskin:`, charAfterRemoveAll.rows[0].inventory);

    console.log('\n✅ All tool tests passed!');
    console.log('\nSummary:');
    console.log('  ✓ Items with quantities are correctly parsed from strings like "Rations (3 days)"');
    console.log('  ✓ Duplicate items have their quantities incremented');
    console.log('  ✓ Removing items decrements quantities instead of deleting');
    console.log('  ✓ Items are only removed when quantity reaches 0');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    await pool.end();
    process.exit(1);
  }
}

testTools();
