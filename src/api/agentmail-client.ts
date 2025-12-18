/**
 * AgentMail API Client
 *
 * SDK wrapper for sending emails through AgentMail API.
 * Includes proper error handling with HTTP→SMTP error mapping.
 */

import { AgentMailClient as SDKClient, AgentMailError, AgentMailTimeoutError } from 'agentmail';
import type { AgentMail } from 'agentmail';
import type { TransformedMessage } from '../email/transformer';
import { mapHttpToSmtp, SMTPErrorResult } from '../errors/http-to-smtp-mapping';
import Logger from '../utils/logger';

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

/**
 * Custom error class for AgentMail API errors
 *
 * Preserves HTTP status, API error body, and mapped SMTP error.
 */
export class SMTPAgentMailError extends Error {
  constructor(
    public httpStatus: number,
    public smtpError: SMTPErrorResult,
    public apiBody: unknown
  ) {
    super(`API error ${httpStatus}: ${JSON.stringify(apiBody)}`);
    this.name = 'SMTPAgentMailError';
  }
}

// ============================================================================
// SDK WRAPPER CLIENT
// ============================================================================

/**
 * AgentMail SDK Wrapper Client
 *
 * Wraps the official AgentMail SDK client with SMTP error conversion.
 */
export class SMTPAgentMailClient {
  private sdkClient: SDKClient;

  constructor(apiKey: string, timeoutInSeconds: number = 30) {
    this.sdkClient = new SDKClient({
      apiKey,
      timeoutInSeconds,
      maxRetries: 2,  // SDK handles exponential backoff
    });
  }

  /**
   * Send a message through the AgentMail API
   *
   * @param message - TransformedMessage with inbox_id
   * @returns SendMessageResponse on success
   * @throws SMTPAgentMailError on API error
   */
  async sendMessage(message: TransformedMessage): Promise<AgentMail.SendMessageResponse> {
    const { inbox_id, ...requestBody } = message;

    Logger.info('Sending message via SDK', {
      inbox_id,
      to: requestBody.to,
      subject: requestBody.subject,
    });

    try {
      // SDK returns HttpResponsePromise, await gets the data directly
      const response = await this.sdkClient.inboxes.messages.send(
        inbox_id,
        requestBody
      );

      Logger.info('Message sent successfully', {
        messageId: response.messageId,
        threadId: response.threadId,
      });

      return response;

    } catch (error) {
      // Handle SDK timeout error
      if (error instanceof AgentMailTimeoutError) {
        Logger.error('SDK timeout error', {
          message: error.message,
          inbox_id,
          recipients: requestBody.to,
          subject: requestBody.subject,
        });
        const smtpError = mapHttpToSmtp(504);  // Gateway Timeout
        throw new SMTPAgentMailError(504, smtpError, { error: 'timeout' });
      }

      // Handle SDK API errors (ValidationError, NotFoundError, MessageRejectedError all extend AgentMailError)
      if (error instanceof AgentMailError) {
        const httpStatus = error.statusCode || 500;
        Logger.error('SDK API error', {
          httpStatus,
          errorMessage: error.message,
          errorBody: error.body,
          inbox_id,
          recipients: requestBody.to,
          subject: requestBody.subject,
        });
        const smtpError = mapHttpToSmtp(httpStatus);
        throw new SMTPAgentMailError(httpStatus, smtpError, error.body);
      }

      // Handle network/unknown errors
      Logger.error('Unknown SDK error', {
        error: String(error),
        inbox_id,
        recipients: requestBody.to,
      });
      const smtpError = mapHttpToSmtp(502);  // Bad Gateway
      throw new SMTPAgentMailError(502, smtpError, { error: String(error) });
    }
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

// Export with original names for backward compatibility
export { SMTPAgentMailClient as AgentMailClient };
export { SMTPAgentMailError as AgentMailAPIError };
