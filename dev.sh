#!/usr/bin/env bash
# Development server management script for AIDungeonMaster (bash edition)
# Usage: ./dev.sh [start|stop|restart|status|logs|migrate|reset-db|test|clear-logs|build] [-t all|backend|frontend|postgres|redis] [--follow] [--yes] [--lines N]
set -euo pipefail

ACTION="status"
TARGET="all"
FOLLOW=false
YES=false
LINES=50

BACKEND_PORT=4000
FRONTEND_PORT=3000
REDIS_PORT=6379
POSTGRES_PORT=5432
LOG_DIR="$(cd "$(dirname "$0")" && pwd)/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$LOG_DIR"

usage() {
  cat <<'EOF'
Usage: ./dev.sh [action] [-t target] [--follow] [--yes] [--lines N]
Actions:
  start       Start dev servers
  stop        Stop dev servers
  restart     Restart dev servers
  status      Show server status (default)
  logs        Show logs (tail; use --follow to follow)
  migrate     Run database migrations (backend)
  reset-db    Drop/recreate DB via backend script (destructive)
  test        Run backend/frontend tests
  clear-logs  Clear log files (prompts unless --yes)
  build       Build backend and/or frontend
Targets:
  all (default), backend, frontend, postgres, redis
Examples:
  ./dev.sh start
  ./dev.sh logs -t backend --follow
  ./dev.sh build -t backend
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      start|stop|restart|status|logs|migrate|reset-db|test|clear-logs|build)
        ACTION="$1"; shift ;;
      -t|--target)
        TARGET="$2"; shift 2 ;;
      --follow) FOLLOW=true; shift ;;
      --yes) YES=true; shift ;;
      --lines) LINES="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown arg: $1"; usage; exit 1 ;;
    esac
  done
}

port_pid() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" | head -n1
  else
    netstat -tulpn 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $7}' | cut -d/ -f1 | head -n1
  fi
}

stop_service() {
  local svc="$1"
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    local pid; pid=$(port_pid "$BACKEND_PORT" || true)
    if [[ -n "$pid" ]]; then
      echo "Stopping backend (PID $pid)..."; kill "$pid" || true
    else
      echo "Backend not running on port $BACKEND_PORT"
    fi
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    local pid; pid=$(port_pid "$FRONTEND_PORT" || true)
    if [[ -n "$pid" ]]; then
      echo "Stopping frontend (PID $pid)..."; kill "$pid" || true
    else
      echo "Frontend not running on port $FRONTEND_PORT"
    fi
  fi
  if [[ "$svc" == "postgres" || "$svc" == "all" ]]; then
    if docker ps -q --filter "name=aidm_postgres" >/dev/null; then
      echo "Stopping PostgreSQL container..."; docker compose -f "$ROOT_DIR/docker-compose.yml" stop postgres
    fi
  fi
  if [[ "$svc" == "redis" || "$svc" == "all" ]]; then
    if docker ps -q --filter "name=aidm_redis" >/dev/null; then
      echo "Stopping Redis container..."; docker compose -f "$ROOT_DIR/docker-compose.yml" stop redis
    fi
  fi
}

start_service() {
  local svc="$1"
  if [[ "$svc" == "postgres" || "$svc" == "all" ]]; then
    if ! docker ps -q --filter "name=aidm_postgres" >/dev/null; then
      echo "Starting PostgreSQL container..."; docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres
    else
      echo "PostgreSQL already running"
    fi
  fi
  if [[ "$svc" == "redis" || "$svc" == "all" ]]; then
    if ! docker ps -q --filter "name=aidm_redis" >/dev/null; then
      echo "Starting Redis container..."; docker compose -f "$ROOT_DIR/docker-compose.yml" up -d redis
    else
      echo "Redis already running"
    fi
  fi
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    if port_pid "$BACKEND_PORT" >/dev/null; then
      echo "Backend already running on $BACKEND_PORT"
    else
      echo "Running backend migrations..."; (cd "$ROOT_DIR/backend" && npm run migrate >/dev/null 2>&1 || true)
      echo "Starting backend on $BACKEND_PORT (logs: $BACKEND_LOG)..."
      (cd "$ROOT_DIR/backend" && nohup npm start >> "$BACKEND_LOG" 2>&1 &)
      sleep 2
    fi
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    if port_pid "$FRONTEND_PORT" >/dev/null; then
      echo "Frontend already running on $FRONTEND_PORT"
    else
      echo "Starting frontend on $FRONTEND_PORT (logs: $FRONTEND_LOG)..."
      (cd "$ROOT_DIR/frontend" && nohup npm run dev >> "$FRONTEND_LOG" 2>&1 &)
      sleep 2
    fi
  fi
}

show_status() {
  echo ""
  echo "===== AIDungeonMaster Dev Status ====="
  for svc in backend frontend; do
    local port var
    if [[ "$svc" == "backend" ]]; then port=$BACKEND_PORT; else port=$FRONTEND_PORT; fi
    local pid; pid=$(port_pid "$port" || true)
    if [[ -n "$pid" ]]; then
      echo "$svc on $port: RUNNING (PID $pid)"
    else
      echo "$svc on $port: STOPPED"
    fi
  done
  if docker ps -q --filter "name=aidm_postgres" >/dev/null; then
    echo "postgres: RUNNING (tcp $POSTGRES_PORT)"
  else
    echo "postgres: STOPPED"
  fi
  if docker ps -q --filter "name=aidm_redis" >/dev/null; then
    echo "redis: RUNNING (tcp $REDIS_PORT)"
  else
    echo "redis: STOPPED"
  fi
}

show_logs() {
  local svc="$1"
  local follow_flag=()
  $FOLLOW && follow_flag+=("-f")
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    echo -e "\n=== Backend Logs ==="; tail "${follow_flag[@]}" -n "$LINES" "$BACKEND_LOG"
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    echo -e "\n=== Frontend Logs ==="; tail "${follow_flag[@]}" -n "$LINES" "$FRONTEND_LOG"
  fi
  if [[ "$svc" == "postgres" || "$svc" == "all" ]]; then
    echo -e "\n=== PostgreSQL Logs ==="; docker compose -f "$ROOT_DIR/docker-compose.yml" logs ${FOLLOW:+-f} --tail "$LINES" postgres
  fi
  if [[ "$svc" == "redis" || "$svc" == "all" ]]; then
    echo -e "\n=== Redis Logs ==="; docker compose -f "$ROOT_DIR/docker-compose.yml" logs ${FOLLOW:+-f} --tail "$LINES" redis
  fi
}

clear_logs() {
  local svc="$1"
  if [[ "$YES" == false ]]; then
    read -r -p "⚠️  This will delete logs. Continue? (yes to confirm) " ans
    [[ "$ans" == "yes" ]] || { echo "Cancelled"; return; }
  fi
  [[ "$svc" == "backend" || "$svc" == "all" ]] && : > "$BACKEND_LOG"
  [[ "$svc" == "frontend" || "$svc" == "all" ]] && : > "$FRONTEND_LOG"
  echo "Logs cleared for $svc"
}

run_migrations() {
  echo "Running migrations..."; (cd "$ROOT_DIR/backend" && npm run migrate)
}

reset_db() {
  echo "⚠️  This will drop/recreate the DB."; if [[ "$YES" == false ]]; then read -r -p "Type 'yes' to confirm: " ans; [[ "$ans" == "yes" ]] || { echo "Cancelled"; return; }; fi
  (cd "$ROOT_DIR/backend" && npm run db:reset)
}

run_tests() {
  local svc="$1"
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    echo "=== Backend Tests ==="; (cd "$ROOT_DIR/backend" && npm run test:smoke && npm run test:integration)
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    echo "=== Frontend Tests ==="; (cd "$ROOT_DIR/frontend" && npm test)
  fi
}

build_projects() {
  local svc="$1"
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    echo "Building backend..."; (cd "$ROOT_DIR/backend" && npm run build)
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    echo "Building frontend..."; (cd "$ROOT_DIR/frontend" && npm run build)
  fi
  echo "Build completed."
}

parse_args "$@"
case "$ACTION" in
  start) start_service "$TARGET"; show_status ;;
  stop) stop_service "$TARGET"; show_status ;;
  restart) stop_service "$TARGET"; sleep 2; start_service "$TARGET"; show_status ;;
  status) show_status ;;
  logs) show_logs "$TARGET" ;;
  migrate) run_migrations ;;
  reset-db) reset_db ;;
  test) run_tests "$TARGET" ;;
  clear-logs) clear_logs "$TARGET" ;;
  build) build_projects "$TARGET" ;;
  *) usage ;;
esac
