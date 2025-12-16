/**
 * Mock Database Layer for SMTP Demo
 *
 * Simulates AgentMail's DynamoDB tables for:
 * - Inboxes (inbox-table)
 * - API Keys (api-key-table)
 *
 * This allows demonstrating all auth scenarios without actual database.
 */

// ============================================================================
// MOCK DATA TYPES
// ============================================================================

export interface MockInbox {
  inbox_id: string;
  email_address: string;
  organization_id: string;
  status: 'active' | 'disabled' | 'suspended';
  display_name?: string;
  created_at: string;
}

export interface MockApiKey {
  api_key_id: string;
  organization_id: string;
  revoked_at: string | null;
  expires_at: string | null;
  scopes: string[];
  name: string;
  created_at: string;
}

// ============================================================================
// MOCK DATA
// ============================================================================

/**
 * Mock Inboxes
 *
 * Test scenarios:
 * - inb_valid1234567890: Active inbox in org_abc (success case)
 * - inb_disabled456789012: Disabled inbox in org_abc
 * - inb_suspended78901234: Suspended inbox in org_abc
 */
export const MOCK_INBOXES: Record<string, MockInbox> = {
  'inb_valid1234567890': {
    inbox_id: 'inb_valid1234567890',
    email_address: 'test@agentmail.dev',
    organization_id: 'org_abc',
    status: 'active',
    display_name: 'Test Inbox',
    created_at: '2024-01-01T00:00:00Z'
  },
  'inb_disabled456789012': {
    inbox_id: 'inb_disabled456789012',
    email_address: 'disabled@agentmail.dev',
    organization_id: 'org_abc',
    status: 'disabled',
    display_name: 'Disabled Inbox',
    created_at: '2024-01-01T00:00:00Z'
  },
  'inb_suspended78901234': {
    inbox_id: 'inb_suspended78901234',
    email_address: 'suspended@agentmail.dev',
    organization_id: 'org_abc',
    status: 'suspended',
    display_name: 'Suspended Inbox',
    created_at: '2024-01-01T00:00:00Z'
  }
};

/**
 * Mock API Keys
 *
 * Test scenarios:
 * - am_validkey12345678901234567890123456: Valid key for org_abc (success case)
 * - am_wrongorg45678901234567890123456789: Valid key for org_xyz (org mismatch)
 * - am_revoked78901234567890123456789012: Revoked key for org_abc
 * - am_expired12345678901234567890123456: Expired key for org_abc
 * - am_noscope12345678901234567890123456: Key without smtp:send scope
 */
export const MOCK_API_KEYS: Record<string, MockApiKey> = {
  'am_validkey12345678901234567890123456': {
    api_key_id: 'key_valid_1',
    organization_id: 'org_abc',
    revoked_at: null,
    expires_at: null,
    scopes: ['smtp:send', 'messages:read', 'messages:write'],
    name: 'Production API Key',
    created_at: '2024-01-01T00:00:00Z'
  },
  'am_wrongorg45678901234567890123456789': {
    api_key_id: 'key_wrongorg_2',
    organization_id: 'org_xyz',  // Different organization!
    revoked_at: null,
    expires_at: null,
    scopes: ['smtp:send'],
    name: 'Other Org API Key',
    created_at: '2024-01-01T00:00:00Z'
  },
  'am_revoked78901234567890123456789012': {
    api_key_id: 'key_revoked_3',
    organization_id: 'org_abc',
    revoked_at: '2024-12-01T00:00:00Z',  // Revoked!
    expires_at: null,
    scopes: ['smtp:send'],
    name: 'Revoked API Key',
    created_at: '2024-01-01T00:00:00Z'
  },
  'am_expired12345678901234567890123456': {
    api_key_id: 'key_expired_4',
    organization_id: 'org_abc',
    revoked_at: null,
    expires_at: '2024-01-01T00:00:00Z',  // Expired!
    scopes: ['smtp:send'],
    name: 'Expired API Key',
    created_at: '2023-01-01T00:00:00Z'
  },
  'am_noscope12345678901234567890123456': {
    api_key_id: 'key_noscope_5',
    organization_id: 'org_abc',
    revoked_at: null,
    expires_at: null,
    scopes: ['messages:read'],  // Missing smtp:send!
    name: 'Read-Only API Key',
    created_at: '2024-01-01T00:00:00Z'
  }
};

// ============================================================================
// MOCK DATABASE FUNCTIONS
// ============================================================================

/**
 * Simulate database lookup latency (optional)
 */
const SIMULATE_LATENCY = false;
const LATENCY_MS = 50;

async function simulateLatency(): Promise<void> {
  if (SIMULATE_LATENCY) {
    await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
  }
}

/**
 * Look up an inbox by inbox_id
 *
 * Simulates: DynamoDB GetItem on inbox-table
 */
export async function getInbox(inbox_id: string): Promise<MockInbox | null> {
  await simulateLatency();
  return MOCK_INBOXES[inbox_id] || null;
}

/**
 * Look up an API key by the raw key value
 *
 * In production, this would:
 * 1. Hash the API key
 * 2. Query api-key-table by hash
 *
 * For demo, we just do direct lookup.
 */
export async function getApiKey(apiKey: string): Promise<MockApiKey | null> {
  await simulateLatency();
  return MOCK_API_KEYS[apiKey] || null;
}

/**
 * Simulate a database error (for testing 454 responses)
 *
 * Call this to trigger a database error scenario.
 */
let simulateDatabaseError = false;

export function setSimulateDatabaseError(simulate: boolean): void {
  simulateDatabaseError = simulate;
}

export async function getInboxWithPossibleError(inbox_id: string): Promise<MockInbox | null> {
  if (simulateDatabaseError) {
    throw new Error('Simulated database error');
  }
  return getInbox(inbox_id);
}

export async function getApiKeyWithPossibleError(apiKey: string): Promise<MockApiKey | null> {
  if (simulateDatabaseError) {
    throw new Error('Simulated database error');
  }
  return getApiKey(apiKey);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * List all mock inboxes (for debugging)
 */
export function listMockInboxes(): MockInbox[] {
  return Object.values(MOCK_INBOXES);
}

/**
 * List all mock API keys (for debugging)
 * Note: In production, you'd never expose API keys like this!
 */
export function listMockApiKeys(): Array<Omit<MockApiKey, 'scopes'> & { key: string }> {
  return Object.entries(MOCK_API_KEYS).map(([key, value]) => ({
    key: key.substring(0, 10) + '...', // Truncate for display
    ...value
  }));
}

/**
 * Print test scenarios for reference
 */
export function printTestScenarios(): void {
  console.log('\n=== Available Test Scenarios ===\n');

  console.log('SUCCESS CASE:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_validkey12345678901234567890123456');
  console.log('  Expected: 235 2.7.0 Authentication successful\n');

  console.log('INVALID API KEY FORMAT:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_short');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('API KEY NOT FOUND:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_notexist123456789012345678901234');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('INBOX NOT FOUND:');
  console.log('  Username: inb_notexist123456');
  console.log('  Password: am_validkey12345678901234567890123456');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('ORGANIZATION MISMATCH:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_wrongorg45678901234567890123456789');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('REVOKED API KEY:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_revoked78901234567890123456789012');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('EXPIRED API KEY:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_expired12345678901234567890123456');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('DISABLED INBOX:');
  console.log('  Username: inb_disabled456789012');
  console.log('  Password: am_validkey12345678901234567890123456');
  console.log('  Expected: 535 5.7.8 Authentication credentials invalid\n');

  console.log('INSUFFICIENT PERMISSIONS:');
  console.log('  Username: inb_valid1234567890');
  console.log('  Password: am_noscope12345678901234567890123456');
  console.log('  Expected: 535 5.7.8 Insufficient permissions for SMTP access\n');
}
