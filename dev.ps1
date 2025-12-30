#!/usr/bin/env pwsh
# Development server management script for AIDungeonMaster
# Usage: .\dev.ps1 [start|stop|restart|status|logs|migrate] [-Target all|backend|frontend]
# 
# Frontend automatically proxies /api and /socket.io to backend via reverse proxy
# Access at: http://localhost:3000 (includes API and WebSocket)

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'migrate', 'reset-db', 'test', 'clear-logs', 'build')]
    [string]$Action = 'status',
    
    [Parameter()]
    [ValidateSet('all', 'backend', 'frontend', 'postgres', 'redis')]
    [string]$Target = 'all',

    [Parameter(Mandatory = $false)]
    [Switch]$Follow = $false,

    [Parameter(Mandatory = $false)]
    [Switch]$Yes = $false,

    [Parameter(Mandatory = $false)]
    [int]$Lines = 50
)

$ErrorActionPreference = 'SilentlyContinue'
$BackendPort = 4000
$FrontendPort = 3000
$RedisPort = 6379
$PostgresPort = 5432
$LogDir = Join-Path $PSScriptRoot 'logs'
$BackendLog = Join-Path $LogDir 'backend.log'
$FrontendLog = Join-Path $LogDir 'frontend.log'

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Get-PortProcess {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

function Stop-DevServer {
    param([string]$Service)
    
    if ($Service -eq 'backend' -or $Service -eq 'all') {
        $proc = Get-PortProcess -Port $BackendPort
        if ($proc) {
            Write-Host "Stopping backend (PID: $($proc.Id), Port: $BackendPort)..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force
            Start-Sleep -Milliseconds 500
        } else {
            Write-Host "Backend not running on port $BackendPort" -ForegroundColor Gray
        }
    }
    
    if ($Service -eq 'frontend' -or $Service -eq 'all') {
        $proc = Get-PortProcess -Port $FrontendPort
        if ($proc) {
            Write-Host "Stopping frontend (PID: $($proc.Id), Port: $FrontendPort)..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force
            Start-Sleep -Milliseconds 500
        } else {
            Write-Host "Frontend not running on port $FrontendPort" -ForegroundColor Gray
        }
    }

    if ($Service -eq 'postgres' -or $Service -eq 'all') {
        if (docker ps -q --filter "name=aidm_postgres") {
            Write-Host "Stopping PostgreSQL Docker container..." -ForegroundColor Yellow
            docker compose -f docker-compose.yml stop postgres | Out-Null
            Start-Sleep -Seconds 2
        } else {
            Write-Host "PostgreSQL Docker container not running" -ForegroundColor Gray
        }
    }

    if ($Service -eq 'redis' -or $Service -eq 'all') {
        if (docker ps -q --filter "name=aidm_redis") {
            Write-Host "Stopping Redis Docker container..." -ForegroundColor Yellow
            docker compose -f docker-compose.yml stop redis | Out-Null
            Start-Sleep -Seconds 2
        } else {
            Write-Host "Redis Docker container not running" -ForegroundColor Gray
        }
    }
}

function Start-DevServer {
    param([string]$Service)

    if ($Service -eq 'postgres' -or $Service -eq 'all') {
        $proc = docker ps -q --filter "name=aidm_postgres"
        if (-not $proc) {
            Write-Host "Starting PostgreSQL Docker container..." -ForegroundColor Green
            docker compose -f docker-compose.yml up -d postgres | Out-Null
            Start-Sleep -Seconds 3
        } else {
            Write-Host "PostgreSQL Docker container already running" -ForegroundColor Cyan
        }
    }

    if ($Service -eq 'redis' -or $Service -eq 'all') {
        $proc = docker ps -q --filter "name=aidm_redis"
        if (-not $proc) {
            Write-Host "Starting Redis Docker container..." -ForegroundColor Green
            docker compose -f docker-compose.yml up -d redis | Out-Null
            Start-Sleep -Seconds 2
        } else {
            Write-Host "Redis Docker container already running" -ForegroundColor Cyan
        }
    }
    
    if ($Service -eq 'backend' -or $Service -eq 'all') {
        $proc = Get-PortProcess -Port $BackendPort
        if ($proc) {
            Write-Host "Backend already running (PID: $($proc.Id))" -ForegroundColor Cyan
        } else {
            Write-Host "Running database migrations..." -ForegroundColor Cyan
            Push-Location backend
            npm run migrate 2>&1 | Out-Null
            Pop-Location
            Write-Host "Starting backend on port $BackendPort (logs: logs/backend.log)..." -ForegroundColor Green
            Start-Process powershell -ArgumentList "-Command", "cd backend; npm start 2>&1 | Tee-Object -FilePath '$BackendLog' -Append" -WindowStyle Hidden
            Start-Sleep -Seconds 3
        }
    }
    
    if ($Service -eq 'frontend' -or $Service -eq 'all') {
        $proc = Get-PortProcess -Port $FrontendPort
        if ($proc) {
            Write-Host "Frontend already running (PID: $($proc.Id))" -ForegroundColor Cyan
        } else {
            Write-Host "Starting frontend on port $FrontendPort (logs: logs/frontend.log)..." -ForegroundColor Green
            Start-Sleep -Seconds 1  # Give backend time to start if starting both
            Start-Process powershell -ArgumentList "-Command", "cd frontend; npm run dev 2>&1 | Tee-Object -FilePath '$FrontendLog' -Append" -WindowStyle Hidden
            Start-Sleep -Seconds 3
        }
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "  AIDungeonMaster Dev Server Status" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check backend
    $backendProc = Get-PortProcess -Port $BackendPort
    Write-Host "Backend (Port $BackendPort):  " -NoNewline -ForegroundColor Yellow
    if ($backendProc) {
        Write-Host "RUNNING (PID: $($backendProc.Id))" -ForegroundColor Green
        Write-Host "  -> http://localhost:$BackendPort" -ForegroundColor Gray
    } else {
        Write-Host "STOPPED" -ForegroundColor Red
    }
    Write-Host ""
    
    # Check frontend
    $frontendProc = Get-PortProcess -Port $FrontendPort
    Write-Host "Frontend (Port $FrontendPort): " -NoNewline -ForegroundColor Yellow
    if ($frontendProc) {
        Write-Host "RUNNING (PID: $($frontendProc.Id))" -ForegroundColor Green
        Write-Host "  -> http://localhost:$FrontendPort" -ForegroundColor Gray
    } else {
        Write-Host "STOPPED" -ForegroundColor Red
    }
    Write-Host ""
    # Check PostgreSQL
    Write-Host "PostgreSQL:           " -NoNewline -ForegroundColor Yellow
    if (docker ps -q --filter "name=aidm_postgres") {
        Write-Host "RUNNING" -ForegroundColor Green
        Write-Host "  -> TCP localhost:$PostgresPort" -ForegroundColor Gray
    } else {
        Write-Host "STOPPED" -ForegroundColor Red
    }
    Write-Host ""
    # Check Redis
    Write-Host "Redis:                " -NoNewline -ForegroundColor Yellow
    if (docker ps -q --filter "name=aidm_redis") {
        Write-Host "RUNNING" -ForegroundColor Green
        Write-Host "  -> TCP localhost:$RedisPort" -ForegroundColor Gray
    } else {
        Write-Host "STOPPED" -ForegroundColor Red
    }
    Write-Host ""
}

function Show-Logs {
    param([string]$Service)
    param([bool]$Follow)
    
    if ($Service -eq 'backend' -or $Service -eq 'all') {
        Write-Host "`n=== Backend Logs ===`n" -ForegroundColor Cyan
        if ($Follow -and $Follow -eq $true -and $Service -ne 'all') {
            Get-Content $BackendLog -Wait -Tail $Lines
        } else {
            Get-Content $BackendLog -Tail $Lines
        }
    }

    if ($Service -eq 'frontend' -or $Service -eq 'all') {
        Write-Host "`n=== Frontend Logs ===`n" -ForegroundColor Cyan
        if ($Follow -and $Follow -eq $true -and $Service -ne 'all') {
            Get-Content $FrontendLog -Wait -Tail $Lines
        } else {
            Get-Content $FrontendLog -Tail $Lines
        }
    }

    if ($Service -eq 'postgres' -or $Service -eq 'all') {
        Write-Host "`n=== PostgreSQL Logs ===`n" -ForegroundColor Cyan
        if ($Follow -and $Follow -eq $true) {
            docker compose -f .\docker-compose.yml logs -f postgres
        } else {
            docker compose -f .\docker-compose.yml logs postgres --tail $Lines
        }
    }

    if ($Service -eq 'redis' -or $Service -eq 'all') {
        Write-Host "`n=== Redis Logs ===`n" -ForegroundColor Cyan
        if ($Follow -and $Follow -eq $true) {
            docker compose -f .\docker-compose.yml logs -f redis
        } else {
            docker compose -f .\docker-compose.yml logs redis --tail $Lines
        }
    }
}

function Clear-Logs {
    param([string]$Service)

    $shouldRestartBackend = $false
    $shouldRestartFrontend = $false
    Write-Host ""
    Write-Host "⚠️  WARNING: This will DELETE ALL LOG DATA!" -ForegroundColor Red
    Write-Host ""
    if (-not $Yes.IsPresent) {
        $confirm = Read-Host "Are you sure you want to clear the logs? Type 'yes' to confirm"
        if ($confirm -ne 'yes') {
            Write-Host ""
            Write-Host "Log clearing cancelled" -ForegroundColor Yellow
            Write-Host ""
            return
        }
    }

    if ($Service -eq 'backend' -or $Service -eq 'all') {
        $backendRunning = Get-PortProcess -Port $BackendPort
        if ($backendRunning) {
            Write-Host "⚠️  Backend server is running. You must stop it before clearing logs." -ForegroundColor Yellow
            Write-Host ""
            if ( !$Yes.IsPresent ) {
                Write-Host "Do you want to stop and restart the backend after clearing logs? Type 'yes' to confirm: " -NoNewline
                $resp = Read-Host
            } else {
                $resp = "yes"
            }
            if ($resp -eq 'yes') {
                Write-Host "Stopping backend..." -ForegroundColor Yellow
                Stop-DevServer -Service 'backend'
                $shouldRestartBackend = $true
                Write-Host "Clearing backend logs..." -ForegroundColor Cyan
                Clear-Content -Path $BackendLog -ErrorAction SilentlyContinue
            } else {
                Write-Host ""
                Write-Host "Log clearing cancelled" -ForegroundColor Yellow
                Write-Host ""
            }
        }
    }
    if ($Service -eq 'frontend' -or $Service -eq 'all') {
        $frontendRunning = Get-PortProcess -Port $FrontendPort
        if ($frontendRunning) {
            Write-Host "⚠️  Frontend server is running. You must stop it before clearing logs." -ForegroundColor Yellow
            Write-Host ""
            if ( !$Yes.IsPresent ) {
                Write-Host "Do you want to stop and restart the frontend after clearing logs? Type 'yes' to confirm: " -NoNewline
                $resp = Read-Host
            } else {
                $resp = "yes"
            }
            if ($resp -eq 'yes') {
                Write-Host "Stopping frontend..." -ForegroundColor Yellow
                Stop-DevServer -Service 'frontend'
                $shouldRestartFrontend = $true
                Write-Host "Clearing frontend logs..." -ForegroundColor Cyan
                Clear-Content -Path $FrontendLog -ErrorAction SilentlyContinue
            } else {
                Write-Host ""
                Write-Host "Log clearing cancelled" -ForegroundColor Yellow
                Write-Host ""
            }
        }
    }
    if ($shouldRestartBackend) {
        Write-Host "Restarting backend..." -ForegroundColor Yellow
        Start-DevServer -Service 'backend'
    }
    if ($shouldRestartFrontend) {
        Write-Host "Restarting frontend..." -ForegroundColor Yellow
        Start-DevServer -Service 'frontend'
    }
}

function Run-Migrations {
    Write-Host "Running database migrations..." -ForegroundColor Cyan
    Push-Location backend
    $output = npm run migrate 2>&1
    Pop-Location
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Migrations completed successfully" -ForegroundColor Green
    } else {
        Write-Host "Migration warning (database may already be up to date):" -ForegroundColor Yellow
        Write-Host $output -ForegroundColor Gray
    }
}

function Run-Tests {
    param([string]$Service)
    
    $backendTests = $Service -eq 'backend' -or $Service -eq 'all'
    $frontendTests = $Service -eq 'frontend' -or $Service -eq 'all'
    
    if ($backendTests) {
        Write-Host "`n=== Backend Tests ===" -ForegroundColor Cyan
        Write-Host ""
        
        # Set test database URL (use same database as dev by default)
        if (-not $env:TEST_DATABASE_URL) {
            if ($env:DATABASE_URL) {
                $env:TEST_DATABASE_URL = $env:DATABASE_URL
            } else {
                $env:TEST_DATABASE_URL = "postgresql://dmuser@localhost:5432/aidungeonmaster"
            }
        }
        
        Write-Host "Using TEST_DATABASE_URL: $env:TEST_DATABASE_URL" -ForegroundColor Gray
        Write-Host ""
        
        Push-Location backend
        
        # Run build check first
        Write-Host "Checking TypeScript compilation..." -ForegroundColor Yellow
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Build errors detected (but continuing with tests)" -ForegroundColor Yellow
        } else {
            Write-Host "✓ Build successful" -ForegroundColor Green
        }
        Write-Host ""
        
        # Run smoke tests (quick)
        Write-Host "Running smoke tests (quick validation)..." -ForegroundColor Yellow
        npm run test:smoke
        $smokeStatus = $LASTEXITCODE
        Write-Host ""
        
        # Run integration tests
        Write-Host "Running integration tests (API + database)..." -ForegroundColor Yellow
        npm run test:integration
        $integrationStatus = $LASTEXITCODE
        
        Pop-Location
        
        Write-Host ""
        Write-Host "=== Backend Test Summary ===" -ForegroundColor Cyan
        if ($smokeStatus -eq 0) {
            Write-Host "✓ Smoke tests passed" -ForegroundColor Green
        } else {
            Write-Host "✗ Smoke tests failed (exit code: $smokeStatus)" -ForegroundColor Red
        }
        
        if ($integrationStatus -eq 0) {
            Write-Host "✓ Integration tests passed" -ForegroundColor Green
        } else {
            Write-Host "✗ Integration tests failed (exit code: $integrationStatus)" -ForegroundColor Red
        }
        
        $backendStatus = [Math]::Max($smokeStatus, $integrationStatus)
    }
    
    if ($frontendTests) {
        Write-Host "`n=== Frontend E2E Tests ===" -ForegroundColor Cyan
        Write-Host ""
        
        # Check if backend is running for E2E tests
        $backendProc = Get-PortProcess -Port $BackendPort
        if (-not $backendProc) {
            Write-Host "⚠️  Backend not running on port $BackendPort" -ForegroundColor Yellow
            Write-Host "   E2E tests may fail without a running backend." -ForegroundColor Yellow
            Write-Host "   Run 'dev.ps1 start -Target backend' first if needed." -ForegroundColor Gray
            Write-Host ""
        } else {
            Write-Host "✓ Backend detected on port $BackendPort" -ForegroundColor Green
            Write-Host ""
        }
        
        Push-Location frontend
        npm test
        $frontendStatus = $LASTEXITCODE
        Pop-Location
        
        Write-Host ""
        if ($frontendStatus -eq 0) {
            Write-Host "✓ Frontend E2E tests passed" -ForegroundColor Green
        } else {
            Write-Host "✗ Frontend E2E tests failed (exit code: $frontendStatus)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "=== Overall Test Result ===" -ForegroundColor Cyan
    $overallStatus = 0
    if ($backendTests -and $backendStatus -ne 0) { $overallStatus = $backendStatus }
    if ($frontendTests -and $frontendStatus -ne 0) { $overallStatus = $frontendStatus }
    
    if ($overallStatus -eq 0) {
        Write-Host "✓ All tests passed!" -ForegroundColor Green
    } else {
        Write-Host "✗ Some tests failed (exit code: $overallStatus)" -ForegroundColor Red
    }
    Write-Host ""
}

function Reset-Database {
    Write-Host ""
    Write-Host "⚠️  WARNING: This will DELETE ALL DATA in the database!" -ForegroundColor Red
    Write-Host ""
    Write-Host "The reset script will:"
    Write-Host "  - Drop all existing tables"
    Write-Host "  - Run migrations from scratch"
    Write-Host "  - Optionally create test user/campaign/character (recommended for testing)"
    Write-Host ""
    $continue = $false
    if (-not $Yes.IsPresent) {
        $confirm = Read-Host "Are you sure you want to reset the database? Type 'yes' to confirm"
        if ($confirm -eq 'yes') {
            $continue = $true
        }
    } else {
        $continue = $true
    }

    if ($continue -eq $true) {
        Write-Host ""
        Write-Host "Resetting database..." -ForegroundColor Cyan
        Push-Location backend
        npm run db:reset
        Pop-Location
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "Database reset cancelled" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Main execution
switch ($Action) {
    'start' {
        Write-Host ""
        Write-Host "Starting $Target..." -ForegroundColor Cyan
        Write-Host ""
        Start-DevServer -Service $Target
        Show-Status
    }
    'stop' {
        Write-Host ""
        Write-Host "Stopping $Target..." -ForegroundColor Cyan
        Write-Host ""
        Stop-DevServer -Service $Target
        Show-Status
    }
    'restart' {
        Write-Host ""
        Write-Host "Restarting $Target..." -ForegroundColor Cyan
        Write-Host ""
        Stop-DevServer -Service $Target
        Start-Sleep -Seconds 2
        Start-DevServer -Service $Target
        Show-Status
    }
    'migrate' {
        Write-Host ""
        Write-Host "Running database migrations..." -ForegroundColor Cyan
        Write-Host ""
        Run-Migrations
        Write-Host ""
    }
    'reset-db' {
        Reset-Database
    }
    'test' {
        Write-Host ""
        Write-Host "Running tests for $Target..." -ForegroundColor Cyan
        Write-Host ""
        Run-Tests -Service $Target
    }
    'status' {
        Show-Status
    }
    'logs' {
        Show-Logs -Service $Target -Follow $Follow
    }
    'clear-logs' {
        Write-Host "Clearing logs for $Target..." -ForegroundColor Cyan
        Clear-Logs -Service $Target
    }
    'build' {
        Write-Host ""
        Write-Host "Building projects for $Target..." -ForegroundColor Cyan
        if ($Target -eq 'backend' -or $Target -eq 'all') {
            Write-Host ""
            Write-Host "Building backend..." -ForegroundColor Cyan
            Write-Host ""
            
            Push-Location backend
            npm run build
            Pop-Location
            
            Write-Host ""
            Write-Host "Backend build process completed." -ForegroundColor Green
        }

        if ($Target -eq 'frontend' -or $Target -eq 'all') {
            Write-Host ""
            Write-Host "Building frontend..." -ForegroundColor Cyan
            Write-Host ""
            
            Push-Location frontend
            npm run build
            Pop-Location
            
            Write-Host ""
            Write-Host "Frontend build process completed." -ForegroundColor Green
        }
        
        Write-Host "Build process completed." -ForegroundColor Green
    }   
    default {
        Write-Host "===================================================" -ForegroundColor DarkGray
        Write-Host "Usage: dev.ps1 [action] [-Target service]" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Actions:" -ForegroundColor White
        Write-Host "  start       - Start dev servers" -ForegroundColor Gray
        Write-Host "  stop        - Stop dev servers" -ForegroundColor Gray
        Write-Host "  restart     - Restart dev servers" -ForegroundColor Gray
        Write-Host "  migrate     - Run database migrations" -ForegroundColor Gray
        Write-Host "  reset-db    - Drop all tables and recreate (DESTRUCTIVE!)" -ForegroundColor Gray
        Write-Host "  test        - Run backend/frontend tests (Jest + Playwright)" -ForegroundColor Gray
        Write-Host "  logs        - View server logs (tails last 50 lines)" -ForegroundColor Gray
        Write-Host "  clear-logs  - Clear log files" -ForegroundColor Gray
        Write-Host "  status      - Show server status (default)" -ForegroundColor Gray
        Write-Host "  build       - Build backend and frontend projects" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Targets: all (default), backend, frontend, redis, postgres" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor White
        Write-Host "  dev.ps1 start                    # Start all servers" -ForegroundColor Gray
        Write-Host "  dev.ps1 test                     # Run all tests" -ForegroundColor Gray
        Write-Host "  dev.ps1 test -Target backend     # Run backend tests only" -ForegroundColor Gray
        Write-Host "  dev.ps1 logs -Target backend     # Show backend logs" -ForegroundColor Gray
        Write-Host "  Get-Content logs\backend.log     # View full log file" -ForegroundColor Gray
        Write-Host ""
    }
}

