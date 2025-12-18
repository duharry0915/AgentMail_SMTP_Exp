/**
 * Email Transformer
 *
 * Converts ParsedMail (from mailparser) to AgentMail API format.
 */

import { ParsedMail, Attachment, Headers } from 'mailparser';
import { AgentMail } from 'agentmail';
import { SMTPSession } from '../session/session-state';
import Logger from '../utils/logger';

// ============================================================================
// INTERFACES (using SDK types)
// ============================================================================

/**
 * Extended message type that includes inbox_id for internal routing.
 * The inbox_id is removed before sending to API (it goes in URL path).
 */
export interface TransformedMessage extends AgentMail.SendMessageRequest {
  inbox_id: string;  // For internal use, not sent in body
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract email addresses from ParsedMail AddressObject
 * Handles undefined, single object, and array of objects
 */
function extractAddresses(
  addressObj: ParsedMail['to'] | ParsedMail['cc'] | ParsedMail['bcc'] | ParsedMail['replyTo']
): string[] {
  if (!addressObj) return [];

  const addresses = Array.isArray(addressObj) ? addressObj : [addressObj];

  return addresses.flatMap(obj =>
    obj.value.map(addr => addr.address).filter((addr): addr is string => !!addr)
  );
}

/**
 * Transform mailparser Attachment to AgentMail format
 */
function transformAttachment(att: Attachment): AgentMail.SendAttachment {
  return {
    filename: att.filename || 'untitled',
    content: att.content.toString('base64'),  // Buffer → base64 string
    contentType: att.contentType,  // camelCase for SDK
  };
}

/**
 * Extract custom headers (X-* headers and important ones)
 */
function extractCustomHeaders(headers?: Headers): Record<string, string> | undefined {
  if (!headers) return undefined;

  const customHeaders: Record<string, string> = {};
  const importantHeaders = ['message-id', 'references', 'in-reply-to'];

  // Headers is a Map-like object
  headers.forEach((value, key) => {
    const keyLower = key.toLowerCase();
    if (keyLower.startsWith('x-') || importantHeaders.includes(keyLower)) {
      customHeaders[key] = String(value);
    }
  });

  return Object.keys(customHeaders).length > 0 ? customHeaders : undefined;
}

// ============================================================================
// MAIN TRANSFORMATION FUNCTION
// ============================================================================

/**
 * Transform ParsedMail to AgentMail API format
 *
 * @param parsed - Parsed email from mailparser
 * @param session - SMTP session with authenticated user
 * @returns TransformedMessage ready for API submission
 */
export function transformToAgentMailFormat(
  parsed: ParsedMail,
  session: SMTPSession
): TransformedMessage {
  Logger.info('Transforming email', {
    from: parsed.from?.text,
    to: parsed.to ? extractAddresses(parsed.to).join(', ') : 'none',
    subject: parsed.subject || '(no subject)',
    hasHtml: !!parsed.html,
    hasText: !!parsed.text,
    attachmentCount: parsed.attachments?.length || 0
  });

  const message: TransformedMessage = {
    inbox_id: session.user!.inbox_id,
    to: extractAddresses(parsed.to),
    subject: parsed.subject || '(no subject)',
  };

  // Add optional fields only if present
  const cc = extractAddresses(parsed.cc);
  if (cc.length > 0) {
    message.cc = cc;
  }

  const bcc = extractAddresses(parsed.bcc);
  if (bcc.length > 0) {
    message.bcc = bcc;
  }

  if (parsed.text) {
    message.text = parsed.text;
  }

  if (parsed.html) {
    message.html = typeof parsed.html === 'string' ? parsed.html : undefined;
  }

  if (parsed.attachments && parsed.attachments.length > 0) {
    message.attachments = parsed.attachments.map(transformAttachment);
  }

  const replyToAddrs = extractAddresses(parsed.replyTo);
  if (replyToAddrs.length > 0) {
    message.replyTo = replyToAddrs;  // camelCase for SDK, array format
  }

  const customHeaders = extractCustomHeaders(parsed.headers);
  if (customHeaders) {
    message.headers = customHeaders;
  }

  return message;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate transformed message before sending to API
 * @throws Error if validation fails
 */
export function validateTransformedMessage(message: TransformedMessage): void {
  if (!message.inbox_id) {
    throw new Error('inbox_id is required');
  }

  // SDK to field can be string | string[] | undefined
  const toAddresses = normalizeAddresses(message.to);
  if (toAddresses.length === 0) {
    throw new Error('At least one recipient (to) is required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const email of toAddresses) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }

  const ccAddresses = normalizeAddresses(message.cc);
  for (const email of ccAddresses) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid CC email address: ${email}`);
    }
  }

  const bccAddresses = normalizeAddresses(message.bcc);
  for (const email of bccAddresses) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid BCC email address: ${email}`);
    }
  }

  Logger.info('Message validation passed', {
    inbox_id: message.inbox_id,
    recipientCount: toAddresses.length + ccAddresses.length + bccAddresses.length
  });
}

/**
 * Normalize addresses from SDK format (string | string[] | undefined) to string[]
 */
function normalizeAddresses(addresses: string | string[] | undefined): string[] {
  if (!addresses) return [];
  return Array.isArray(addresses) ? addresses : [addresses];
}
