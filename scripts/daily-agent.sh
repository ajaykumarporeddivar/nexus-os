#!/usr/bin/env bash
# =============================================================================
# NEXUS OS v11 — Daily AI Upgrade Agent Runner
# Runs: (1) production test suite, (2) AI agent upgrade, (3) logs report
#
# Schedule via Windows Task Scheduler (run daily at 07:00 AM):
#   Action: bash.exe
#   Args:   "D:\NEXUS_NEW\nexus-os\scripts\daily-agent.sh"
#   Start:  D:\NEXUS_NEW\nexus-os
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$ROOT/apps/web"
REPORT_DIR="$ROOT/scripts/reports"
DATE="$(date +%Y-%m-%d)"
LOG="$REPORT_DIR/$DATE.json"

mkdir -p "$REPORT_DIR"

# Load env
set -a
# shellcheck disable=SC1091
source "$WEB_DIR/.env.local" 2>/dev/null
set +a

CRON_SECRET="${CRON_SECRET:-nexus-cron-secret-2026}"
START_TIMEOUT_SECONDS="${NEXUS_DEV_START_TIMEOUT_SECONDS:-480}"
START_POLL_SECONDS=5
LOCK_DIR="$WEB_DIR/.next/nexus-dev-start.lock"

echo "[$(date +%T)] NEXUS Daily Agent starting..."

# ─── 1. Find or start dev server (tries 3000 then 3001) ───────────────────────
BASE=""
for port in 3000 3001; do
  if curl -sf "http://localhost:$port/api/ping" | grep -q '"ok":true' 2>/dev/null; then
    BASE="http://localhost:$port"
    echo "[$(date +%T)] Server found on port $port"
    break
  fi
done

if [[ -z "$BASE" ]]; then
  echo "[$(date +%T)] Dev server not running. Starting..."
  if [[ -d "$LOCK_DIR" ]]; then
    LOCK_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [[ -z "$LOCK_PID" ]] || ! kill -0 "$LOCK_PID" 2>/dev/null; then
      echo "[$(date +%T)] Removing stale dev-server lock."
      rm -rf "$LOCK_DIR"
    fi
  fi
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[$(date +%T)] Another startup owns the dev-server lock. Waiting for it..."
  else
    echo "$$" > "$LOCK_DIR/pid"
    # Never delete .next while a dev server may still be compiling or serving from it.
    # Concurrent deletion was causing missing build-manifest/vendor-chunk/page files.
    cd "$WEB_DIR" && pnpm dev -- -H 127.0.0.1 -p 3000 &
    DEV_PID=$!
  fi
  # Wait for Next.js to become ready (ping only — no DB dependency)
  echo "[$(date +%T)] Waiting for server to be ready..."
  ATTEMPTS=$((START_TIMEOUT_SECONDS / START_POLL_SECONDS))
  for i in $(seq 1 "$ATTEMPTS"); do
    sleep "$START_POLL_SECONDS"
    for port in 3000 3001; do
      if curl -sf "http://localhost:$port/api/ping" | grep -q '"ok":true' 2>/dev/null; then
        BASE="http://localhost:$port"
        echo "[$(date +%T)] Server ready on port $port after $((i * START_POLL_SECONDS))s"
        break 2
      fi
    done
    if [[ "$i" -eq "$ATTEMPTS" ]]; then
      echo "[$(date +%T)] ERROR: Server did not start within ${START_TIMEOUT_SECONDS}s. Aborting."
      [[ -n "$DEV_PID" ]] && kill "$DEV_PID" 2>/dev/null
      [[ -d "$LOCK_DIR" && -f "$LOCK_DIR/pid" && "$(cat "$LOCK_DIR/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK_DIR"
      exit 1
    fi
  done
  [[ -d "$LOCK_DIR" && -f "$LOCK_DIR/pid" && "$(cat "$LOCK_DIR/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK_DIR"
fi

# Log full health check result (non-blocking — DB may be waking up)
HEALTH_CHECK=$(curl -s "$BASE/api/health" 2>/dev/null || echo '{}')
echo "[$(date +%T)] Health: $(echo "$HEALTH_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'degraded — ' + ', '.join(k for k,v in d.get('checks',{}).items() if not v.get('ok')))" 2>/dev/null || echo 'check failed')"

# ─── 2. Run full production test suite ────────────────────────────────────────
echo "[$(date +%T)] Running production test suite..."
TEST_OUTPUT=$(CRON_SECRET="$CRON_SECRET" bash "$ROOT/../test-production.sh" 2>&1)

PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "✓ PASS" 2>/dev/null; true)
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "✗ FAIL" 2>/dev/null; true)
WARN_COUNT=$(echo "$TEST_OUTPUT" | grep -c "⚠ WARN" 2>/dev/null; true)
PASS_COUNT=${PASS_COUNT:-0}
FAIL_COUNT=${FAIL_COUNT:-0}
WARN_COUNT=${WARN_COUNT:-0}
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

echo "[$(date +%T)] Test result: PASS=$PASS_COUNT FAIL=$FAIL_COUNT WARN=$WARN_COUNT"

# ─── 3. Trigger AI agent ──────────────────────────────────────────────────────
echo "[$(date +%T)] Triggering AI upgrade agent..."
AGENT_RESPONSE=$(curl -s -X POST "$BASE/api/agent/run" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null)

HEALTH_SCORE=$(echo "$AGENT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('healthScore','?'))" 2>/dev/null || echo "?")
ANALYSIS=$(echo "$AGENT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('analysis','?'))" 2>/dev/null || echo "?")
AUTO_FIXES=$(echo "$AGENT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); fixes=d.get('data',{}).get('autoFixes',[]); print(len([f for f in fixes if f.get('applied')]))" 2>/dev/null || echo 0)

echo "[$(date +%T)] Agent health score: $HEALTH_SCORE"
echo "[$(date +%T)] Auto-fixes applied: $AUTO_FIXES"

# ─── 4. Trigger all daily cron jobs ───────────────────────────────────────────
echo "[$(date +%T)] Running daily cron jobs..."

curl -sf -X POST "$BASE/api/regime" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}' > /dev/null && echo "  ✓ regime classified"
curl -sf -X POST "$BASE/api/learning/cycle" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}' > /dev/null && echo "  ✓ learning cycle"
curl -sf -X POST "$BASE/api/learning/update-deltas" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}' > /dev/null && echo "  ✓ delta update"
curl -sf -X POST "$BASE/api/learning/quarantine" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}' > /dev/null && echo "  ✓ quarantine scan"
curl -sf -X POST "$BASE/api/trending" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"niche":"AI agency automation"}' > /dev/null && echo "  ✓ trending refresh"

# Weekly learning (runs on Monday)
if [[ "$(date +%u)" == "1" ]]; then
  curl -sf -X POST "$BASE/api/learning/weekly" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}' > /dev/null && echo "  ✓ weekly learning (Monday)"
fi

# ─── 5. Write daily report ────────────────────────────────────────────────────
cat > "$LOG" <<JSONEOF
{
  "date": "$DATE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "testSuite": {
    "pass": $PASS_COUNT,
    "fail": $FAIL_COUNT,
    "warn": $WARN_COUNT,
    "total": $TOTAL
  },
  "agent": {
    "healthScore": "$HEALTH_SCORE",
    "autoFixesApplied": $AUTO_FIXES,
    "analysis": $(echo "$ANALYSIS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '"n/a"')
  }
}
JSONEOF

echo "[$(date +%T)] Report saved: $LOG"

# ─── 6. Cleanup old reports (keep 30 days) ────────────────────────────────────
find "$REPORT_DIR" -name "*.json" -mtime +30 -delete 2>/dev/null

# ─── 7. Print summary ─────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════"
echo "  NEXUS OS DAILY REPORT — $DATE"
echo "══════════════════════════════════════"
echo "  Tests:       PASS=$PASS_COUNT FAIL=$FAIL_COUNT WARN=$WARN_COUNT"
echo "  Health:      $HEALTH_SCORE"
echo "  Auto-fixes:  $AUTO_FIXES applied"
echo "══════════════════════════════════════"
echo ""

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "FAILURES:"
  echo "$TEST_OUTPUT" | grep "✗ FAIL" | sed 's/^/  /'
fi

# Stop the dev server if this script started it. Leaving scheduled runs behind
# creates competing Next processes on Windows and can corrupt dev artifacts.
[[ -n "$DEV_PID" ]] && kill "$DEV_PID" 2>/dev/null

exit "$FAIL_COUNT"
