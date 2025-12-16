/**
 * Comprehensive SMTP Error Code Mapping
 *
 * Based on SMTP_SERVER_RESEARCH.md Section 4.3
 *
 * Maps AgentMail API errors to SMTP response codes:
 * - 4xx = Temporary failures (client SHOULD retry)
 * - 5xx = Permanent failures (client MUST NOT retry)
 */

// ============================================================================
// SMTP ERROR CODE ENUM
// ============================================================================

export enum SMTPErrorCode {
  // Success Codes
  SERVICE_READY = 220,
  CLOSING = 221,
  AUTH_SUCCESS = 235,
  SUCCESS = 250,
  DATA_START = 354,

  // Temporary Failures (4xx) - Client should retry
  SERVICE_UNAVAILABLE = 421,
  MAILBOX_TEMP_UNAVAILABLE = 450,
  LOCAL_ERROR = 451,
  INSUFFICIENT_STORAGE = 452,
  TEMP_AUTH_FAILURE = 454,

  // Permanent Failures (5xx) - Client should not retry
  SYNTAX_ERROR = 500,
  SYNTAX_ERROR_PARAMS = 501,
  COMMAND_NOT_IMPLEMENTED = 502,
  BAD_SEQUENCE = 503,
  PARAM_NOT_IMPLEMENTED = 504,
  SERVER_DOES_NOT_ACCEPT = 521,
  AUTH_REQUIRED = 530,
  AUTH_TOO_WEAK = 534,
  AUTH_FAILED = 535,
  ENCRYPTION_REQUIRED = 538,
  MAILBOX_NOT_FOUND = 550,
  USER_NOT_LOCAL = 551,
  MESSAGE_TOO_LARGE = 552,
  MAILBOX_NAME_INVALID = 553,
  TRANSACTION_FAILED = 554,
  RECIPIENT_REJECTED = 556
}

// ============================================================================
// SMTP ERROR INTERFACE
// ============================================================================

export interface SMTPError extends Error {
  responseCode: number;
  enhancedCode: string;
}

export function createSMTPError(
  code: number,
  enhancedCode: string,
  message: string
): SMTPError {
  const error = new Error(`${code} ${enhancedCode} ${message}`) as SMTPError;
  error.responseCode = code;
  error.enhancedCode = enhancedCode;
  return error;
}

// ============================================================================
// ERROR MAPPING INTERFACE
// ============================================================================

interface ErrorMapping {
  smtpCode: SMTPErrorCode;
  enhancedCode: string;
  message: string;
}

// ============================================================================
// AGENTMAIL ERROR → SMTP ERROR MAPPING (40+ types)
// ============================================================================

export const ERROR_MAPPINGS: Record<string, ErrorMapping> = {
  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATION ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'ValidationError': {
    smtpCode: SMTPErrorCode.SYNTAX_ERROR_PARAMS,
    enhancedCode: '5.5.2',
    message: 'Invalid message format or parameters'
  },
  'InvalidEmailFormat': {
    smtpCode: SMTPErrorCode.SYNTAX_ERROR_PARAMS,
    enhancedCode: '5.1.3',
    message: 'Invalid email address syntax'
  },
  'InvalidInboxId': {
    smtpCode: SMTPErrorCode.MAILBOX_NAME_INVALID,
    enhancedCode: '5.1.3',
    message: 'Invalid mailbox name'
  },
  'MissingRequiredField': {
    smtpCode: SMTPErrorCode.SYNTAX_ERROR_PARAMS,
    enhancedCode: '5.5.2',
    message: 'Required field missing'
  },
  'InvalidHeaderFormat': {
    smtpCode: SMTPErrorCode.SYNTAX_ERROR_PARAMS,
    enhancedCode: '5.6.0',
    message: 'Invalid message header format'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOT FOUND ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'NotFoundError': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.1.1',
    message: 'Mailbox not found'
  },
  'InboxNotFound': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.1.1',
    message: 'Mailbox does not exist'
  },
  'RecipientNotFound': {
    smtpCode: SMTPErrorCode.RECIPIENT_REJECTED,
    enhancedCode: '5.1.1',
    message: 'Recipient address rejected'
  },
  'ThreadNotFound': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.1.1',
    message: 'Referenced thread not found'
  },
  'MessageNotFound': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.1.1',
    message: 'Referenced message not found'
  },
  'AttachmentNotFound': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.1.1',
    message: 'Referenced attachment not found'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'AuthenticationRequired': {
    smtpCode: SMTPErrorCode.AUTH_REQUIRED,
    enhancedCode: '5.7.0',
    message: 'Authentication required'
  },
  'AuthenticationFailed': {
    smtpCode: SMTPErrorCode.AUTH_FAILED,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  'ApiKeyInvalid': {
    smtpCode: SMTPErrorCode.AUTH_FAILED,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  'ApiKeyRevoked': {
    smtpCode: SMTPErrorCode.AUTH_FAILED,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  'ApiKeyExpired': {
    smtpCode: SMTPErrorCode.AUTH_FAILED,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid'
  },
  'InsufficientPermissions': {
    smtpCode: SMTPErrorCode.AUTH_FAILED,
    enhancedCode: '5.7.8',
    message: 'Insufficient permissions for SMTP'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RATE LIMITING ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'RateLimitError': {
    smtpCode: SMTPErrorCode.MAILBOX_TEMP_UNAVAILABLE,
    enhancedCode: '4.7.1',
    message: 'Rate limit exceeded, try again later'
  },
  'TooManyConnections': {
    smtpCode: SMTPErrorCode.SERVICE_UNAVAILABLE,
    enhancedCode: '4.7.0',
    message: 'Too many connections from your IP'
  },
  'TooManyAuthAttempts': {
    smtpCode: SMTPErrorCode.TEMP_AUTH_FAILURE,
    enhancedCode: '4.7.0',
    message: 'Too many authentication attempts'
  },
  'DailyLimitExceeded': {
    smtpCode: SMTPErrorCode.MAILBOX_TEMP_UNAVAILABLE,
    enhancedCode: '4.7.1',
    message: 'Daily sending limit exceeded'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SIZE/LIMIT ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'LimitExceededError': {
    smtpCode: SMTPErrorCode.MESSAGE_TOO_LARGE,
    enhancedCode: '5.2.3',
    message: 'Message size exceeds limit'
  },
  'MessageTooLarge': {
    smtpCode: SMTPErrorCode.MESSAGE_TOO_LARGE,
    enhancedCode: '5.2.3',
    message: 'Message size exceeds maximum allowed'
  },
  'TooManyRecipients': {
    smtpCode: SMTPErrorCode.INSUFFICIENT_STORAGE,
    enhancedCode: '4.5.3',
    message: 'Too many recipients'
  },
  'TooManyAttachments': {
    smtpCode: SMTPErrorCode.MESSAGE_TOO_LARGE,
    enhancedCode: '5.3.4',
    message: 'Too many attachments'
  },
  'AttachmentTooLarge': {
    smtpCode: SMTPErrorCode.MESSAGE_TOO_LARGE,
    enhancedCode: '5.2.3',
    message: 'Attachment size exceeds limit'
  },
  'QuotaExceeded': {
    smtpCode: SMTPErrorCode.INSUFFICIENT_STORAGE,
    enhancedCode: '4.2.2',
    message: 'Mailbox quota exceeded'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGE REJECTION ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'MessageRejectedError': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Message rejected by policy'
  },
  'SpamDetected': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Message rejected as spam'
  },
  'VirusDetected': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Message rejected - virus detected'
  },
  'PolicyViolation': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Message rejected by policy'
  },
  'ContentFiltered': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Message content rejected by filter'
  },
  'BlacklistedSender': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.7.1',
    message: 'Sender address blacklisted'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DOMAIN/SENDER ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'DomainNotVerifiedError': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.1.8',
    message: 'Sender domain not verified'
  },
  'SenderNotAuthorized': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.1.0',
    message: 'Sender address not authorized for this mailbox'
  },
  'RelayDenied': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.7.1',
    message: 'Relaying denied'
  },
  'InvalidSenderDomain': {
    smtpCode: SMTPErrorCode.MAILBOX_NAME_INVALID,
    enhancedCode: '5.1.8',
    message: 'Invalid sender domain'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STATE/CONCURRENCY ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'AlreadyExistsError': {
    smtpCode: SMTPErrorCode.TRANSACTION_FAILED,
    enhancedCode: '5.0.0',
    message: 'Resource already exists'
  },
  'RaceConditionError': {
    smtpCode: SMTPErrorCode.LOCAL_ERROR,
    enhancedCode: '4.0.0',
    message: 'Temporary conflict, please retry'
  },
  'InboxDisabled': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.2.1',
    message: 'Mailbox disabled'
  },
  'InboxSuspended': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.2.1',
    message: 'Account suspended'
  },
  'OrganizationSuspended': {
    smtpCode: SMTPErrorCode.MAILBOX_NOT_FOUND,
    enhancedCode: '5.2.1',
    message: 'Organization account suspended'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TLS/SECURITY ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  'TLSRequired': {
    smtpCode: SMTPErrorCode.ENCRYPTION_REQUIRED,
    enhancedCode: '5.7.11',
    message: 'Encryption required for this operation'
  },
  'WeakAuthentication': {
    smtpCode: SMTPErrorCode.AUTH_TOO_WEAK,
    enhancedCode: '5.7.9',
    message: 'Authentication mechanism too weak'
  },
  'CertificateError': {
    smtpCode: SMTPErrorCode.ENCRYPTION_REQUIRED,
    enhancedCode: '5.7.11',
    message: 'TLS certificate verification failed'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SYSTEM ERRORS (Temporary - should trigger retry)
  // ─────────────────────────────────────────────────────────────────────────
  'ServerError': {
    smtpCode: SMTPErrorCode.LOCAL_ERROR,
    enhancedCode: '4.3.0',
    message: 'Temporary system error, please retry'
  },
  'DatabaseError': {
    smtpCode: SMTPErrorCode.LOCAL_ERROR,
    enhancedCode: '4.3.0',
    message: 'Temporary error, please retry'
  },
  'TimeoutError': {
    smtpCode: SMTPErrorCode.LOCAL_ERROR,
    enhancedCode: '4.4.1',
    message: 'Connection timeout'
  },
  'ServiceUnavailable': {
    smtpCode: SMTPErrorCode.SERVICE_UNAVAILABLE,
    enhancedCode: '4.3.0',
    message: 'Service temporarily unavailable'
  },
  'UpstreamError': {
    smtpCode: SMTPErrorCode.LOCAL_ERROR,
    enhancedCode: '4.4.1',
    message: 'Upstream service error'
  }
};

// ============================================================================
// MAIN ERROR MAPPING FUNCTION
// ============================================================================

export function mapToSMTPError(error: Error): SMTPError {
  // Try to match by error name/type
  const errorName = error.constructor.name;
  const mapping = ERROR_MAPPINGS[errorName];

  if (mapping) {
    return createSMTPError(mapping.smtpCode, mapping.enhancedCode, mapping.message);
  }

  // Try to match by error message patterns
  const message = error.message.toLowerCase();

  if (message.includes('not found') || message.includes('does not exist')) {
    return createSMTPError(550, '5.1.1', 'Requested resource not found');
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return createSMTPError(450, '4.7.1', 'Rate limit exceeded');
  }
  if (message.includes('auth') || message.includes('credential')) {
    return createSMTPError(535, '5.7.8', 'Authentication failed');
  }
  if (message.includes('size') || message.includes('large')) {
    return createSMTPError(552, '5.2.3', 'Message too large');
  }
  if (message.includes('invalid') || message.includes('format')) {
    return createSMTPError(501, '5.5.2', 'Invalid parameter');
  }
  if (message.includes('timeout')) {
    return createSMTPError(451, '4.4.1', 'Timeout occurred');
  }
  if (message.includes('rejected') || message.includes('denied')) {
    return createSMTPError(554, '5.7.1', 'Message rejected');
  }

  // Default: Temporary failure (allows retry)
  return createSMTPError(451, '4.3.0', 'Temporary failure, please retry');
}

// ============================================================================
// SMTP → HTTP STATUS MAPPING (For logging/webhooks)
// ============================================================================

interface HTTPStatus {
  status: number;
  error: string;
  retryable: boolean;
}

export const SMTP_TO_HTTP: Record<number, HTTPStatus> = {
  // Success
  220: { status: 200, error: '', retryable: false },
  221: { status: 200, error: '', retryable: false },
  235: { status: 200, error: '', retryable: false },
  250: { status: 200, error: '', retryable: false },
  354: { status: 100, error: '', retryable: false },

  // Temporary Failures → Retryable
  421: { status: 503, error: 'Service unavailable', retryable: true },
  450: { status: 429, error: 'Rate limited', retryable: true },
  451: { status: 500, error: 'Internal server error', retryable: true },
  452: { status: 507, error: 'Insufficient storage', retryable: true },
  454: { status: 503, error: 'TLS unavailable', retryable: true },

  // Permanent Failures → Not Retryable
  500: { status: 400, error: 'Bad request - syntax error', retryable: false },
  501: { status: 400, error: 'Bad request - invalid parameters', retryable: false },
  502: { status: 501, error: 'Not implemented', retryable: false },
  503: { status: 400, error: 'Bad request - wrong sequence', retryable: false },
  521: { status: 403, error: 'Server does not accept mail', retryable: false },
  530: { status: 401, error: 'Authentication required', retryable: false },
  534: { status: 403, error: 'Authentication too weak', retryable: false },
  535: { status: 401, error: 'Authentication failed', retryable: false },
  538: { status: 403, error: 'Encryption required', retryable: false },
  550: { status: 404, error: 'Mailbox not found', retryable: false },
  551: { status: 404, error: 'User not local', retryable: false },
  552: { status: 413, error: 'Message too large', retryable: false },
  553: { status: 400, error: 'Invalid mailbox name', retryable: false },
  554: { status: 422, error: 'Transaction failed', retryable: false },
  556: { status: 404, error: 'Recipient rejected', retryable: false }
};

export function mapFromSMTPCode(code: number): HTTPStatus {
  return SMTP_TO_HTTP[code] || { status: 500, error: 'Unknown error', retryable: true };
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

export function formatSMTPResponse(
  code: number,
  enhancedCode: string,
  message: string
): string {
  return `${code} ${enhancedCode} ${message}`;
}
