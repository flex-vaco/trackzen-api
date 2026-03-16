#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TrackZen — Full API Integration Test Suite
# ═══════════════════════════════════════════════════════════════════════
#
# Usage:
#   chmod +x tests/api-integration.sh
#   ./tests/api-integration.sh                  # run all tests
#   ./tests/api-integration.sh auth             # run only auth tests
#   ./tests/api-integration.sh timesheets       # run only timesheet tests
#
# Prerequisites:
#   - API server running on http://localhost:3001
#   - Database seeded (npm run prisma:seed)
#   - curl and jq installed
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${API_URL:-http://localhost:3001/api/v1}"
FILTER="${1:-all}"

# ── Colours ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Counters ───────────────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# ── State variables (populated during tests) ──────────────────────────
ADMIN_TOKEN=""
MANAGER_TOKEN=""
EMPLOYEE_TOKEN=""
REFRESH_COOKIE=""

TIMESHEET_ID=""
LEAVE_REQUEST_ID=""
PROJECT_ID=""
USER_ID=""
LEAVE_TYPE_ID=""
HOLIDAY_ID=""
NOTIFICATION_ID=""

# ── Helper functions ──────────────────────────────────────────────────

log_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

log_test() {
  ((TOTAL++))
  echo -ne "  ${CYAN}TEST ${TOTAL}:${NC} $1 ... "
}

pass() {
  ((PASS++))
  echo -e "${GREEN}PASS${NC}"
}

fail() {
  ((FAIL++))
  echo -e "${RED}FAIL${NC} — $1"
}

skip() {
  ((SKIP++))
  echo -e "${YELLOW}SKIP${NC} — $1"
}

# Generic HTTP request helper
# Usage: api METHOD /path [body] [token]
api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"

  local args=(-s -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}")
  args+=(-H "Content-Type: application/json")

  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi

  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi

  curl "${args[@]}" 2>/dev/null
}

# Extract HTTP status code from response
get_status() {
  echo "$1" | tail -1
}

# Extract JSON body from response
get_body() {
  echo "$1" | sed '$d'
}

# Assert HTTP status
assert_status() {
  local response="$1"
  local expected="$2"
  local actual
  actual=$(get_status "$response")

  if [[ "$actual" == "$expected" ]]; then
    pass
    return 0
  else
    local body
    body=$(get_body "$response")
    local msg
    msg=$(echo "$body" | jq -r '.error // .message // "unknown"' 2>/dev/null || echo "$body")
    fail "expected ${expected}, got ${actual} — ${msg}"
    return 1
  fi
}

# Extract a field from JSON body
json_field() {
  local response="$1"
  local field="$2"
  get_body "$response" | jq -r "$field" 2>/dev/null
}

# ═══════════════════════════════════════════════════════════════════════
#  1. HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════

test_health() {
  log_section "HEALTH CHECK"

  log_test "GET /health returns 200"
  local resp
  resp=$(curl -s -w "\n%{http_code}" "${BASE_URL%/api/v1}/health" 2>/dev/null)
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  2. AUTHENTICATION
# ═══════════════════════════════════════════════════════════════════════

test_auth() {
  log_section "AUTHENTICATION"

  # ── Register ──
  log_test "POST /auth/register — create new org"
  local resp
  resp=$(api POST "/auth/register" '{"orgName":"TestOrg","name":"Test Admin","email":"testadmin@test.com","password":"TestPass123!"}')
  assert_status "$resp" "201" || true

  # ── Login as Admin ──
  log_test "POST /auth/login — admin login"
  resp=$(api POST "/auth/login" '{"email":"admin@acme.com","password":"Password123!"}')
  if assert_status "$resp" "200"; then
    ADMIN_TOKEN=$(json_field "$resp" ".data.accessToken")
  fi

  # ── Login as Manager ──
  log_test "POST /auth/login — manager login"
  resp=$(api POST "/auth/login" '{"email":"manager@acme.com","password":"Password123!"}')
  if assert_status "$resp" "200"; then
    MANAGER_TOKEN=$(json_field "$resp" ".data.accessToken")
  fi

  # ── Login as Employee ──
  log_test "POST /auth/login — employee login"
  resp=$(api POST "/auth/login" '{"email":"employee@acme.com","password":"Password123!"}')
  if assert_status "$resp" "200"; then
    EMPLOYEE_TOKEN=$(json_field "$resp" ".data.accessToken")
  fi

  # ── Login with wrong password ──
  log_test "POST /auth/login — wrong password returns 401"
  resp=$(api POST "/auth/login" '{"email":"admin@acme.com","password":"WrongPass"}')
  assert_status "$resp" "401"

  # ── Login with missing fields ──
  log_test "POST /auth/login — missing email returns 400"
  resp=$(api POST "/auth/login" '{"password":"Password123!"}')
  assert_status "$resp" "400"

  # ── Access without token ──
  log_test "GET /timesheets — no token returns 401"
  resp=$(api GET "/timesheets")
  assert_status "$resp" "401"

  # ── Access with invalid token ──
  log_test "GET /timesheets — invalid token returns 401"
  resp=$(api GET "/timesheets" "" "invalid.token.here")
  assert_status "$resp" "401"

  # ── Logout ──
  log_test "POST /auth/logout — logout"
  resp=$(api POST "/auth/logout" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # Re-login admin after logout
  resp=$(api POST "/auth/login" '{"email":"admin@acme.com","password":"Password123!"}')
  ADMIN_TOKEN=$(json_field "$resp" ".data.accessToken")
}

# ═══════════════════════════════════════════════════════════════════════
#  3. ORGANISATION SETTINGS
# ═══════════════════════════════════════════════════════════════════════

test_settings() {
  log_section "ORGANISATION SETTINGS"

  # ── Get settings (admin) ──
  log_test "GET /settings — admin can read"
  local resp
  resp=$(api GET "/settings" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Update settings ──
  log_test "PUT /settings — update maxHoursPerDay"
  resp=$(api PUT "/settings" '{"maxHoursPerDay":12,"allowBackdated":true,"allowCopyWeek":true}' "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Employee cannot access settings ──
  log_test "GET /settings — employee gets 403"
  resp=$(api GET "/settings" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Manager cannot access settings ──
  log_test "PUT /settings — manager gets 403"
  resp=$(api PUT "/settings" '{"maxHoursPerDay":10}' "$MANAGER_TOKEN")
  assert_status "$resp" "403"

  # ── Invalid setting value ──
  log_test "PUT /settings — invalid maxHoursPerDay returns 400"
  resp=$(api PUT "/settings" '{"maxHoursPerDay":30}' "$ADMIN_TOKEN")
  assert_status "$resp" "400"

  # Reset to sensible defaults for remaining tests
  api PUT "/settings" '{"maxHoursPerDay":24,"maxHoursPerWeek":168,"mandatoryDesc":false,"allowBackdated":true,"allowCopyWeek":true}' "$ADMIN_TOKEN" >/dev/null
}

# ═══════════════════════════════════════════════════════════════════════
#  4. PROJECTS
# ═══════════════════════════════════════════════════════════════════════

test_projects() {
  log_section "PROJECTS"

  # ── List projects ──
  log_test "GET /projects — list all"
  local resp
  resp=$(api GET "/projects" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Create project ──
  log_test "POST /projects — create new project"
  resp=$(api POST "/projects" '{"code":"PRJ-TEST-001","name":"Test Project","client":"Test Client"}' "$ADMIN_TOKEN")
  if assert_status "$resp" "201"; then
    PROJECT_ID=$(json_field "$resp" ".data.id")
  fi

  # ── Get single project ──
  log_test "GET /projects/:id — get created project"
  resp=$(api GET "/projects/${PROJECT_ID}" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Update project ──
  log_test "PUT /projects/:id — update project name"
  resp=$(api PUT "/projects/${PROJECT_ID}" '{"name":"Updated Test Project"}' "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Duplicate code ──
  log_test "POST /projects — duplicate code returns 409"
  resp=$(api POST "/projects" '{"code":"PRJ-TEST-001","name":"Dup Project","client":"Dup"}' "$ADMIN_TOKEN")
  assert_status "$resp" "409"

  # ── Employee cannot create ──
  log_test "POST /projects — employee gets 403"
  resp=$(api POST "/projects" '{"code":"PRJ-EMP","name":"Emp Project","client":"X"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Employee can list ──
  log_test "GET /projects — employee can list"
  resp=$(api GET "/projects" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  5. USERS
# ═══════════════════════════════════════════════════════════════════════

test_users() {
  log_section "USERS"

  # ── List users ──
  log_test "GET /users — admin can list"
  local resp
  resp=$(api GET "/users" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Create user ──
  log_test "POST /users — create employee"
  resp=$(api POST "/users" '{"name":"New Employee","email":"newemployee@acme.com","password":"Password123!","role":"EMPLOYEE","department":"QA"}' "$ADMIN_TOKEN")
  if assert_status "$resp" "201"; then
    USER_ID=$(json_field "$resp" ".data.id")
  fi

  # ── Update user ──
  log_test "PUT /users/:id — update department"
  resp=$(api PUT "/users/${USER_ID}" '{"department":"Engineering"}' "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Duplicate email ──
  log_test "POST /users — duplicate email returns 409"
  resp=$(api POST "/users" '{"name":"Dup User","email":"newemployee@acme.com","password":"Password123!"}' "$ADMIN_TOKEN")
  assert_status "$resp" "409"

  # ── Employee cannot list users ──
  log_test "GET /users — employee gets 403"
  resp=$(api GET "/users" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Delete (deactivate) user ──
  log_test "DELETE /users/:id — deactivate user"
  resp=$(api DELETE "/users/${USER_ID}" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  6. TEAM / MANAGER-EMPLOYEE
# ═══════════════════════════════════════════════════════════════════════

test_team() {
  log_section "TEAM RELATIONSHIPS"

  # ── My managers (employee) ──
  log_test "GET /team/my-managers — employee sees managers"
  local resp
  resp=$(api GET "/team/my-managers" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── My reports (manager) ──
  log_test "GET /team/my-reports — manager sees reports"
  resp=$(api GET "/team/my-reports" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Employee cannot see reports ──
  log_test "GET /team/my-reports — employee gets 403"
  resp=$(api GET "/team/my-reports" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"
}

# ═══════════════════════════════════════════════════════════════════════
#  7. HOLIDAYS
# ═══════════════════════════════════════════════════════════════════════

test_holidays() {
  log_section "HOLIDAYS"

  # ── List holidays ──
  log_test "GET /holidays — all users can list"
  local resp
  resp=$(api GET "/holidays" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Create holiday ──
  log_test "POST /holidays — admin creates holiday"
  resp=$(api POST "/holidays" '{"name":"Test Holiday","date":"2026-07-04","recurring":false}' "$ADMIN_TOKEN")
  if assert_status "$resp" "201"; then
    HOLIDAY_ID=$(json_field "$resp" ".data.id")
  fi

  # ── Employee cannot create ──
  log_test "POST /holidays — employee gets 403"
  resp=$(api POST "/holidays" '{"name":"Emp Holiday","date":"2026-08-01"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Delete holiday ──
  log_test "DELETE /holidays/:id — admin deletes"
  resp=$(api DELETE "/holidays/${HOLIDAY_ID}" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  8. TIMESHEETS
# ═══════════════════════════════════════════════════════════════════════

test_timesheets() {
  log_section "TIMESHEETS"

  # Use a future week to avoid back-dating issues
  local WEEK_START="2026-06-01"
  local WEEK_START_2="2026-06-08"
  local WEEK_START_PREV="2026-05-25"

  # ── Create timesheet ──
  log_test "POST /timesheets — create draft"
  local resp
  resp=$(api POST "/timesheets" "{\"weekStartDate\":\"${WEEK_START}\"}" "$EMPLOYEE_TOKEN")
  if assert_status "$resp" "201"; then
    TIMESHEET_ID=$(json_field "$resp" ".data.id")
  fi

  # ── Duplicate week ──
  log_test "POST /timesheets — duplicate week returns 409"
  resp=$(api POST "/timesheets" "{\"weekStartDate\":\"${WEEK_START}\"}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "409"

  # ── List timesheets ──
  log_test "GET /timesheets — list own"
  resp=$(api GET "/timesheets" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── List with status filter ──
  log_test "GET /timesheets?status=DRAFT — filter by status"
  resp=$(api GET "/timesheets?status=DRAFT" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Get single ──
  log_test "GET /timesheets/:id — get timesheet"
  resp=$(api GET "/timesheets/${TIMESHEET_ID}" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Get project ID for entries ──
  local projResp
  projResp=$(api GET "/projects" "" "$EMPLOYEE_TOKEN")
  local PROJ_ID
  PROJ_ID=$(get_body "$projResp" | jq -r '.data[0].id' 2>/dev/null)

  # ── Update with entries ──
  log_test "PUT /timesheets/:id — add time entries"
  resp=$(api PUT "/timesheets/${TIMESHEET_ID}" "{\"entries\":[{\"projectId\":${PROJ_ID},\"billable\":true,\"monHours\":8,\"tueHours\":8,\"wedHours\":8,\"thuHours\":8,\"friHours\":8}]}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Verify totals ──
  log_test "GET /timesheets/:id — verify totalHours = 40"
  resp=$(api GET "/timesheets/${TIMESHEET_ID}" "" "$EMPLOYEE_TOKEN")
  local totalHours
  totalHours=$(json_field "$resp" ".data.totalHours")
  if [[ "$totalHours" == "40" ]]; then
    pass
  else
    fail "expected totalHours=40, got ${totalHours}"
  fi

  # ── Submit timesheet ──
  log_test "POST /timesheets/:id/submit — submit for approval"
  resp=$(api POST "/timesheets/${TIMESHEET_ID}/submit" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Cannot edit submitted ──
  log_test "PUT /timesheets/:id — submitted timesheet returns 403"
  resp=$(api PUT "/timesheets/${TIMESHEET_ID}" "{\"entries\":[{\"projectId\":${PROJ_ID},\"monHours\":4}]}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Cannot delete submitted ──
  log_test "DELETE /timesheets/:id — submitted returns 403"
  resp=$(api DELETE "/timesheets/${TIMESHEET_ID}" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Cannot re-submit ──
  log_test "POST /timesheets/:id/submit — already submitted returns 400"
  resp=$(api POST "/timesheets/${TIMESHEET_ID}/submit" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "400"

  # ── Copy previous week: first create the previous week ──
  log_test "POST /timesheets — create prev week for copy test"
  resp=$(api POST "/timesheets" "{\"weekStartDate\":\"${WEEK_START_PREV}\"}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "201" || true
  local PREV_TS_ID
  PREV_TS_ID=$(json_field "$resp" ".data.id")

  # Add entries to prev week
  if [[ -n "$PREV_TS_ID" && "$PREV_TS_ID" != "null" ]]; then
    api PUT "/timesheets/${PREV_TS_ID}" "{\"entries\":[{\"projectId\":${PROJ_ID},\"billable\":true,\"monHours\":4}]}" "$EMPLOYEE_TOKEN" >/dev/null
  fi

  # ── Copy previous week ──
  log_test "POST /timesheets/copy-previous-week — copy structure"
  resp=$(api POST "/timesheets/copy-previous-week" "{\"targetWeekStartDate\":\"${WEEK_START_2}\"}" "$EMPLOYEE_TOKEN")
  # This might fail if prev week timesheet doesn't exist at the exact expected offset
  assert_status "$resp" "201" || assert_status "$resp" "404" || true
}

# ═══════════════════════════════════════════════════════════════════════
#  9. TIMESHEET APPROVALS
# ═══════════════════════════════════════════════════════════════════════

test_approvals() {
  log_section "TIMESHEET APPROVALS"

  # ── List pending ──
  log_test "GET /approvals — manager sees submitted"
  local resp
  resp=$(api GET "/approvals" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Stats ──
  log_test "GET /approvals/stats — approval stats"
  resp=$(api GET "/approvals/stats" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Employee cannot access ──
  log_test "GET /approvals — employee gets 403"
  resp=$(api GET "/approvals" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  if [[ -n "$TIMESHEET_ID" && "$TIMESHEET_ID" != "null" ]]; then
    # ── Reject timesheet ──
    log_test "POST /approvals/:id/reject — reject with reason"
    resp=$(api POST "/approvals/${TIMESHEET_ID}/reject" '{"reason":"Please add descriptions"}' "$MANAGER_TOKEN")
    assert_status "$resp" "200"

    # ── Verify status changed to REJECTED ──
    log_test "GET /timesheets/:id — verify status is REJECTED"
    resp=$(api GET "/timesheets/${TIMESHEET_ID}" "" "$EMPLOYEE_TOKEN")
    local status
    status=$(json_field "$resp" ".data.status")
    if [[ "$status" == "REJECTED" ]]; then
      pass
    else
      fail "expected REJECTED, got ${status}"
    fi

    # ── Re-edit rejected timesheet ──
    log_test "PUT /timesheets/:id — edit rejected timesheet"
    local projResp
    projResp=$(api GET "/projects" "" "$EMPLOYEE_TOKEN")
    local PROJ_ID
    PROJ_ID=$(get_body "$projResp" | jq -r '.data[0].id' 2>/dev/null)
    resp=$(api PUT "/timesheets/${TIMESHEET_ID}" "{\"entries\":[{\"projectId\":${PROJ_ID},\"billable\":true,\"monHours\":8,\"monDesc\":\"Dev work\",\"tueHours\":8,\"tueDesc\":\"Dev work\",\"wedHours\":8,\"wedDesc\":\"Dev work\",\"thuHours\":8,\"thuDesc\":\"Dev work\",\"friHours\":8,\"friDesc\":\"Dev work\"}]}" "$EMPLOYEE_TOKEN")
    assert_status "$resp" "200"

    # ── Re-submit ──
    log_test "POST /timesheets/:id/submit — re-submit after rejection"
    resp=$(api POST "/timesheets/${TIMESHEET_ID}/submit" "" "$EMPLOYEE_TOKEN")
    assert_status "$resp" "200"

    # ── Approve timesheet ──
    log_test "POST /approvals/:id/approve — approve timesheet"
    resp=$(api POST "/approvals/${TIMESHEET_ID}/approve" "" "$MANAGER_TOKEN")
    assert_status "$resp" "200"

    # ── Verify approved ──
    log_test "GET /timesheets/:id — verify status is APPROVED"
    resp=$(api GET "/timesheets/${TIMESHEET_ID}" "" "$EMPLOYEE_TOKEN")
    status=$(json_field "$resp" ".data.status")
    if [[ "$status" == "APPROVED" ]]; then
      pass
    else
      fail "expected APPROVED, got ${status}"
    fi

    # ── Cannot edit approved ──
    log_test "PUT /timesheets/:id — approved timesheet returns 403"
    resp=$(api PUT "/timesheets/${TIMESHEET_ID}" "{\"entries\":[{\"projectId\":${PROJ_ID},\"monHours\":4}]}" "$EMPLOYEE_TOKEN")
    assert_status "$resp" "403"
  else
    skip "no timesheet to test approvals"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  10. LEAVE TYPES
# ═══════════════════════════════════════════════════════════════════════

test_leave_types() {
  log_section "LEAVE TYPES"

  # ── List leave types ──
  log_test "GET /leave/types — all users can list"
  local resp
  resp=$(api GET "/leave/types" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Create leave type ──
  log_test "POST /leave/types — admin creates type"
  resp=$(api POST "/leave/types" '{"name":"Compassionate","annualQuota":5,"paid":true,"requiresDoc":false}' "$ADMIN_TOKEN")
  if assert_status "$resp" "201"; then
    LEAVE_TYPE_ID=$(json_field "$resp" ".data.id")
  fi

  # ── Update leave type ──
  log_test "PUT /leave/types/:id — update quota"
  resp=$(api PUT "/leave/types/${LEAVE_TYPE_ID}" '{"annualQuota":3}' "$ADMIN_TOKEN")
  assert_status "$resp" "200"

  # ── Employee cannot create ──
  log_test "POST /leave/types — employee gets 403"
  resp=$(api POST "/leave/types" '{"name":"Custom","annualQuota":5}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Deactivate leave type ──
  log_test "DELETE /leave/types/:id — deactivate"
  resp=$(api DELETE "/leave/types/${LEAVE_TYPE_ID}" "" "$ADMIN_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  11. LEAVE BALANCES
# ═══════════════════════════════════════════════════════════════════════

test_leave_balances() {
  log_section "LEAVE BALANCES"

  # ── Own balances ──
  log_test "GET /leave/balances — employee sees own"
  local resp
  resp=$(api GET "/leave/balances" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Manager views user balance ──
  log_test "GET /leave/balances/:userId — manager can view"
  # Get employee user ID from token
  local empResp
  empResp=$(api GET "/timesheets" "" "$EMPLOYEE_TOKEN")
  # We'll use a different approach — get users list
  local usersResp
  usersResp=$(api GET "/users" "" "$ADMIN_TOKEN")
  local EMP_USER_ID
  EMP_USER_ID=$(get_body "$usersResp" | jq -r '.data[] | select(.email=="employee@acme.com") | .id' 2>/dev/null)

  if [[ -n "$EMP_USER_ID" && "$EMP_USER_ID" != "null" ]]; then
    resp=$(api GET "/leave/balances/${EMP_USER_ID}" "" "$MANAGER_TOKEN")
    assert_status "$resp" "200"
  else
    skip "could not determine employee user ID"
  fi

  # ── Employee cannot view others ──
  log_test "GET /leave/balances/:userId — employee gets 403"
  resp=$(api GET "/leave/balances/1" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"
}

# ═══════════════════════════════════════════════════════════════════════
#  12. LEAVE REQUESTS
# ═══════════════════════════════════════════════════════════════════════

test_leave() {
  log_section "LEAVE REQUESTS"

  # Get annual leave type ID
  local typesResp
  typesResp=$(api GET "/leave/types" "" "$EMPLOYEE_TOKEN")
  local ANNUAL_TYPE_ID
  ANNUAL_TYPE_ID=$(get_body "$typesResp" | jq -r '.data[] | select(.name=="Annual") | .id' 2>/dev/null)
  local SICK_TYPE_ID
  SICK_TYPE_ID=$(get_body "$typesResp" | jq -r '.data[] | select(.name=="Sick") | .id' 2>/dev/null)

  if [[ -z "$ANNUAL_TYPE_ID" || "$ANNUAL_TYPE_ID" == "null" ]]; then
    skip "no Annual leave type found"
    return
  fi

  # ── Create leave request ──
  log_test "POST /leave — submit leave request"
  local resp
  resp=$(api POST "/leave" "{\"leaveTypeId\":${ANNUAL_TYPE_ID},\"startDate\":\"2026-07-20\",\"endDate\":\"2026-07-24\",\"reason\":\"Family vacation\"}" "$EMPLOYEE_TOKEN")
  if assert_status "$resp" "201"; then
    LEAVE_REQUEST_ID=$(json_field "$resp" ".data.id")
  fi

  # ── List leave requests ──
  log_test "GET /leave — list own requests"
  resp=$(api GET "/leave" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Get single request ──
  log_test "GET /leave/:id — get request details"
  resp=$(api GET "/leave/${LEAVE_REQUEST_ID}" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Verify business days ──
  log_test "GET /leave/:id — verify businessDays calculated"
  local bizDays
  bizDays=$(json_field "$resp" ".data.businessDays")
  if [[ -n "$bizDays" && "$bizDays" != "null" && "$bizDays" != "0" ]]; then
    pass
  else
    fail "businessDays not calculated (got ${bizDays})"
  fi

  # ── Update pending request ──
  log_test "PUT /leave/:id — update reason"
  resp=$(api PUT "/leave/${LEAVE_REQUEST_ID}" '{"reason":"Updated: family trip"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # ── Overlapping leave ──
  log_test "POST /leave — overlapping dates returns 409"
  resp=$(api POST "/leave" "{\"leaveTypeId\":${ANNUAL_TYPE_ID},\"startDate\":\"2026-07-22\",\"endDate\":\"2026-07-25\"}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "409"

  # ── Invalid date range ──
  log_test "POST /leave — end before start returns 400"
  resp=$(api POST "/leave" "{\"leaveTypeId\":${ANNUAL_TYPE_ID},\"startDate\":\"2026-08-10\",\"endDate\":\"2026-08-05\"}" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "400"

  # ── Create another request for cancel test ──
  log_test "POST /leave — create second request for cancel test"
  local resp2
  resp2=$(api POST "/leave" "{\"leaveTypeId\":${ANNUAL_TYPE_ID},\"startDate\":\"2026-09-14\",\"endDate\":\"2026-09-18\",\"reason\":\"To be cancelled\"}" "$EMPLOYEE_TOKEN")
  local CANCEL_ID
  if assert_status "$resp2" "201"; then
    CANCEL_ID=$(json_field "$resp2" ".data.id")
  fi

  # ── Cancel leave ──
  if [[ -n "$CANCEL_ID" && "$CANCEL_ID" != "null" ]]; then
    log_test "POST /leave/:id/cancel — cancel pending request"
    resp=$(api POST "/leave/${CANCEL_ID}/cancel" '{"cancelReason":"Plans changed"}' "$EMPLOYEE_TOKEN")
    assert_status "$resp" "200"

    # ── Cannot cancel already cancelled ──
    log_test "POST /leave/:id/cancel — already cancelled returns 400"
    resp=$(api POST "/leave/${CANCEL_ID}/cancel" '{"cancelReason":"Again"}' "$EMPLOYEE_TOKEN")
    assert_status "$resp" "400"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  13. LEAVE APPROVALS
# ═══════════════════════════════════════════════════════════════════════

test_leave_approvals() {
  log_section "LEAVE APPROVALS"

  # ── List pending ──
  log_test "GET /leave/approvals — manager sees pending"
  local resp
  resp=$(api GET "/leave/approvals" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Stats ──
  log_test "GET /leave/approvals/stats — approval stats"
  resp=$(api GET "/leave/approvals/stats" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Employee cannot access ──
  log_test "GET /leave/approvals — employee gets 403"
  resp=$(api GET "/leave/approvals" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  if [[ -n "$LEAVE_REQUEST_ID" && "$LEAVE_REQUEST_ID" != "null" ]]; then
    # ── Approve leave ──
    log_test "POST /leave/approvals/:id/approve — approve leave"
    resp=$(api POST "/leave/approvals/${LEAVE_REQUEST_ID}/approve" '{"comment":"Enjoy your vacation!"}' "$MANAGER_TOKEN")
    assert_status "$resp" "200"

    # ── Verify status ──
    log_test "GET /leave/:id — verify status APPROVED"
    resp=$(api GET "/leave/${LEAVE_REQUEST_ID}" "" "$EMPLOYEE_TOKEN")
    local status
    status=$(json_field "$resp" ".data.status")
    if [[ "$status" == "APPROVED" ]]; then
      pass
    else
      fail "expected APPROVED, got ${status}"
    fi

    # ── Cannot cancel approved ──
    log_test "POST /leave/:id/cancel — cannot cancel approved"
    resp=$(api POST "/leave/${LEAVE_REQUEST_ID}/cancel" '{"cancelReason":"Changed mind"}' "$EMPLOYEE_TOKEN")
    assert_status "$resp" "400"
  fi

  # ── Test reject flow with a new request ──
  local typesResp
  typesResp=$(api GET "/leave/types" "" "$EMPLOYEE_TOKEN")
  local ANNUAL_ID
  ANNUAL_ID=$(get_body "$typesResp" | jq -r '.data[] | select(.name=="Annual") | .id' 2>/dev/null)

  if [[ -n "$ANNUAL_ID" && "$ANNUAL_ID" != "null" ]]; then
    log_test "POST /leave — create request for reject test"
    local resp2
    resp2=$(api POST "/leave" "{\"leaveTypeId\":${ANNUAL_ID},\"startDate\":\"2026-10-12\",\"endDate\":\"2026-10-16\",\"reason\":\"Will be rejected\"}" "$EMPLOYEE_TOKEN")
    local REJECT_ID
    if assert_status "$resp2" "201"; then
      REJECT_ID=$(json_field "$resp2" ".data.id")
    fi

    if [[ -n "$REJECT_ID" && "$REJECT_ID" != "null" ]]; then
      log_test "POST /leave/approvals/:id/reject — reject with comment"
      resp=$(api POST "/leave/approvals/${REJECT_ID}/reject" '{"comment":"Busy period, please reschedule"}' "$MANAGER_TOKEN")
      assert_status "$resp" "200"

      log_test "GET /leave/:id — verify status REJECTED"
      resp=$(api GET "/leave/${REJECT_ID}" "" "$EMPLOYEE_TOKEN")
      local rstatus
      rstatus=$(json_field "$resp" ".data.status")
      if [[ "$rstatus" == "REJECTED" ]]; then
        pass
      else
        fail "expected REJECTED, got ${rstatus}"
      fi
    fi
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  14. LEAVE CALENDAR
# ═══════════════════════════════════════════════════════════════════════

test_leave_calendar() {
  log_section "LEAVE CALENDAR"

  log_test "GET /leave/calendar — manager can view"
  local resp
  resp=$(api GET "/leave/calendar?from=2026-07-01&to=2026-07-31" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  log_test "GET /leave/calendar — employee gets 403"
  resp=$(api GET "/leave/calendar?from=2026-07-01&to=2026-07-31" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"
}

# ═══════════════════════════════════════════════════════════════════════
#  15. NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════

test_notifications() {
  log_section "NOTIFICATIONS"

  # ── List notifications ──
  log_test "GET /notifications — list own"
  local resp
  resp=$(api GET "/notifications" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"

  # Get first notification ID if exists
  NOTIFICATION_ID=$(json_field "$resp" ".data[0].id")

  if [[ -n "$NOTIFICATION_ID" && "$NOTIFICATION_ID" != "null" ]]; then
    # ── Mark single as read ──
    log_test "PUT /notifications/:id/read — mark one as read"
    resp=$(api PUT "/notifications/${NOTIFICATION_ID}/read" "" "$EMPLOYEE_TOKEN")
    assert_status "$resp" "200"
  else
    log_test "PUT /notifications/:id/read — mark one as read"
    skip "no notifications to mark"
  fi

  # ── Mark all as read ──
  log_test "PUT /notifications/read-all — mark all as read"
  resp=$(api PUT "/notifications/read-all" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  16. REPORTS
# ═══════════════════════════════════════════════════════════════════════

test_reports() {
  log_section "REPORTS"

  # ── Get report data ──
  log_test "GET /reports — manager can view"
  local resp
  resp=$(api GET "/reports" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── With date filter ──
  log_test "GET /reports?from=&to= — filtered by date"
  resp=$(api GET "/reports?from=2026-01-01&to=2026-12-31" "" "$MANAGER_TOKEN")
  assert_status "$resp" "200"

  # ── Export CSV ──
  log_test "GET /reports/export?format=csv — CSV export"
  resp=$(api GET "/reports/export?format=csv" "" "$MANAGER_TOKEN")
  local status
  status=$(get_status "$resp")
  if [[ "$status" == "200" ]]; then
    pass
  else
    # Some exports may return different codes
    fail "expected 200, got ${status}"
  fi

  # ── Monthly export ──
  log_test "GET /reports/export-monthly — monthly Excel"
  resp=$(api GET "/reports/export-monthly?month=2026-06" "" "$MANAGER_TOKEN")
  status=$(get_status "$resp")
  if [[ "$status" == "200" ]]; then
    pass
  else
    fail "expected 200, got ${status}"
  fi

  # ── Employee cannot access reports ──
  log_test "GET /reports — employee gets 403"
  resp=$(api GET "/reports" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"
}

# ═══════════════════════════════════════════════════════════════════════
#  17. RBAC (Cross-cutting role checks)
# ═══════════════════════════════════════════════════════════════════════

test_rbac() {
  log_section "RBAC — CROSS-CUTTING CHECKS"

  # ── Employee cannot access admin routes ──
  log_test "GET /settings — employee blocked"
  local resp
  resp=$(api GET "/settings" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  log_test "POST /users — employee blocked"
  resp=$(api POST "/users" '{"name":"X","email":"x@x.com","password":"12345678"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  log_test "POST /holidays — employee blocked"
  resp=$(api POST "/holidays" '{"name":"X","date":"2026-12-31"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  log_test "POST /leave/types — employee blocked"
  resp=$(api POST "/leave/types" '{"name":"X"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "403"

  # ── Manager cannot access admin-only routes ──
  log_test "PUT /settings — manager blocked"
  resp=$(api PUT "/settings" '{"maxHoursPerDay":10}' "$MANAGER_TOKEN")
  assert_status "$resp" "403"

  log_test "POST /holidays — manager blocked"
  resp=$(api POST "/holidays" '{"name":"X","date":"2026-12-31"}' "$MANAGER_TOKEN")
  assert_status "$resp" "403"

  log_test "POST /leave/types — manager blocked"
  resp=$(api POST "/leave/types" '{"name":"X"}' "$MANAGER_TOKEN")
  assert_status "$resp" "403"
}

# ═══════════════════════════════════════════════════════════════════════
#  18. VALIDATION (Cross-cutting input validation)
# ═══════════════════════════════════════════════════════════════════════

test_validation() {
  log_section "INPUT VALIDATION"

  # ── Missing required fields ──
  log_test "POST /auth/register — empty body returns 400"
  local resp
  resp=$(api POST "/auth/register" '{}')
  assert_status "$resp" "400"

  log_test "POST /timesheets — missing weekStartDate returns 400"
  resp=$(api POST "/timesheets" '{}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "400"

  log_test "POST /projects — missing name returns 400"
  resp=$(api POST "/projects" '{"code":"X"}' "$ADMIN_TOKEN")
  assert_status "$resp" "400"

  log_test "POST /leave — missing leaveTypeId returns 400"
  resp=$(api POST "/leave" '{"startDate":"2026-11-01","endDate":"2026-11-05"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "400"

  log_test "POST /users — short password returns 400"
  resp=$(api POST "/users" '{"name":"X","email":"short@test.com","password":"123"}' "$ADMIN_TOKEN")
  assert_status "$resp" "400"

  # ── Invalid date format ──
  log_test "POST /timesheets — invalid date returns 400"
  resp=$(api POST "/timesheets" '{"weekStartDate":"not-a-date"}' "$EMPLOYEE_TOKEN")
  assert_status "$resp" "400"

  # ── Negative hours ──
  log_test "PUT /timesheets — negative hours returns 400"
  # We need a draft timesheet for this — create one for a future week
  local draftResp
  draftResp=$(api POST "/timesheets" '{"weekStartDate":"2026-11-02"}' "$EMPLOYEE_TOKEN")
  local DRAFT_ID
  DRAFT_ID=$(json_field "$draftResp" ".data.id")

  if [[ -n "$DRAFT_ID" && "$DRAFT_ID" != "null" ]]; then
    local projResp
    projResp=$(api GET "/projects" "" "$EMPLOYEE_TOKEN")
    local PID
    PID=$(get_body "$projResp" | jq -r '.data[0].id' 2>/dev/null)
    resp=$(api PUT "/timesheets/${DRAFT_ID}" "{\"entries\":[{\"projectId\":${PID},\"monHours\":-5}]}" "$EMPLOYEE_TOKEN")
    assert_status "$resp" "400"

    # Clean up draft
    api DELETE "/timesheets/${DRAFT_ID}" "" "$EMPLOYEE_TOKEN" >/dev/null 2>&1
  else
    skip "could not create draft for negative hours test"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  19. PAGINATION
# ═══════════════════════════════════════════════════════════════════════

test_pagination() {
  log_section "PAGINATION"

  log_test "GET /timesheets?page=1&limit=5 — paginated results"
  local resp
  resp=$(api GET "/timesheets?page=1&limit=5" "" "$EMPLOYEE_TOKEN")
  if assert_status "$resp" "200"; then
    local meta
    meta=$(json_field "$resp" ".meta")
    if [[ -n "$meta" && "$meta" != "null" ]]; then
      pass_extra="meta present"
    fi
  fi

  log_test "GET /timesheets?page=999 — empty page returns 200"
  resp=$(api GET "/timesheets?page=999&limit=5" "" "$EMPLOYEE_TOKEN")
  assert_status "$resp" "200"
}

# ═══════════════════════════════════════════════════════════════════════
#  CLEANUP
# ═══════════════════════════════════════════════════════════════════════

cleanup() {
  log_section "CLEANUP"

  # Delete test project
  if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "null" ]]; then
    log_test "DELETE /projects/:id — cleanup test project"
    local resp
    resp=$(api DELETE "/projects/${PROJECT_ID}" "" "$ADMIN_TOKEN")
    assert_status "$resp" "200"
  fi

  # Delete test org user (the registered one)
  # Not critical — seed reset will clean it up

  echo ""
  echo -e "  ${CYAN}Cleanup complete.${NC}"
}

# ═══════════════════════════════════════════════════════════════════════
#  RUNNER
# ═══════════════════════════════════════════════════════════════════════

run_suite() {
  echo ""
  echo -e "${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║        TrackZen — API Integration Test Suite             ║${NC}"
  echo -e "${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  Base URL:  ${CYAN}${BASE_URL}${NC}"
  echo -e "  Filter:    ${CYAN}${FILTER}${NC}"
  echo -e "  Date:      ${CYAN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"

  case "$FILTER" in
    all)
      test_health
      test_auth
      test_settings
      test_projects
      test_users
      test_team
      test_holidays
      test_timesheets
      test_approvals
      test_leave_types
      test_leave_balances
      test_leave
      test_leave_approvals
      test_leave_calendar
      test_notifications
      test_reports
      test_rbac
      test_validation
      test_pagination
      cleanup
      ;;
    auth)          test_auth ;;
    settings)      test_auth; test_settings ;;
    projects)      test_auth; test_projects ;;
    users)         test_auth; test_users ;;
    team)          test_auth; test_team ;;
    holidays)      test_auth; test_holidays ;;
    timesheets)    test_auth; test_timesheets ;;
    approvals)     test_auth; test_timesheets; test_approvals ;;
    leave-types)   test_auth; test_leave_types ;;
    leave-balances) test_auth; test_leave_balances ;;
    leave)         test_auth; test_leave ;;
    leave-approvals) test_auth; test_leave; test_leave_approvals ;;
    calendar)      test_auth; test_leave_calendar ;;
    notifications) test_auth; test_notifications ;;
    reports)       test_auth; test_reports ;;
    rbac)          test_auth; test_rbac ;;
    validation)    test_auth; test_validation ;;
    pagination)    test_auth; test_pagination ;;
    *)
      echo -e "${RED}Unknown filter: ${FILTER}${NC}"
      echo "Available: all, auth, settings, projects, users, team, holidays,"
      echo "  timesheets, approvals, leave-types, leave-balances, leave,"
      echo "  leave-approvals, calendar, notifications, reports, rbac, validation, pagination"
      exit 1
      ;;
  esac

  # ── Summary ──
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  TEST SUMMARY${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Total:   ${BOLD}${TOTAL}${NC}"
  echo -e "  ${GREEN}Passed:  ${PASS}${NC}"
  echo -e "  ${RED}Failed:  ${FAIL}${NC}"
  echo -e "  ${YELLOW}Skipped: ${SKIP}${NC}"
  echo ""

  if [[ "$FAIL" -gt 0 ]]; then
    echo -e "  ${RED}${BOLD}SOME TESTS FAILED${NC}"
    exit 1
  else
    echo -e "  ${GREEN}${BOLD}ALL TESTS PASSED${NC}"
    exit 0
  fi
}

# ── Entry point ────────────────────────────────────────────────────────
run_suite
