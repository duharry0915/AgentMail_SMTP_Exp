# AgentMail SMTP Server Demo

A working SMTP server demonstration for AgentMail, showcasing authentication and comprehensive error handling.

## Overview

This demo implements an SMTP server that authenticates users via:
- **Username**: AgentMail inbox ID (e.g., `inb_valid1234567890`)
- **Password**: AgentMail API key (e.g., `am_validkey12345678901234567890123456`)

The server validates credentials against a mock database and returns appropriate SMTP response codes.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will start on port 2525:
```
[INFO] ========================================
[INFO]   AgentMail SMTP Server Demo
[INFO]   Port: 2525
[INFO] ========================================
```

### 3. Run Test Scenarios

In a new terminal:

```bash
# Run all scenarios
./tests/test-scenarios.sh all

# Run specific scenario
./tests/test-scenarios.sh 1
```

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Successful authentication | 235 2.7.0 Authentication successful |
| 2 | Invalid API key format | 535 5.7.8 Authentication credentials invalid |
| 3 | API key not found | 535 5.7.8 Authentication credentials invalid |
| 4 | Inbox not found | 535 5.7.8 Authentication credentials invalid |
| 5 | Organization mismatch | 535 5.7.8 Authentication credentials invalid |
| 6 | Revoked API key | 535 5.7.8 Authentication credentials invalid |
| 7 | Expired API key | 535 5.7.8 Authentication credentials invalid |
| 8 | Disabled inbox | 535 5.7.8 Authentication credentials invalid |
| 9 | Insufficient permissions | 535 5.7.8 Insufficient permissions |
| 10 | Invalid inbox ID format | 535 5.7.8 Authentication credentials invalid |

## Mock Data

### Inboxes

| Inbox ID | Organization | Status |
|----------|--------------|--------|
| `inb_valid1234567890` | org_abc | active |
| `inb_disabled456789012` | org_abc | disabled |
| `inb_suspended78901234` | org_abc | suspended |

### API Keys

| API Key | Organization | Status |
|---------|--------------|--------|
| `am_validkey12345678901234567890123456` | org_abc | Valid, has smtp:send |
| `am_wrongorg45678901234567890123456789` | org_xyz | Valid, different org |
| `am_revoked78901234567890123456789012` | org_abc | Revoked |
| `am_expired12345678901234567890123456` | org_abc | Expired |
| `am_noscope12345678901234567890123456` | org_abc | Missing smtp:send scope |

## Architecture

```
src/
├── server.ts              # SMTP server with hooks
├── auth/
│   ├── validator.ts       # 9-step authentication logic
│   └── errors.ts          # Auth error codes and types
├── errors/
│   └── mapping.ts         # 40+ SMTP error mappings
├── mock/
│   └── database.ts        # Mock inboxes and API keys
└── utils/
    └── logger.ts          # Structured logging
```

## Authentication Flow

1. **Validate inbox_id format** - Must match `inb_[a-zA-Z0-9]{12,32}`
2. **Validate API key format** - Must match `am_[a-zA-Z0-9]{32,64}`
3. **Look up API key** - Check if exists in database
4. **Check API key not revoked** - Verify `revoked_at` is null
5. **Check API key not expired** - Verify `expires_at` is null or in future
6. **Check API key has smtp:send scope** - Verify permissions
7. **Look up inbox** - Check if exists in database
8. **Check inbox status** - Must be "active"
9. **Verify organization match** - API key org must match inbox org

## Security Design

All authentication failures return the same generic message to prevent information leakage:

```
535 5.7.8 Authentication credentials invalid
```

Detailed error codes are logged server-side only:

```
[WARN] Auth failed: INBOX_NOT_FOUND, returning 535 5.7.8
```

## SMTP Response Codes

| Code | Enhanced | Description |
|------|----------|-------------|
| 235 | 2.7.0 | Authentication successful |
| 535 | 5.7.8 | Authentication failed (permanent) |
| 454 | 4.7.0 | Temporary failure (retry) |
| 550 | 5.1.1 | Mailbox not found |
| 552 | 5.2.3 | Message too large |

## Manual Testing with swaks

```bash
# Success case
swaks --to test@example.com \
      --from test@agentmail.dev \
      --server localhost:2525 \
      --auth PLAIN \
      --auth-user "inb_valid1234567890" \
      --auth-password "am_validkey12345678901234567890123456"

# Auth failure case
swaks --to test@example.com \
      --from test@agentmail.dev \
      --server localhost:2525 \
      --auth PLAIN \
      --auth-user "inb_valid1234567890" \
      --auth-password "am_invalidkey" \
      --quit-after AUTH
```

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Port | 2525 | Non-privileged port for local testing |
| Auth Methods | PLAIN, LOGIN | Supported authentication |
| TLS | Disabled | For demo simplicity |
| Max Message Size | 10MB | Default limit |

## Prerequisites

- Node.js 18+
- npm
- swaks (for testing): `brew install swaks` or `apt install swaks`

## Development

```bash
# Build TypeScript
npm run build

# Run with auto-reload (development)
npx tsx watch src/server.ts
```

## Demo Script for Thursday

1. **Start server**: `npm start`
2. **Show success case**: Run scenario 1, highlight 235 response
3. **Show auth failures**: Run scenarios 2-10, explain uniform 535 response
4. **Highlight security**: All failures return same message (no info leakage)
5. **Show detailed logging**: Point to internal error codes in server logs
6. **Explain architecture**: Mock → Validator → SMTP hooks
