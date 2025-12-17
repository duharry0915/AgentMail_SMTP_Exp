/**
 * SMTP Authentication Validator
 *
 * Based on SMTP_SERVER_RESEARCH.md Section 3.1
 *
 * Validates:
 * - inbox_id format (username)
 * - API key format (password)
 * - API key exists and is valid (not revoked/expired)
 * - Inbox exists and is active
 * - Inbox belongs to same organization as API key
 *
 * SECURITY: All auth failures return same generic message (535 5.7.8)
 * to prevent information leakage. Detailed errors logged internally only.
 */

import {
  AuthErrorCode,
  AuthResult,
  AuthenticatedUser,
  createAuthError
} from './errors';
import { getApiKey, getInbox } from '../mock/database';
import Logger from '../utils/logger';

// ============================================================================
// VALIDATION REGEX
// ============================================================================

/**
 * inbox_id format:
 * - Legacy: inb_ + 12-32 alphanumeric characters (e.g., inb_valid1234567890)
 * - Current: email address format (e.g., jollyboat16@agentmail.to)
 */
const INBOX_ID_REGEX = /^(inb_[a-zA-Z0-9]{12,32}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

/**
 * API key format: am_ + 32-128 hex/alphanumeric characters
 * Example: am_2ae75eca77d883a192f960a6c4c697e1f91b3769f20d0530217868710140d9ea
 */
const API_KEY_REGEX = /^am_[a-zA-Z0-9]{32,128}$/;

// ============================================================================
// FORMAT VALIDATORS
// ============================================================================

function validateInboxIdFormat(inboxId: string): boolean {
  return INBOX_ID_REGEX.test(inboxId);
}

function validateApiKeyFormat(apiKey: string): boolean {
  return API_KEY_REGEX.test(apiKey);
}

// ============================================================================
// MAIN AUTHENTICATION FUNCTION
// ============================================================================

/**
 * Validate SMTP credentials (inbox_id + API key)
 *
 * This is the main authentication function called by the SMTP server's onAuth hook.
 *
 * @param username - The inbox_id (e.g., "inb_valid1234567890")
 * @param password - The API key (e.g., "am_validkey12345678901234567890123456")
 * @returns AuthResult with either authenticated user or error details
 */
export async function validateSMTPCredentials(
  username: string,
  password: string
): Promise<AuthResult> {

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Validate inbox_id format
  // ─────────────────────────────────────────────────────────────────────────
  Logger.authStep('Validating inbox_id format', 'OK');

  if (!username || typeof username !== 'string') {
    Logger.authStep('Validating inbox_id format', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INVALID_INBOX_ID_FORMAT,
        'Empty or invalid username provided'
      )
    };
  }

  if (!validateInboxIdFormat(username)) {
    Logger.authStep('Validating inbox_id format', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INVALID_INBOX_ID_FORMAT,
        `Invalid inbox_id format: ${username.substring(0, 20)}...`
      )
    };
  }

  Logger.authStep('Validating inbox_id format', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Validate API key format
  // ─────────────────────────────────────────────────────────────────────────

  if (!password || typeof password !== 'string') {
    Logger.authStep('Validating API key format', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INVALID_API_KEY_FORMAT,
        'Empty or invalid password/API key provided'
      )
    };
  }

  if (!validateApiKeyFormat(password)) {
    Logger.authStep('Validating API key format', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INVALID_API_KEY_FORMAT,
        `Invalid API key format (length: ${password.length})`
      )
    };
  }

  Logger.authStep('Validating API key format', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Look up API key in database
  // ─────────────────────────────────────────────────────────────────────────

  let apiKey;
  try {
    apiKey = await getApiKey(password);
  } catch (dbError) {
    Logger.authStep('Looking up API key', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.DATABASE_ERROR,
        `Database error looking up API key: ${(dbError as Error).message}`
      )
    };
  }

  if (!apiKey) {
    Logger.authStep('Looking up API key', 'NOT_FOUND');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.API_KEY_NOT_FOUND,
        'API key not found in database'
      )
    };
  }

  Logger.authStep('Looking up API key', 'FOUND');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Check if API key is revoked
  // ─────────────────────────────────────────────────────────────────────────

  if (apiKey.revoked_at) {
    Logger.authStep('Checking if API key is revoked', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.API_KEY_REVOKED,
        `API key was revoked at ${apiKey.revoked_at}`
      )
    };
  }

  Logger.authStep('Checking if API key is revoked', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Check if API key is expired
  // ─────────────────────────────────────────────────────────────────────────

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    Logger.authStep('Checking if API key is expired', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.API_KEY_EXPIRED,
        `API key expired at ${apiKey.expires_at}`
      )
    };
  }

  Logger.authStep('Checking if API key is expired', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Check if API key has smtp:send permission
  // ─────────────────────────────────────────────────────────────────────────

  if (!apiKey.scopes.includes('smtp:send')) {
    Logger.authStep('Checking smtp:send permission', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INSUFFICIENT_PERMISSIONS,
        `API key lacks smtp:send scope. Has: ${apiKey.scopes.join(', ')}`
      )
    };
  }

  Logger.authStep('Checking smtp:send permission', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Look up inbox in database
  // ─────────────────────────────────────────────────────────────────────────

  let inbox;
  try {
    inbox = await getInbox(username);
  } catch (dbError) {
    Logger.authStep('Looking up inbox', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.DATABASE_ERROR,
        `Database error looking up inbox: ${(dbError as Error).message}`
      )
    };
  }

  if (!inbox) {
    Logger.authStep('Looking up inbox', 'NOT_FOUND');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INBOX_NOT_FOUND,
        `Inbox not found: ${username}`
      )
    };
  }

  Logger.authStep('Looking up inbox', 'FOUND');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: Check if inbox is active
  // ─────────────────────────────────────────────────────────────────────────

  if (inbox.status === 'disabled') {
    Logger.authStep('Checking inbox status', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INBOX_DISABLED,
        `Inbox is disabled: ${username}`
      )
    };
  }

  if (inbox.status === 'suspended') {
    Logger.authStep('Checking inbox status', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INBOX_SUSPENDED,
        `Inbox is suspended: ${username}`
      )
    };
  }

  Logger.authStep('Checking inbox status', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 9: Verify inbox belongs to same organization as API key
  // ─────────────────────────────────────────────────────────────────────────

  if (inbox.organization_id !== apiKey.organization_id) {
    Logger.authStep('Checking organization match', 'FAIL');
    return {
      success: false,
      error: createAuthError(
        AuthErrorCode.INBOX_ORG_MISMATCH,
        `Inbox org (${inbox.organization_id}) != API key org (${apiKey.organization_id})`
      )
    };
  }

  Logger.authStep('Checking organization match', 'OK');

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS: Return authenticated user
  // ─────────────────────────────────────────────────────────────────────────

  const user: AuthenticatedUser = {
    inbox_id: inbox.inbox_id,
    organization_id: inbox.organization_id,
    email_address: inbox.email_address,
    api_key_id: apiKey.api_key_id
  };

  return {
    success: true,
    user
  };
}

// ============================================================================
// EXPORTED CONSTANTS (for testing)
// ============================================================================

export { INBOX_ID_REGEX, API_KEY_REGEX };
