/**
 * HTTP to SMTP Error Code Mapping
 *
 * Maps HTTP status codes from AgentMail API responses to appropriate SMTP codes.
 *
 * Key insight from SMTP RFC:
 * - 4xx SMTP = Temporary failure (client SHOULD retry)
 * - 5xx SMTP = Permanent failure (client MUST NOT retry)
 *
 * Mapping logic:
 * - 2xx HTTP → 250 SMTP (success)
 * - 4xx HTTP → 5xx SMTP (client error = permanent, don't retry)
 * - 5xx HTTP → 4xx SMTP (server error = temporary, should retry)
 * - Exception: 429 → 450 (rate limit is retryable)
 *
 * CTO Question Answer:
 * Q: "If API returns 403 Forbidden, what should SMTP return?"
 * A: 550 5.7.1 "Access denied" (permanent failure, not retryable)
 */

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Mapping entry for HTTP to SMTP conversion
 */
export interface HTTPToSMTPMapping {
  /** HTTP status code */
  httpStatus: number;
  /** SMTP response code */
  smtpCode: number;
  /** Enhanced SMTP status code (RFC 3463) */
  enhancedCode: string;
  /** Human-readable message for SMTP response */
  message: string;
  /** Whether the client should retry this request */
  retryable: boolean;
  /** Description for internal logging */
  description: string;
}

/**
 * Result from mapHttpToSmtp function
 */
export interface SMTPErrorResult {
  /** SMTP response code */
  smtpCode: number;
  /** Enhanced SMTP status code */
  enhancedCode: string;
  /** Human-readable message */
  message: string;
  /** Whether the client should retry */
  retryable: boolean;
}

// ============================================================================
// HTTP TO SMTP MAPPINGS
// ============================================================================

export const HTTP_TO_SMTP_MAPPINGS: Record<number, HTTPToSMTPMapping> = {
  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS CODES (2xx HTTP → 250 SMTP)
  // ─────────────────────────────────────────────────────────────────────────
  200: {
    httpStatus: 200,
    smtpCode: 250,
    enhancedCode: '2.0.0',
    message: 'Message accepted for delivery',
    retryable: false,
    description: 'OK - Request successful'
  },
  201: {
    httpStatus: 201,
    smtpCode: 250,
    enhancedCode: '2.0.0',
    message: 'Message queued successfully',
    retryable: false,
    description: 'Created - Resource created successfully'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CLIENT ERRORS (4xx HTTP → 5xx SMTP - Permanent, don't retry)
  // ─────────────────────────────────────────────────────────────────────────
  400: {
    httpStatus: 400,
    smtpCode: 501,
    enhancedCode: '5.5.2',
    message: 'Invalid message format or parameters',
    retryable: false,
    description: 'Bad Request - Malformed request syntax'
  },
  401: {
    httpStatus: 401,
    smtpCode: 535,
    enhancedCode: '5.7.8',
    message: 'Authentication credentials invalid',
    retryable: false,
    description: 'Unauthorized - Authentication required or failed'
  },
  403: {
    httpStatus: 403,
    smtpCode: 550,
    enhancedCode: '5.7.1',
    message: 'Access denied',
    retryable: false,
    description: 'Forbidden - Access denied to resource'
  },
  404: {
    httpStatus: 404,
    smtpCode: 550,
    enhancedCode: '5.1.1',
    message: 'Mailbox not found',
    retryable: false,
    description: 'Not Found - Resource does not exist'
  },
  413: {
    httpStatus: 413,
    smtpCode: 552,
    enhancedCode: '5.2.3',
    message: 'Message size exceeds maximum allowed',
    retryable: false,
    description: 'Payload Too Large - Message exceeds size limit'
  },
  422: {
    httpStatus: 422,
    smtpCode: 554,
    enhancedCode: '5.6.0',
    message: 'Message content rejected',
    retryable: false,
    description: 'Unprocessable Entity - Semantic errors in content'
  },
  429: {
    httpStatus: 429,
    smtpCode: 450,
    enhancedCode: '4.7.1',
    message: 'Rate limit exceeded, try again later',
    retryable: true, // NOTE: 429 is special - it's retryable
    description: 'Too Many Requests - Rate limit exceeded'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SERVER ERRORS (5xx HTTP → 4xx SMTP - Temporary, should retry)
  // ─────────────────────────────────────────────────────────────────────────
  500: {
    httpStatus: 500,
    smtpCode: 451,
    enhancedCode: '4.3.0',
    message: 'Temporary system error, please retry',
    retryable: true,
    description: 'Internal Server Error - Unexpected server error'
  },
  502: {
    httpStatus: 502,
    smtpCode: 451,
    enhancedCode: '4.4.1',
    message: 'Upstream service unavailable, please retry',
    retryable: true,
    description: 'Bad Gateway - Invalid response from upstream'
  },
  503: {
    httpStatus: 503,
    smtpCode: 421,
    enhancedCode: '4.3.0',
    message: 'Service temporarily unavailable',
    retryable: true,
    description: 'Service Unavailable - Server overloaded or in maintenance'
  },
  504: {
    httpStatus: 504,
    smtpCode: 451,
    enhancedCode: '4.4.1',
    message: 'Gateway timeout, please retry',
    retryable: true,
    description: 'Gateway Timeout - Upstream server timeout'
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps an HTTP status code to an SMTP error response.
 *
 * @param httpStatus - The HTTP status code from the API response
 * @returns SMTPErrorResult with appropriate SMTP code, enhanced code, message, and retry flag
 *
 * @example
 * const result = mapHttpToSmtp(403);
 * // Returns: { smtpCode: 550, enhancedCode: '5.7.1', message: 'Access denied', retryable: false }
 *
 * @example
 * const result = mapHttpToSmtp(500);
 * // Returns: { smtpCode: 451, enhancedCode: '4.3.0', message: 'Temporary system error, please retry', retryable: true }
 */
export function mapHttpToSmtp(httpStatus: number): SMTPErrorResult {
  const mapping = HTTP_TO_SMTP_MAPPINGS[httpStatus];

  if (mapping) {
    return {
      smtpCode: mapping.smtpCode,
      enhancedCode: mapping.enhancedCode,
      message: mapping.message,
      retryable: mapping.retryable
    };
  }

  // Default handling for unmapped status codes
  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      smtpCode: 250,
      enhancedCode: '2.0.0',
      message: 'Message accepted',
      retryable: false
    };
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    // Client errors (except 429) are permanent failures
    return {
      smtpCode: 550,
      enhancedCode: '5.0.0',
      message: 'Request rejected',
      retryable: false
    };
  }

  // 5xx or unknown - treat as temporary failure
  return {
    smtpCode: 451,
    enhancedCode: '4.3.0',
    message: 'Temporary failure, please retry',
    retryable: true
  };
}

/**
 * Check if an HTTP status code represents a retryable error.
 *
 * Retryable statuses:
 * - 429 (Rate Limited) - special case, retryable
 * - 5xx (Server errors) - temporary, retryable
 *
 * Non-retryable statuses:
 * - 2xx (Success) - no need to retry
 * - 4xx except 429 (Client errors) - permanent, don't retry
 *
 * @param httpStatus - The HTTP status code
 * @returns boolean indicating if the client should retry
 *
 * @example
 * isRetryableHttpStatus(429) // true - rate limit, wait and retry
 * isRetryableHttpStatus(500) // true - server error, retry
 * isRetryableHttpStatus(403) // false - forbidden, don't retry
 * isRetryableHttpStatus(404) // false - not found, don't retry
 */
export function isRetryableHttpStatus(httpStatus: number): boolean {
  // Check explicit mappings first
  const mapping = HTTP_TO_SMTP_MAPPINGS[httpStatus];
  if (mapping) {
    return mapping.retryable;
  }

  // Default rules:
  // - 429 is always retryable (rate limit)
  // - 5xx is retryable (server error)
  // - Everything else is not
  return httpStatus === 429 || httpStatus >= 500;
}

/**
 * Get the full mapping details for an HTTP status code.
 * Useful for logging and debugging.
 *
 * @param httpStatus - The HTTP status code
 * @returns Full mapping details or undefined if not explicitly mapped
 */
export function getHttpMapping(httpStatus: number): HTTPToSMTPMapping | undefined {
  return HTTP_TO_SMTP_MAPPINGS[httpStatus];
}

/**
 * Format SMTP error response string.
 *
 * @param result - SMTPErrorResult from mapHttpToSmtp
 * @returns Formatted SMTP response string
 *
 * @example
 * formatSmtpResponse(mapHttpToSmtp(403))
 * // Returns: "550 5.7.1 Access denied"
 */
export function formatSmtpResponse(result: SMTPErrorResult): string {
  return `${result.smtpCode} ${result.enhancedCode} ${result.message}`;
}
