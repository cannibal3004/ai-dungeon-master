$ErrorActionPreference = "Stop"
$base = "http://localhost:4000/api"

function Invoke-Api {
  param([string]$Method, [string]$Path, [object]$Body = $null, [string]$Token = $null)
  $uri = "$base$Path"
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $json = $null
  if ($Body -ne $null) { $json = ($Body | ConvertTo-Json -Depth 6) }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json
}

try {
  $email = "providers+$(Get-Random -Minimum 1000 -Maximum 9999)@example.com"
  $pass = "ProvTest!Passw0rd"
  try {
    $login = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $email; password = $pass }
    $token = $login.data.token
  } catch {
    $uname = "ProvUser$(Get-Random -Minimum 1000 -Maximum 9999)"
    $reg = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $email; password = $pass; username = $uname }
    $login = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $email; password = $pass }
    $token = $login.data.token
  }

  $resp = Invoke-Api -Method GET -Path "/dm/providers/status" -Token $token
  $resp | ConvertTo-Json -Depth 4
} catch {
  Write-Host "Failed to fetch providers" -ForegroundColor Red
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    Write-Host $errBody
  } else {
    Write-Host $_.Exception.Message
  }
  exit 1
}