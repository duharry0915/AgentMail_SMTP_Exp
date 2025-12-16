/**
 * Email Transformer
 *
 * Converts ParsedMail (from mailparser) to AgentMail API format.
 */

import { ParsedMail, Attachment, Headers } from 'mailparser';
import { SMTPSession } from '../session/session-state';
import Logger from '../utils/logger';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * AgentMail API message format
 */
export interface AgentMailMessage {
  inbox_id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: AgentMailAttachment[];
  headers?: Record<string, string>;
  reply_to?: string;
}

/**
 * AgentMail attachment format
 */
export interface AgentMailAttachment {
  filename: string;
  content: string;          // base64
  content_type: string;
  size?: number;
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
function transformAttachment(att: Attachment): AgentMailAttachment {
  return {
    filename: att.filename || 'untitled',
    content: att.content.toString('base64'),  // Buffer → base64 string
    content_type: att.contentType,
    size: att.size
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
 * @returns AgentMailMessage ready for API submission
 */
export function transformToAgentMailFormat(
  parsed: ParsedMail,
  session: SMTPSession
): AgentMailMessage {
  Logger.info('Transforming email', {
    from: parsed.from?.text,
    to: parsed.to ? extractAddresses(parsed.to).join(', ') : 'none',
    subject: parsed.subject || '(no subject)',
    hasHtml: !!parsed.html,
    hasText: !!parsed.text,
    attachmentCount: parsed.attachments?.length || 0
  });

  const message: AgentMailMessage = {
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

  const replyTo = extractAddresses(parsed.replyTo);
  if (replyTo.length > 0) {
    message.reply_to = replyTo[0];
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
export function validateAgentMailMessage(message: AgentMailMessage): void {
  if (!message.inbox_id) {
    throw new Error('inbox_id is required');
  }

  if (!message.to || message.to.length === 0) {
    throw new Error('At least one recipient (to) is required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const email of message.to) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }

  if (message.cc) {
    for (const email of message.cc) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid CC email address: ${email}`);
      }
    }
  }

  if (message.bcc) {
    for (const email of message.bcc) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid BCC email address: ${email}`);
      }
    }
  }

  Logger.info('Message validation passed', {
    inbox_id: message.inbox_id,
    recipientCount: message.to.length + (message.cc?.length || 0) + (message.bcc?.length || 0)
  });
}
