# Test API Endpoints

Write-Host "`nTesting AI Dungeon Master API..." -ForegroundColor Cyan

$baseUrl = "http://localhost:4000/api"

# Test 1: Register a user
Write-Host "`n1. Registering user..." -ForegroundColor Yellow
$registerData = @{
    username = "testplayer"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerData -ContentType "application/json"
    $token = $registerResponse.data.token
    Write-Host "[OK] User registered successfully" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "User already exists, trying login..." -ForegroundColor Yellow
        
        # Login instead
        $loginData = @{
            email = "test@example.com"
            password = "password123"
        } | ConvertTo-Json
        
        $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginData -ContentType "application/json"
        $token = $loginResponse.data.token
        Write-Host "[OK] Logged in successfully" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Registration failed: $_" -ForegroundColor Red
        exit 1
    }
}

# Test 2: Get profile
Write-Host "`n2. Getting user profile..." -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $profile = Invoke-RestMethod -Uri "$baseUrl/auth/profile" -Headers $headers
    Write-Host "[OK] Profile retrieved: $($profile.data.user.username)" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Failed to get profile: $_" -ForegroundColor Red
}

# Test 3: Get campaign ID and clean up old test data
Write-Host "`n3. Getting test campaign..." -ForegroundColor Yellow
$output = (docker exec -i aidm_postgres psql -U dmuser -d aidungeonmaster -t -c "SELECT id FROM campaigns LIMIT 1;" 2>$null) -join ' '
if ($output -and $output -match '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') {
    $campaignId = $matches[1]
    Write-Host "[OK] Using campaign: $campaignId" -ForegroundColor Green
    
    # Delete existing test characters for this user/campaign
    docker exec -i aidm_postgres psql -U dmuser -d aidungeonmaster -c "DELETE FROM characters WHERE campaign_id = '$campaignId' AND player_id = (SELECT id FROM users WHERE email = 'test@example.com');" 2>$null | Out-Null
    Write-Host "    Cleaned up existing test characters" -ForegroundColor Gray
} else {
    Write-Host "[FAIL] No campaign available. Run: docker exec -i aidm_postgres psql -U dmuser -d aidungeonmaster -c `"INSERT INTO campaigns (name, description, created_by) SELECT 'Test Campaign', 'Test', id FROM users WHERE email = 'test@example.com' LIMIT 1;`"" -ForegroundColor Red
    exit 1
}

# Test 4: Create a character
Write-Host "`n4. Creating a character..." -ForegroundColor Yellow
$characterData = @{
    campaignId = $campaignId
    name = "Thorin Ironforge"
    race = "dwarf"
    class = "fighter"
    background = "Soldier"
} | ConvertTo-Json

try {
    $character = Invoke-RestMethod -Uri "$baseUrl/characters" -Method Post -Headers $headers -Body $characterData -ContentType "application/json"
    $characterId = $character.data.character.id
    Write-Host "[OK] Character created: $($character.data.character.name)" -ForegroundColor Green
    Write-Host "  Level: $($character.data.character.level), HP: $($character.data.character.hp)/$($character.data.character.max_hp)" -ForegroundColor Gray
    Write-Host "  AC: $($character.data.character.armor_class)" -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Failed to create character" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $characterId = $null
}

# Test 5: Get character
if ($characterId) {
    Write-Host "`n5. Retrieving character..." -ForegroundColor Yellow
    try {
        $char = Invoke-RestMethod -Uri "$baseUrl/characters/$characterId" -Headers $headers
        Write-Host "[OK] Character retrieved: $($char.data.character.name)" -ForegroundColor Green
        Write-Host "  Ability Scores:" -ForegroundColor Gray
        $scores = $char.data.character.ability_scores
        Write-Host "    STR: $($scores.strength), DEX: $($scores.dexterity), CON: $($scores.constitution)" -ForegroundColor Gray
        Write-Host "    INT: $($scores.intelligence), WIS: $($scores.wisdom), CHA: $($scores.charisma)" -ForegroundColor Gray
    } catch {
        Write-Host "[FAIL] Failed to get character: $_" -ForegroundColor Red
    }

    # Test 6: Update HP (take damage)
    Write-Host "`n6. Taking 5 damage..." -ForegroundColor Yellow
    $damageData = @{
        amount = -5
    } | ConvertTo-Json

    try {
        $updated = Invoke-RestMethod -Uri "$baseUrl/characters/$characterId/hp" -Method Post -Headers $headers -Body $damageData -ContentType "application/json"
        Write-Host "[OK] HP updated: $($updated.data.character.hp)/$($updated.data.character.max_hp)" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] Failed to update HP: $_" -ForegroundColor Red
    }

    # Test 7: Level up
    Write-Host "`n7. Leveling up character..." -ForegroundColor Yellow
    try {
        $leveledUp = Invoke-RestMethod -Uri "$baseUrl/characters/$characterId/level-up" -Method Post -Headers $headers
        Write-Host "[OK] Character leveled up!" -ForegroundColor Green
        Write-Host "  New Level: $($leveledUp.data.character.level), New HP: $($leveledUp.data.character.hp)/$($leveledUp.data.character.max_hp)" -ForegroundColor Gray
    } catch {
        Write-Host "[FAIL] Failed to level up: $_" -ForegroundColor Red
    }

    # Test 8: Get all my characters
    Write-Host "`n8. Getting all characters..." -ForegroundColor Yellow
    try {
        $allChars = Invoke-RestMethod -Uri "$baseUrl/characters/my" -Headers $headers
        Write-Host "[OK] Retrieved $($allChars.data.characters.Count) character(s)" -ForegroundColor Green
        foreach ($c in $allChars.data.characters) {
            Write-Host "  - $($c.name) (Level $($c.level) $($c.race) $($c.class))" -ForegroundColor Gray
        }
    } catch {
        Write-Host "[FAIL] Failed to get characters: $_" -ForegroundColor Red
    }
}

Write-Host "`n[DONE] API tests completed!`n" -ForegroundColor Cyan
