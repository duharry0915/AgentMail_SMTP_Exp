#!/bin/bash
# =============================================================================
# AgentMail SMTP Server Test Suite
# =============================================================================
#
# Prerequisites:
#   - swaks installed (brew install swaks)
#   - SMTP server running on localhost:2525 (npm start)
#
# Usage:
#   ./tests/test-scenarios.sh           # Run all tests
#   ./tests/test-scenarios.sh 1         # Run test 1 only
#   ./tests/test-scenarios.sh 1 3 11    # Run tests 1, 3, and 11
#   ./tests/test-scenarios.sh list      # List all available tests
#   ./tests/test-scenarios.sh auth      # Run all auth tests (1-5)
#   ./tests/test-scenarios.sh mock      # Run all mock tests (6-10)
#   ./tests/test-scenarios.sh send      # Run send test (11)
#
# =============================================================================

# Configuration
SERVER="localhost:2525"
VALID_INBOX="jollyboat16@agentmail.to"
VALID_API_KEY="am_2ae75eca77d883a192f960a6c4c697e1f91b3769f20d0530217868710140d9ea"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}=============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=============================================================================${NC}"
}

print_test() {
    echo -e "${YELLOW}TEST:${NC} $1"
}

print_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAILED++))
}

# Run swaks and check for expected response
run_test() {
    local test_name="$1"
    local expected_code="$2"
    shift 2
    local swaks_args=("$@")

    print_test "$test_name"

    # Run swaks and capture output
    output=$(swaks "${swaks_args[@]}" 2>&1) || true

    # Check if expected code is in output
    if echo "$output" | grep -q "$expected_code"; then
        print_pass "$test_name (got $expected_code)"
        return 0
    else
        print_fail "$test_name (expected $expected_code)"
        echo "  Output: $(echo "$output" | tail -5)"
        return 1
    fi
}

# Check server availability
check_server() {
    if ! nc -z localhost 2525 2>/dev/null; then
        echo -e "${RED}ERROR: SMTP server is NOT running on port 2525${NC}"
        echo "Please start the server with: npm start"
        exit 1
    fi
}

# =============================================================================
# Test Definitions
# =============================================================================

test_1() {
    run_test "1. Valid credentials (success)" "235" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --quit-after AUTH
}

test_2() {
    run_test "2. Invalid API key format" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "am_short" \
        --quit-after AUTH
}

test_3() {
    run_test "3. API key not found" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "am_notexist12345678901234567890123456789012" \
        --quit-after AUTH
}

test_4() {
    run_test "4. Inbox not found" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "nonexistent@agentmail.to" \
        --auth-password "$VALID_API_KEY" \
        --quit-after AUTH
}

test_5() {
    run_test "5. Invalid inbox format" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "invalid-inbox" \
        --auth-password "$VALID_API_KEY" \
        --quit-after AUTH
}

test_6() {
    run_test "6. Organization mismatch" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "inb_valid1234567890" \
        --auth-password "am_wrongorg45678901234567890123456789" \
        --quit-after AUTH
}

test_7() {
    run_test "7. Revoked API key" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "inb_valid1234567890" \
        --auth-password "am_revoked78901234567890123456789012" \
        --quit-after AUTH
}

test_8() {
    run_test "8. Expired API key" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "inb_valid1234567890" \
        --auth-password "am_expired12345678901234567890123456" \
        --quit-after AUTH
}

test_9() {
    run_test "9. Insufficient permissions" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "inb_valid1234567890" \
        --auth-password "am_noscope12345678901234567890123456" \
        --quit-after AUTH
}

test_10() {
    run_test "10. Disabled inbox" "535" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "inb_disabled456789012" \
        --auth-password "am_validkey12345678901234567890123456" \
        --quit-after AUTH
}

test_11() {
    run_test "11. Send email to AgentMail inbox" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: Test $(date +%s)" \
        --body "Automated test email"
}

test_12() {
    run_test "12. Send HTML email" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: HTML Test $(date +%s)" \
        --header "Content-Type: text/html" \
        --body "<html><body><h1>Hello</h1><p>This is an <b>HTML</b> email.</p></body></html>"
}

test_13() {
    run_test "13. Send email with CC" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: CC Test $(date +%s)" \
        --header "Cc: $VALID_INBOX" \
        --body "Email with CC recipient"
}

test_14() {
    run_test "14. Send email with attachment" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: Attachment Test $(date +%s)" \
        --attach-type text/plain \
        --attach-name "test.txt" \
        --attach-body "This is a test attachment content."
}

test_15() {
    run_test "15. Send email with Reply-To header" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: Reply-To Test $(date +%s)" \
        --header "Reply-To: reply@example.com" \
        --body "Email with Reply-To header"
}

test_16() {
    run_test "16. Send email with long body" "250" \
        --server "$SERVER" \
        --auth PLAIN \
        --auth-user "$VALID_INBOX" \
        --auth-password "$VALID_API_KEY" \
        --to "$VALID_INBOX" \
        --from "$VALID_INBOX" \
        --header "Subject: Long Body Test $(date +%s)" \
        --body "$(printf 'This is line %d of the email body.\n' {1..100})"
}

# =============================================================================
# List Tests
# =============================================================================

list_tests() {
    echo ""
    echo "Available Tests:"
    echo "================"
    echo ""
    echo "  Auth Tests (1-5):"
    echo "    1  - Valid credentials (expect 235)"
    echo "    2  - Invalid API key format (expect 535)"
    echo "    3  - API key not found (expect 535)"
    echo "    4  - Inbox not found (expect 535)"
    echo "    5  - Invalid inbox format (expect 535)"
    echo ""
    echo "  Mock Error Tests (6-10):"
    echo "    6  - Organization mismatch (expect 535)"
    echo "    7  - Revoked API key (expect 535)"
    echo "    8  - Expired API key (expect 535)"
    echo "    9  - Insufficient permissions (expect 535)"
    echo "    10 - Disabled inbox (expect 535)"
    echo ""
    echo "  Send Tests (11-16):"
    echo "    11 - Send basic email (expect 250)"
    echo "    12 - Send HTML email (expect 250)"
    echo "    13 - Send email with CC (expect 250)"
    echo "    14 - Send email with attachment (expect 250)"
    echo "    15 - Send email with Reply-To (expect 250)"
    echo "    16 - Send email with long body (expect 250)"
    echo ""
    echo "Groups:"
    echo "  auth - Run tests 1-5"
    echo "  mock - Run tests 6-10"
    echo "  send - Run tests 11-16"
    echo "  all  - Run all tests (default)"
    echo ""
}

# =============================================================================
# Run Specific Tests
# =============================================================================

run_tests() {
    for test_num in "$@"; do
        case $test_num in
            1)  test_1 ;;
            2)  test_2 ;;
            3)  test_3 ;;
            4)  test_4 ;;
            5)  test_5 ;;
            6)  test_6 ;;
            7)  test_7 ;;
            8)  test_8 ;;
            9)  test_9 ;;
            10) test_10 ;;
            11) test_11 ;;
            12) test_12 ;;
            13) test_13 ;;
            14) test_14 ;;
            15) test_15 ;;
            16) test_16 ;;
            *)  echo -e "${RED}Unknown test: $test_num${NC}" ;;
        esac
    done
}

run_all() {
    print_header "Authentication Tests"
    test_1; test_2; test_3; test_4; test_5

    print_header "Mock Error Scenarios"
    test_6; test_7; test_8; test_9; test_10

    print_header "Email Sending Tests"
    test_11; test_12; test_13; test_14; test_15; test_16
}

print_summary() {
    print_header "Test Summary"
    TOTAL=$((PASSED + FAILED))
    echo ""
    echo -e "Total:  $TOTAL"
    echo -e "${GREEN}Passed: $PASSED${NC}"
    echo -e "${RED}Failed: $FAILED${NC}"
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
    else
        echo -e "${RED}Some tests failed.${NC}"
    fi
}

# =============================================================================
# Main
# =============================================================================

# Handle special commands
case "${1:-}" in
    list|help|-h|--help)
        list_tests
        exit 0
        ;;
    "")
        # No args - run all
        check_server
        run_all
        print_summary
        ;;
    all)
        check_server
        run_all
        print_summary
        ;;
    auth)
        check_server
        print_header "Authentication Tests"
        run_tests 1 2 3 4 5
        print_summary
        ;;
    mock)
        check_server
        print_header "Mock Error Scenarios"
        run_tests 6 7 8 9 10
        print_summary
        ;;
    send)
        check_server
        print_header "Email Sending Tests"
        run_tests 11 12 13 14 15 16
        print_summary
        ;;
    *)
        # Run specific test numbers
        check_server
        print_header "Running Selected Tests"
        run_tests "$@"
        print_summary
        ;;
esac
