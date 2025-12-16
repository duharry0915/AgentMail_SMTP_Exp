/**
 * Authentication Error Types for AgentMail SMTP Server
 *
 * Based on SMTP_SERVER_RESEARCH.md Section 3.1
 *
 * SECURITY NOTE: All auth failures return same generic message to client (535 5.7.8)
 * to prevent information leakage. Detailed error codes are logged internally only.
 */

// ============================================================================
// AUTH ERROR CODES
// ============================================================================

export enum AuthErrorCode {
  // API Key Errors
  INVALID_API_KEY_FORMAT = 'INVALID_API_KEY_FORMAT',
  API_KEY_NOT_FOUND = 'API_KEY_NOT_FOUND',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',

  // Inbox Errors
  INVALID_INBOX_ID_FORMAT = 'INVALID_INBOX_ID_FORMAT',
  INBOX_NOT_FOUND = 'INBOX_NOT_FOUND',
  INBOX_DISABLED = 'INBOX_DISABLED',
  INBOX_SUSPENDED = 'INBOX_SUSPENDED',

  // Authorization Errors
  INBOX_ORG_MISMATCH = 'INBOX_ORG_MISMATCH',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // System Errors (temporary - client should retry)
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

// ============================================================================
// AUTH ERROR INTERFACE
// ============================================================================

export interface AuthError {
  code: AuthErrorCode;
  smtpCode: number;
  enhancedCode: string;
  message: string;        // Message sent to client
  logMessage: string;     // Detailed message for internal logging
}

// ============================================================================
// AUTH ERROR DEFINITIONS
// ============================================================================

type AuthErrorDefinition = Omit<AuthError, 'logMessage'>;

export const AUTH_ERRORS: Record<AuthErrorCode, AuthErrorDefinition> = {
  // API Key Errors - All return 535 to client (security: don't reveal which part failed)
  [AuthErrorCode.INVALID_API_KEY_FORMAT]: {
    code: AuthErrorCode.INVALID_API_KEY_FORMAT,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.API_KEY_NOT_FOUND]: {
    code: AuthErrorCode.API_KEY_NOT_FOUND,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.API_KEY_REVOKED]: {
    code: AuthErrorCode.API_KEY_REVOKED,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.API_KEY_EXPIRED]: {
    code: AuthErrorCode.API_KEY_EXPIRED,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },

  // Inbox Errors - All return 535 to client
  [AuthErrorCode.INVALID_INBOX_ID_FORMAT]: {
    code: AuthErrorCode.INVALID_INBOX_ID_FORMAT,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.INBOX_NOT_FOUND]: {
    code: AuthErrorCode.INBOX_NOT_FOUND,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.INBOX_DISABLED]: {
    code: AuthErrorCode.INBOX_DISABLED,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.INBOX_SUSPENDED]: {
    code: AuthErrorCode.INBOX_SUSPENDED,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Account suspended - contact support'
  },

  // Authorization Errors
  [AuthErrorCode.INBOX_ORG_MISMATCH]: {
    code: AuthErrorCode.INBOX_ORG_MISMATCH,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  [AuthErrorCode.INSUFFICIENT_PERMISSIONS]: {
    code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Insufficient permissions for SMTP access'
  },

  // System Errors - Return 4xx (temporary) so client retries
  [AuthErrorCode.DATABASE_ERROR]: {
    code: AuthErrorCode.DATABASE_ERROR,
    smtpCode: 454,
    enhancedCode: '4.7.0',
    message: 'Temporary authentication failure, please retry'
  },
  [AuthErrorCode.RATE_LIMITED]: {
    code: AuthErrorCode.RATE_LIMITED,
    smtpCode: 454,
    enhancedCode: '4.7.0',
    message: 'Too many authentication attempts, please retry later'
  },
  [AuthErrorCode.SERVICE_UNAVAILABLE]: {
    code: AuthErrorCode.SERVICE_UNAVAILABLE,
    smtpCode: 454,
    enhancedCode: '4.7.0',
    message: 'Authentication service temporarily unavailable'
  }
};

// ============================================================================
// SMTP ERROR HELPER
// ============================================================================

export interface SMTPAuthError extends Error {
  responseCode: number;
  enhancedCode: string;
}

export function createAuthError(
  errorCode: AuthErrorCode,
  logMessage: string
): AuthError {
  const definition = AUTH_ERRORS[errorCode];
  return {
    ...definition,
    logMessage
  };
}

export function createSMTPAuthError(error: AuthError): SMTPAuthError {
  const smtpError = new Error(
    `${error.smtpCode} ${error.enhancedCode} ${error.message}`
  ) as SMTPAuthError;
  smtpError.responseCode = error.smtpCode;
  smtpError.enhancedCode = error.enhancedCode;
  return smtpError;
}

// ============================================================================
// AUTHENTICATED USER TYPE
// ============================================================================

export interface AuthenticatedUser {
  inbox_id: string;
  organization_id: string;
  email_address: string;
  api_key_id: string;
  // Note: api_key is NOT included here - it's added in server.ts from auth.password
  // and stored in SessionUser which has the required api_key field
}

// ============================================================================
// AUTH RESULT TYPE
// ============================================================================

export type AuthResult =
  | { success: true; user: AuthenticatedUser }
  | { success: false; error: AuthError };
