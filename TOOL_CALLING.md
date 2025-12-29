# LLM Tool Calling Implementation

## Overview
Implemented function calling support to allow the LLM to directly manage character state during narrative generation.

## Features

### Tool Definitions
Created 6 tools in `backend/src/services/tools.ts`:

1. **add_items_to_inventory** - Add items when player picks up, receives, or buys items
2. **remove_items_from_inventory** - Remove items when used, sold, or lost
3. **update_character_gold** - Add or subtract gold from character
4. **update_character_hp** - Modify character HP (damage/healing)
5. **update_character_xp** - Award experience points and handle leveling
6. **roll_dice** - Roll dice for ability checks, attacks, saves, damage (with DC comparison)

### How It Works

1. **Narrative Generation**: When `generateNarrative()` is called with a characterId, the LLM receives tool definitions
2. **LLM Decision**: The LLM decides whether to call tools based on the narrative context
3. **Tool Execution**: Any tool calls are executed immediately, updating the database
4. **Response Enhancement**: Tool results are appended to the narrative response

### Example Flow

**Player Action**: "I search the chest and take the healing potion"

**LLM Response**: 
- Narrative: "You open the old wooden chest. Inside, you find a shimmering red healing potion..."
- Tool Calls:
  - `add_items_to_inventory({ items: ["Healing Potion"] })`
- Database Update: Character inventory updated immediately
- Final Response: "...healing potion.\n\nAdded to inventory: Healing Potion"

**Player Action**: "I buy the silver sword for 50 gold"

**LLM Response**:
- Narrative: "The merchant hands you the finely crafted silver sword..."
- Tool Calls:
  - `add_items_to_inventory({ items: ["Silver Sword"] })`
  - `update_character_gold({ amount: -50, reason: "purchased silver sword" })`
- Database Update: Inventory and gold updated atomically
- Final Response: "...silver sword.\n\n✓ Added to inventory: Silver Sword\n✓ Gold -50 gp (now 150 gp)"

**Player Action**: "I attack the goblin with my sword"

**LLM Response**:
- Narrative: "You swing your blade at the goblin..."
- Tool Calls:
  - `roll_dice({ dice_expression: "1d20+5", check_type: "Attack Roll", dc: 13 })`
  - `roll_dice({ dice_expression: "1d8+3", check_type: "Damage" })`
- Final Response: "...at the goblin.\n\n🎲 Attack Roll: 1d20+5 = 18 [13] vs DC 13: **SUCCESS**\n🎲 Damage: 1d8+3 = 9 [6]"

**Player Action**: "We defeated all the goblins!"

**LLM Response**:
- Narrative: "The last goblin falls to the ground. You've cleared the cave!"
- Tool Calls:
  - `update_character_xp({ amount: 150, reason: "defeated goblin ambush" })`
- Final Response: "...the cave!\n\n✓ XP +150 (now 1200 XP) 🎉 LEVEL UP! Now level 2!"

## Implementation Details

### Files Modified

1. **backend/src/llm/types.ts** - Added Tool, ToolCall interfaces to CompletionOptions and LLMResponse
2. **backend/src/llm/providers/openai.ts** - Added tool support to Chat Completions API
3. **backend/src/services/AIDMService.ts** - Integrated tool calling into narrative generation
4. **backend/src/services/tools.ts** - NEW: Tool definitions and execution handlers

### Benefits

✅ **Accurate**: No more LLM extraction errors - changes happen in real-time
✅ **Atomic**: Database updates are immediate and transactional  
✅ **Transparent**: Tool results shown to player as part of narrative
✅ **Efficient**: Only enabled when characterId is provided
✅ **Fallback**: Still uses extraction for models without tool support

### Cost Impact

- **Minimal** - Tools add ~200 tokens to input (one-time per request)
- Both gpt-4o-mini and gpt-5-nano support function calling
- Tool calls don't count toward output tokens
- Net savings from eliminating extraction step

## Testing

The system will automatically use tools when:
- A characterId is provided to `generateNarrative()`
- The LLM model supports function calling (gpt-4o-mini, gpt-5-nano, etc.)
- The narrative involves inventory/gold/HP changes

Try these test scenarios:
```
"I pick up the sword and shield"
"I buy 3 health potions for 30 gold"  
"I use a health potion"
"The goblin hits me for 8 damage"
"I try to sneak past the guards" (should trigger Stealth check)
"I attack the orc with my greatsword" (should trigger attack + damage rolls)
"We defeated the dragon!" (should award XP, potentially level up)
```

## Future Enhancements

Potential additional tools:
- `add_spell` / `remove_spell` - Spell management
- `use_spell_slot` / `restore_spell_slots` - Spell slot tracking  
- `add_condition` / `remove_condition` - Status effects (poisoned, stunned, etc.)
- `update_ability_score` - Permanent stat changes
- `add_proficiency` - Learn new skills/weapons
