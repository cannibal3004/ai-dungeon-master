# Test Data Auto-Creation Feature

## Overview
The database reset script (`backend/reset-db.js`) now automatically creates test user, campaign, and character data when requested. This saves development time by eliminating the need to manually create these entities for testing.

## Test Credentials

When test data creation is enabled, the following account is created:

```
Email: test@example.com
Password: test123
```

## Test Campaign & Character

A pre-configured test campaign and character are also created:

```
Campaign Name: Test Campaign
Character Name: Aragorn
Race: Human
Class: Ranger
Level: 3
HP: 28/28
AC: 15
Starting Money: 150 gold
Experience: 1500 XP
```

## Usage

### Via npm script:
```bash
npm run db:reset
```

Follow the prompts:
1. **First prompt**: `Are you sure you want to reset the database? (yes/no)`
   - Type `yes` to proceed
2. **Second prompt**: `Create test user/campaign/character? (yes/no)`
   - Type `yes` to auto-create test data
   - Type `no` to reset database with empty tables

### Via PowerShell:
```powershell
.\dev.ps1 reset-db
```

## What Gets Created

When test data is enabled:
1. **Test User**: `testuser` with email `test@example.com` and password `test123`
2. **Test Campaign**: `Test Campaign` owned by the test user
3. **Test Character**: `Aragorn` (Human Ranger, Level 3) in the test campaign
4. **Test Session**: An active game session ready for testing

## Workflow Example

```powershell
# 1. Reset database with test data
.\dev.ps1 reset-db

# 2. Start development servers
.\dev.ps1 start

# 3. Visit http://localhost:3000
# 4. Login with test@example.com / test123
# 5. Campaign and character are ready to use
```

## Implementation Details

The test data creation:
- Uses bcryptjs for secure password hashing
- Generates UUIDs for all entity IDs
- Creates campaign and character in a single reset operation
- Is optional - you can decline test data creation if you prefer a clean slate
- Takes about 100ms to create (fast)

## File Location

- **Reset Script**: `backend/reset-db.js`
- **Verification Script**: `backend/verify-test-data.js` (for testing/debugging)

## Database Structure Created

Test data insertion happens AFTER migrations, ensuring:
- All tables exist with correct schema
- All foreign key constraints are in place
- Test data is properly linked (character → campaign → user)

## Benefits

✅ Faster testing iteration - no manual account/campaign/character creation
✅ Consistent test data - same user/campaign/character every reset
✅ Optional - skip if you want a completely empty database
✅ Repeatable - reset always creates the same test data
✅ Documented - test credentials clearly shown after reset
