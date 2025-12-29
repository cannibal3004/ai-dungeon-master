# DM narrative test script
param(
  [string]$BaseUrl = "http://localhost:4000/api",
  [string]$Email = "dmtest+$(Get-Random -Minimum 1000 -Maximum 9999)@example.com",
  [string]$Password = "Dmt3st!Passw0rd",
  [string]$CampaignName = "DM Test Campaign"
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = $null
  )
  $uri = "$BaseUrl$Path"
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $contentType = "application/json"
  $json = $null
  if ($Body -ne $null) { $json = ($Body | ConvertTo-Json -Depth 6) }
  try {
    $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType $contentType -Body $json
    return $resp
  } catch {
    Write-Host "API call failed: $Method $Path" -ForegroundColor Red
    if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errBody = $reader.ReadToEnd()
      Write-Host $errBody
    } else {
      Write-Host $_.Exception.Message
    }
    throw
  }
}

function Get-Token {
  param([string]$Email, [string]$Password)
  # Try registration first (tests registration flow)
  try {
    $uname = "DMTester$(Get-Random -Minimum 1000 -Maximum 9999)"
    Write-Host "Testing registration..." -ForegroundColor Cyan
    $register = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $Email; password = $Password; username = $uname }
    Write-Host "[OK] Registration successful" -ForegroundColor Green
    
    # Now test login with the newly created user
    Write-Host "Testing login..." -ForegroundColor Cyan
    $login = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $Email; password = $Password }
    Write-Host "[OK] Login successful" -ForegroundColor Green
    return $login.data.token
  } catch {
    # Registration failed (user likely exists), test login flow
    Write-Host "Registration skipped (user exists); testing login..." -ForegroundColor Yellow
    $login = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $Email; password = $Password }
    Write-Host "[OK] Login successful" -ForegroundColor Green
    return $login.data.token
  }
}

function Create-Campaign {
  param([string]$Token)
  $created = Invoke-Api -Method POST -Path "/campaigns" -Token $Token -Body @{ name = $CampaignName }
  return $created.data.campaign.id
}

function Create-Character {
  param([string]$Token, [string]$CampaignId)
  $body = @{ 
    campaignId = $CampaignId;
    name = "Aria";
    race = "human";
    class = "fighter";
    background = "Former guard, now adventurer";
  }
  $created = Invoke-Api -Method POST -Path "/characters" -Token $Token -Body $body
  return $created.data.character.id
}

function Start-Session {
  param([string]$Token, [string]$CampaignId)
  $started = Invoke-Api -Method POST -Path "/sessions/start" -Token $Token -Body @{ campaignId = $CampaignId; name = "DM Test Session" }
  return $started.data.session.id
}

function Get-Profile {
  param([string]$Token)
  $profile = Invoke-Api -Method GET -Path "/auth/profile" -Token $Token
  return $profile.data.user.id
}

function Add-PlayerToCampaign {
  param([string]$Token, [string]$CampaignId, [string]$UserId, [string]$CharacterId)
  $body = @{ userId = $UserId; characterId = $CharacterId }
  $resp = Invoke-Api -Method POST -Path "/campaigns/$CampaignId/players" -Token $Token -Body $body
  return $resp.status
}

function Request-Narrative {
  param([string]$Token, [string]$CampaignId)
  $action = "I enter the tavern, scan the room, and ask the bartender about local rumors."
  $resp = Invoke-Api -Method POST -Path "/dm/narrative" -Token $Token -Body @{ campaignId = $CampaignId; action = $action }
  return $resp.data.narrative
}

# Flow
Write-Host "`n=== Testing Auth Flow ===" -ForegroundColor Magenta
$token = Get-Token -Email $Email -Password $Password

Write-Host "Creating campaign..." -ForegroundColor Cyan
$campaignId = Create-Campaign -Token $token
Write-Host "Campaign: $campaignId" -ForegroundColor Green

Write-Host "Creating character..." -ForegroundColor Cyan
$charId = Create-Character -Token $token -CampaignId $campaignId
Write-Host "Character: $charId" -ForegroundColor Green

Write-Host "Fetching profile..." -ForegroundColor Cyan
$userId = Get-Profile -Token $token
Write-Host "User: $userId" -ForegroundColor Green

Write-Host "Starting session..." -ForegroundColor Cyan
$sessionId = Start-Session -Token $token -CampaignId $campaignId
Write-Host "Session: $sessionId" -ForegroundColor Green

Write-Host "Adding player to campaign (session)..." -ForegroundColor Cyan
try {
  $addStatus = Add-PlayerToCampaign -Token $token -CampaignId $campaignId -UserId $userId -CharacterId $charId
  Write-Host "Player added to session: $addStatus" -ForegroundColor Green
} catch {
  Write-Host "Add player failed; continuing without party linkage." -ForegroundColor Yellow
}

Write-Host "Requesting DM narrative..." -ForegroundColor Cyan
$narrative = Request-Narrative -Token $token -CampaignId $campaignId

if ([string]::IsNullOrWhiteSpace($narrative)) {
  Write-Host "No narrative returned." -ForegroundColor Red
  exit 1
}

Write-Host "\n--- DM Narrative ---\n" -ForegroundColor Magenta
Write-Host $narrative
Write-Host "`nNarrative length: $($narrative.Length)" -ForegroundColor DarkGray
Write-Host "Done." -ForegroundColor Green
