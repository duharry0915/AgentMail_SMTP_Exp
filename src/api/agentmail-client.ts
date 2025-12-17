/**
 * AgentMail API Client
 *
 * HTTP client for sending emails through AgentMail API.
 * Includes proper error handling with HTTP→SMTP error mapping.
 */

import { mapHttpToSmtp, SMTPErrorResult } from '../errors/http-to-smtp-mapping';
import { AgentMailMessage } from '../email/transformer';
import Logger from '../utils/logger';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * AgentMail API success response
 * Endpoint: POST /v0/inboxes/{inbox_id}/messages/send
 */
export interface SendMessageResponse {
  message_id: string;
  thread_id: string;
}

/**
 * AgentMail API error response (when HTTP 4xx/5xx)
 */
export interface AgentMailAPIErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  retry_after?: number;  // For rate limiting (429)
}

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

/**
 * Custom error class for AgentMail API errors
 *
 * Includes HTTP status, API error body, and mapped SMTP error.
 */
export class AgentMailAPIError extends Error {
  constructor(
    public httpStatus: number,
    public apiErrorBody: AgentMailAPIErrorResponse,
    public smtpError: SMTPErrorResult
  ) {
    super(`AgentMail API error (HTTP ${httpStatus}): ${apiErrorBody?.message || 'Unknown error'}`);
    this.name = 'AgentMailAPIError';
  }
}

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * AgentMail API Client
 *
 * Sends messages through the AgentMail API with proper error handling.
 */
export class AgentMailClient {
  constructor(
    private baseUrl: string,
    private timeoutMs: number = 30000
  ) {}

  /**
   * Send a message through the AgentMail API
   *
   * @param message - AgentMail message format
   * @param apiKey - API key for authentication
   * @returns SendMessageResponse on success
   * @throws AgentMailAPIError on API error
   */
  async sendMessage(
    message: AgentMailMessage,
    apiKey: string
  ): Promise<SendMessageResponse> {
    // Correct endpoint: /v0/inboxes/{inbox_id}/messages/send
    const endpoint = `${this.baseUrl}/v0/inboxes/${encodeURIComponent(message.inbox_id)}/messages/send`;

    Logger.info('Sending message to AgentMail API', {
      endpoint,
      inbox_id: message.inbox_id,
      recipientCount: message.to.length
    });

    // Build request body (without inbox_id - it's in the URL path)
    const { inbox_id, ...requestBody } = message;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorBody: AgentMailAPIErrorResponse;

        try {
          errorBody = await response.json() as AgentMailAPIErrorResponse;
        } catch {
          errorBody = {
            error: 'unknown',
            message: `HTTP ${response.status}: ${response.statusText}`
          };
        }

        Logger.error('AgentMail API error', {
          status: response.status,
          error: JSON.stringify(errorBody)
        });

        const smtpError = mapHttpToSmtp(response.status);
        throw new AgentMailAPIError(response.status, errorBody, smtpError);
      }

      const result = await response.json() as SendMessageResponse;

      Logger.info('AgentMail API success', {
        message_id: result.message_id,
        thread_id: result.thread_id
      });

      return result;

    } catch (error) {
      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        Logger.error('API request timeout', {
          timeoutMs: this.timeoutMs
        });
        const smtpError = mapHttpToSmtp(504);  // Gateway timeout
        throw new AgentMailAPIError(
          504,
          { error: 'timeout', message: 'Request timed out' },
          smtpError
        );
      }

      // Re-throw AgentMailAPIError
      if (error instanceof AgentMailAPIError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        const isNetworkError =
          error.message?.includes('fetch') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('network');

        if (isNetworkError) {
          Logger.error('Network error', { error: error.message });
          const smtpError = mapHttpToSmtp(502);  // Bad gateway
          throw new AgentMailAPIError(
            502,
            { error: 'network', message: error.message },
            smtpError
          );
        }
      }

      // Unknown error - re-throw
      throw error;
    }
  }
}
