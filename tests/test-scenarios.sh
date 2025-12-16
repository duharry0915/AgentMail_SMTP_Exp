#!/bin/bash
#
# AgentMail SMTP Server Demo - Test Scenarios
#
# This script tests core authentication and session state scenarios.
#
# Note: Streamlined from 15 to 10 test scenarios.
# Removed redundant tests that returned identical error codes (535 5.7.8).
# For full test coverage including edge cases, see git history for removed scenarios 3, 5, 7, 8, 10.
#
# Prerequisites:
#   - Server running: npm start
#   - swaks installed: brew install swaks (macOS) or apt install swaks (Linux)
#   - nc (netcat) installed for session state tests
#
# Usage:
#   ./tests/test-scenarios.sh
#   ./tests/test-scenarios.sh 1    # Run only scenario 1
#   ./tests/test-scenarios.sh all  # Run all scenarios
#

# Configuration
SERVER="localhost"
PORT="2525"
FROM="test@agentmail.dev"
TO="test@example.com"

# Valid credentials
VALID_INBOX="inb_valid1234567890"
VALID_APIKEY="am_validkey12345678901234567890123456"

# Base64 encoded AUTH PLAIN (format: \0username\0password)
AUTH_PLAIN=$(printf '\0%s\0%s' "$VALID_INBOX" "$VALID_APIKEY" | base64)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print header
print_header() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

# Print scenario info
print_scenario() {
    echo -e "${YELLOW}Scenario $1: $2${NC}"
    echo -e "  Username: ${3}"
    echo -e "  Password: ${4:0:30}..."
    echo -e "  Expected: ${GREEN}$5${NC}"
    echo ""
}

# Print scenario info (simplified)
print_scenario_simple() {
    echo -e "${YELLOW}Scenario $1: $2${NC}"
    echo -e "  Expected: ${GREEN}$3${NC}"
    echo ""
}

# Check if swaks is installed
check_swaks() {
    if ! command -v swaks &> /dev/null; then
        echo -e "${RED}Error: swaks is not installed${NC}"
        echo "Install with:"
        echo "  macOS: brew install swaks"
        echo "  Linux: apt install swaks"
        exit 1
    fi
}

# Check if nc is installed
check_nc() {
    if ! command -v nc &> /dev/null; then
        echo -e "${YELLOW}Warning: nc (netcat) is not installed${NC}"
        echo "Session state tests (11-14) require nc"
        echo "Install with:"
        echo "  macOS: Usually pre-installed"
        echo "  Linux: apt install netcat-openbsd"
    fi
}

# Check if server is running
check_server() {
    if ! nc -z $SERVER $PORT 2>/dev/null; then
        echo -e "${RED}Error: SMTP server is not running on $SERVER:$PORT${NC}"
        echo "Start the server with: npm start"
        exit 1
    fi
    echo -e "${GREEN}Server is running on $SERVER:$PORT${NC}"
}

# ============================================================================
# CORE AUTHENTICATION TEST SCENARIOS
# ============================================================================

scenario_1() {
    print_scenario "1" "Successful Authentication" \
        "inb_valid1234567890" \
        "am_validkey12345678901234567890123456" \
        "235 2.7.0 Authentication successful"

    swaks --to "$TO" \
          --from "$FROM" \
          --server "$SERVER:$PORT" \
          --auth PLAIN \
          --auth-user "inb_valid1234567890" \
          --auth-password "am_validkey12345678901234567890123456" \
          --h-Subject "Test Email - Success" \
          --body "This is a test email sent via SMTP." \
          --timeout 10 \
          2>&1
}

scenario_2() {
    print_scenario "2" "Invalid API Key Format (too short)" \
        "inb_valid1234567890" \
        "am_short" \
        "535 5.7.8 Authentication credentials invalid"

    swaks --to "$TO" \
          --from "$FROM" \
          --server "$SERVER:$PORT" \
          --auth PLAIN \
          --auth-user "inb_valid1234567890" \
          --auth-password "am_short" \
          --timeout 10 \
          --quit-after AUTH \
          2>&1
}

scenario_4() {
    print_scenario "4" "Inbox Not Found" \
        "inb_notexist123456" \
        "am_validkey12345678901234567890123456" \
        "535 5.7.8 Authentication credentials invalid"

    swaks --to "$TO" \
          --from "$FROM" \
          --server "$SERVER:$PORT" \
          --auth PLAIN \
          --auth-user "inb_notexist123456" \
          --auth-password "am_validkey12345678901234567890123456" \
          --timeout 10 \
          --quit-after AUTH \
          2>&1
}

scenario_6() {
    print_scenario "6" "Revoked API Key" \
        "inb_valid1234567890" \
        "am_revoked78901234567890123456789012" \
        "535 5.7.8 Authentication credentials invalid"

    swaks --to "$TO" \
          --from "$FROM" \
          --server "$SERVER:$PORT" \
          --auth PLAIN \
          --auth-user "inb_valid1234567890" \
          --auth-password "am_revoked78901234567890123456789012" \
          --timeout 10 \
          --quit-after AUTH \
          2>&1
}

scenario_9() {
    print_scenario "9" "Insufficient Permissions (no smtp:send scope)" \
        "inb_valid1234567890" \
        "am_noscope12345678901234567890123456" \
        "535 5.7.8 Insufficient permissions"

    swaks --to "$TO" \
          --from "$FROM" \
          --server "$SERVER:$PORT" \
          --auth PLAIN \
          --auth-user "inb_valid1234567890" \
          --auth-password "am_noscope12345678901234567890123456" \
          --timeout 10 \
          --quit-after AUTH \
          2>&1
}

scenario_15() {
    print_scenario_simple "15" "MAIL FROM before AUTH (auth required)" \
        "530 5.7.0 Authentication required"

    echo -e "${CYAN}Sending: EHLO -> MAIL FROM (skipping AUTH)${NC}"

    {
        sleep 0.3
        echo "EHLO test.example.com"
        sleep 0.3
        echo "MAIL FROM:<sender@agentmail.dev>"
        sleep 0.3
        echo "QUIT"
        sleep 0.3
    } | nc -w 3 $SERVER $PORT 2>&1
}

# ============================================================================
# SESSION STATE TEST SCENARIOS
# ============================================================================

scenario_11() {
    print_scenario_simple "11" "DATA before MAIL FROM (bad sequence)" \
        "503 5.5.1 Bad sequence of commands"

    echo -e "${CYAN}Sending: EHLO -> AUTH -> DATA (skipping MAIL FROM)${NC}"

    {
        sleep 0.3
        echo "EHLO test.example.com"
        sleep 0.3
        echo "AUTH PLAIN $AUTH_PLAIN"
        sleep 0.5
        echo "DATA"
        sleep 0.3
        echo "QUIT"
        sleep 0.3
    } | nc -w 3 $SERVER $PORT 2>&1
}

scenario_12() {
    print_scenario_simple "12" "RCPT TO before MAIL FROM (bad sequence)" \
        "503 5.5.1 Bad sequence of commands"

    echo -e "${CYAN}Sending: EHLO -> AUTH -> RCPT TO (skipping MAIL FROM)${NC}"

    {
        sleep 0.3
        echo "EHLO test.example.com"
        sleep 0.3
        echo "AUTH PLAIN $AUTH_PLAIN"
        sleep 0.5
        echo "RCPT TO:<test@example.com>"
        sleep 0.3
        echo "QUIT"
        sleep 0.3
    } | nc -w 3 $SERVER $PORT 2>&1
}

scenario_13() {
    print_scenario_simple "13" "DATA before RCPT TO (bad sequence)" \
        "503 5.5.1 Bad sequence of commands"

    echo -e "${CYAN}Sending: EHLO -> AUTH -> MAIL FROM -> DATA (skipping RCPT TO)${NC}"

    {
        sleep 0.3
        echo "EHLO test.example.com"
        sleep 0.3
        echo "AUTH PLAIN $AUTH_PLAIN"
        sleep 0.5
        echo "MAIL FROM:<sender@agentmail.dev>"
        sleep 0.3
        echo "DATA"
        sleep 0.3
        echo "QUIT"
        sleep 0.3
    } | nc -w 3 $SERVER $PORT 2>&1
}

scenario_14() {
    print_scenario_simple "14" "Multiple emails in one session" \
        "Two 250 2.0.0 Message queued responses"

    echo -e "${CYAN}Sending: Two complete emails in one session (no re-auth)${NC}"

    {
        sleep 0.3
        echo "EHLO test.example.com"
        sleep 0.3
        echo "AUTH PLAIN $AUTH_PLAIN"
        sleep 0.5
        # First email
        echo "MAIL FROM:<sender@agentmail.dev>"
        sleep 0.2
        echo "RCPT TO:<first@example.com>"
        sleep 0.2
        echo "DATA"
        sleep 0.2
        echo "Subject: First Email"
        echo ""
        echo "First message body"
        echo "."
        sleep 0.5
        # Second email (no re-auth needed)
        echo "MAIL FROM:<sender@agentmail.dev>"
        sleep 0.2
        echo "RCPT TO:<second@example.com>"
        sleep 0.2
        echo "DATA"
        sleep 0.2
        echo "Subject: Second Email"
        echo ""
        echo "Second message body"
        echo "."
        sleep 0.3
        echo "QUIT"
        sleep 0.3
    } | nc -w 5 $SERVER $PORT 2>&1
}

# ============================================================================
# MAIN
# ============================================================================

print_header "AgentMail SMTP Server - Test Scenarios"

check_swaks
check_nc
check_server

# Parse command line arguments
case "$1" in
    1) scenario_1 ;;
    2) scenario_2 ;;
    4) scenario_4 ;;
    6) scenario_6 ;;
    9) scenario_9 ;;
    11) scenario_11 ;;
    12) scenario_12 ;;
    13) scenario_13 ;;
    14) scenario_14 ;;
    15) scenario_15 ;;
    "auth")
        print_header "Running Core Authentication Tests (6 tests)"
        for i in 1 2 4 6 9 15; do
            echo -e "${YELLOW}=== Scenario $i ===${NC}"
            scenario_$i
            echo ""
        done
        print_header "Authentication Tests Complete"
        ;;
    "session")
        print_header "Running Session State Tests (4 tests)"
        for i in 11 12 13 14; do
            echo -e "${YELLOW}=== Scenario $i ===${NC}"
            scenario_$i
            echo ""
        done
        print_header "Session State Tests Complete"
        ;;
    "all"|"")
        print_header "Running All Test Scenarios (10 tests total)"

        echo -e "${GREEN}=== AUTHENTICATION TESTS (6 tests) ===${NC}"
        echo ""

        echo -e "${GREEN}=== Scenario 1: SUCCESS CASE ===${NC}"
        scenario_1
        echo ""

        echo -e "${RED}=== Scenario 2: INVALID API KEY FORMAT ===${NC}"
        scenario_2
        echo ""

        echo -e "${RED}=== Scenario 4: INBOX NOT FOUND ===${NC}"
        scenario_4
        echo ""

        echo -e "${RED}=== Scenario 6: REVOKED API KEY ===${NC}"
        scenario_6
        echo ""

        echo -e "${RED}=== Scenario 9: INSUFFICIENT PERMISSIONS ===${NC}"
        scenario_9
        echo ""

        echo -e "${RED}=== Scenario 15: MAIL FROM BEFORE AUTH ===${NC}"
        scenario_15
        echo ""

        echo -e "${CYAN}=== SESSION STATE TESTS (4 tests) ===${NC}"
        echo ""

        echo -e "${RED}=== Scenario 11: DATA BEFORE MAIL FROM ===${NC}"
        scenario_11
        echo ""

        echo -e "${RED}=== Scenario 12: RCPT TO BEFORE MAIL FROM ===${NC}"
        scenario_12
        echo ""

        echo -e "${RED}=== Scenario 13: DATA BEFORE RCPT TO ===${NC}"
        scenario_13
        echo ""

        echo -e "${GREEN}=== Scenario 14: MULTIPLE EMAILS IN ONE SESSION ===${NC}"
        scenario_14
        echo ""

        print_header "All Test Scenarios Complete (10 tests)"
        ;;
    *)
        echo "Usage: $0 [scenario_number|auth|session|all]"
        echo ""
        echo "Core Authentication Scenarios:"
        echo "  1  - Successful authentication"
        echo "  2  - Invalid API key format"
        echo "  4  - Inbox not found"
        echo "  6  - Revoked API key"
        echo "  9  - Insufficient permissions"
        echo "  15 - MAIL FROM before AUTH"
        echo ""
        echo "Session State Scenarios:"
        echo "  11 - DATA before MAIL FROM (bad sequence)"
        echo "  12 - RCPT TO before MAIL FROM (bad sequence)"
        echo "  13 - DATA before RCPT TO (bad sequence)"
        echo "  14 - Multiple emails in one session"
        echo ""
        echo "Groups:"
        echo "  auth    - Run authentication tests (6 tests)"
        echo "  session - Run session state tests (4 tests)"
        echo "  all     - Run all scenarios (10 tests)"
        ;;
esac
