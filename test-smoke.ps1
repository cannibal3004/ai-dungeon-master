# Smoke test for AI Dungeon Master backend

Write-Host "`nSmoke Testing API..." -ForegroundColor Cyan

$baseUrl = "http://localhost:4000/api"

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Url,
        $Body = $null,
        $Headers = $null
    )
    if ($Body) {
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 5) -ContentType "application/json"
    } else {
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
    }
}

# 1) Register or login
Write-Host "`n1. Auth (register/login)..." -ForegroundColor Yellow
$token = $null
try {
    $register = Invoke-Json -Method Post -Url "$baseUrl/auth/register" -Body @{ username = "smoketest"; email = "smoketest@example.com"; password = "password123" }
    $token = $register.data.token
    Write-Host "[OK] Registered new user" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        $login = Invoke-Json -Method Post -Url "$baseUrl/auth/login" -Body @{ email = "smoketest@example.com"; password = "password123" }
        $token = $login.data.token
        Write-Host "[OK] Logged in existing user" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Auth failed: $_" -ForegroundColor Red
        exit 1
    }
}

$headers = @{ Authorization = "Bearer $token" }

# 2) Profile
Write-Host "`n2. Get profile..." -ForegroundColor Yellow
$profile = Invoke-Json -Method Get -Url "$baseUrl/auth/profile" -Headers $headers
Write-Host "[OK] Profile: $($profile.data.user.username)" -ForegroundColor Green

# 3) Create campaign
Write-Host "`n3. Create campaign..." -ForegroundColor Yellow
$campaignName = "Smoke Campaign " + (Get-Date -Format "yyyyMMdd-HHmmss")
$campaign = Invoke-Json -Method Post -Url "$baseUrl/campaigns" -Headers $headers -Body @{ name = $campaignName; description = "Smoke test campaign" }
$campaignId = $campaign.data.campaign.id
Write-Host "[OK] Campaign: $campaignId" -ForegroundColor Green

# 4) Create character
Write-Host "`n4. Create character..." -ForegroundColor Yellow
$character = Invoke-Json -Method Post -Url "$baseUrl/characters" -Headers $headers -Body @{ 
    campaignId = $campaignId;
    name = "Smoke Hero";
    race = "human";
    class = "fighter";
    background = "Soldier";
}
$characterId = $character.data.character.id
Write-Host "[OK] Character: $characterId" -ForegroundColor Green

# 5) Start session
Write-Host "`n5. Start session..." -ForegroundColor Yellow
$session = Invoke-Json -Method Post -Url "$baseUrl/sessions/start" -Headers $headers -Body @{ campaignId = $campaignId; dmNotes = "Smoke session" }
$sessionId = $session.data.session.id
Write-Host "[OK] Session: $sessionId" -ForegroundColor Green

# 6) Get active session
Write-Host "`n6. Get active session..." -ForegroundColor Yellow
$active = Invoke-Json -Method Get -Url "$baseUrl/sessions/campaign/$campaignId/active" -Headers $headers
Write-Host "[OK] Active session: $($active.data.session.id)" -ForegroundColor Green

# 7) Create save state
Write-Host "`n7. Create save state..." -ForegroundColor Yellow
$save = Invoke-Json -Method Post -Url "$baseUrl/sessions/saves" -Headers $headers -Body @{ 
    sessionId = $sessionId;
    saveName = "Smoke Save";
    stateData = @{ hp = 10; notes = "checkpoint" };
    turnNumber = 0;
}
$saveId = $save.data.saveState.id
Write-Host "[OK] Save state: $saveId" -ForegroundColor Green

# 8) List save states
Write-Host "`n8. List saves..." -ForegroundColor Yellow
$saves = Invoke-Json -Method Get -Url "$baseUrl/sessions/campaign/$campaignId/saves" -Headers $headers
Write-Host "[OK] Saves count: $($saves.data.saveStates.Count)" -ForegroundColor Green

# 9) End session
Write-Host "`n9. End session..." -ForegroundColor Yellow
$ended = Invoke-Json -Method Post -Url "$baseUrl/sessions/$sessionId/end" -Headers $headers -Body @{ dmNotes = "Ended" }
Write-Host "[OK] Session ended at: $($ended.data.session.ended_at)" -ForegroundColor Green

# 10) List sessions
Write-Host "`n10. List sessions..." -ForegroundColor Yellow
$sessions = Invoke-Json -Method Get -Url "$baseUrl/sessions/campaign/$campaignId" -Headers $headers
Write-Host "[OK] Sessions count: $($sessions.data.sessions.Count)" -ForegroundColor Green

Write-Host "`n[DONE] Smoke test complete" -ForegroundColor Cyan
