/**
 * AgentMail SMTP Server Demo
 *
 * A demonstration SMTP server showing:
 * - Authentication with inbox_id (username) + API key (password)
 * - Stateful session management with command validation
 * - Comprehensive error handling with proper SMTP codes
 * - Message receiving and parsing
 */

import { SMTPServer, SMTPServerAuthentication, SMTPServerSession } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import { Readable } from 'stream';

import { validateSMTPCredentials } from './auth/validator';
import { AuthenticatedUser, createSMTPAuthError, AuthErrorCode, AUTH_ERRORS } from './auth/errors';
import { mapToSMTPError, SMTPErrorCode, createSMTPError } from './errors/mapping';
import Logger from './utils/logger';
import { printTestScenarios } from './mock/database';
import {
  sessionManager,
  SMTPSessionState,
  ConnectionMetadata
} from './session';
import { config } from './config';
import { transformToAgentMailFormat, validateTransformedMessage } from './email/transformer';
import { AgentMailClient, AgentMailAPIError } from './api/agentmail-client';

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

const PORT = config.smtp.port;
const MAX_MESSAGE_SIZE = config.smtp.maxMessageSize;

// ============================================================================
// SMTP SERVER HOOKS
// ============================================================================

/**
 * onConnect - Called when a client connects
 *
 * Creates a new session and initializes session state.
 */
function onConnect(
  session: SMTPServerSession,
  callback: (err?: Error | null) => void
): void {
  // Extract connection metadata
  const connection: ConnectionMetadata = {
    remoteAddress: session.remoteAddress,
    remotePort: session.remotePort,
    clientHostname: session.clientHostname,
    tlsEnabled: session.secure
  };

  // Create session in session manager
  sessionManager.createSession(session.id, connection);

  Logger.info('Client connected', {
    sessionId: session.id,
    remoteAddress: session.remoteAddress,
    clientHostname: session.clientHostname || 'unknown'
  });

  // Transition to HELLO state (EHLO/HELO is handled by smtp-server library)
  // smtp-server automatically handles EHLO, so we mark as HELLO here
  sessionManager.handleHello(session.id, session.clientHostname);

  callback();
}

/**
 * onAuth - Called when client sends AUTH command
 *
 * Validates credentials and updates session state to AUTHENTICATED.
 * Shows proper handling of:
 * - Invalid API key format
 * - API key not found
 * - Inbox not found
 * - Organization mismatch
 * - Revoked/expired keys
 * - Database errors (temporary failures)
 */
async function onAuth(
  auth: SMTPServerAuthentication,
  session: SMTPServerSession,
  callback: (err: Error | null | undefined, response?: { user: AuthenticatedUser }) => void
): Promise<void> {
  const startTime = Date.now();
  const smtpSession = sessionManager.getSession(session.id);

  // Check session exists
  if (!smtpSession) {
    Logger.error('Session not found during AUTH', { sessionId: session.id });
    return callback(createSMTPError(SMTPErrorCode.LOCAL_ERROR, '4.3.0', 'Session error'));
  }

  // Update activity
  sessionManager.updateActivity(session.id);

  // Verify we're in a valid state for authentication
  if (!sessionManager.canExecuteCommand(session.id, 'AUTH')) {
    Logger.warn('AUTH attempted in invalid state', {
      sessionId: session.id,
      currentState: smtpSession.state
    });
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  Logger.info('Authentication attempt', {
    sessionId: session.id,
    method: auth.method,
    username: auth.username ? auth.username.substring(0, 15) + '...' : 'none'
  });

  try {
    // Validate credentials using the validator module
    const result = await validateSMTPCredentials(auth.username || '', auth.password || '');

    if (!result.success) {
      // Log detailed error internally
      Logger.warn('Authentication failed', {
        sessionId: session.id,
        errorCode: result.error.code,
        logMessage: result.error.logMessage,
        durationMs: Date.now() - startTime
      });

      // Return SMTP error to client (generic message for security)
      Logger.smtpResponse(
        result.error.smtpCode,
        result.error.enhancedCode,
        result.error.message
      );

      return callback(createSMTPAuthError(result.error));
    }

    // Update session with authenticated user
    sessionManager.handleAuthentication(session.id, {
      inbox_id: result.user.inbox_id,
      organization_id: result.user.organization_id,
      email_address: result.user.email_address,
      api_key_id: result.user.api_key_id,
      api_key: auth.password || ''  // Store API key for later API calls
    });

    Logger.info('Authentication successful', {
      sessionId: session.id,
      inbox_id: result.user.inbox_id,
      organization_id: result.user.organization_id,
      durationMs: Date.now() - startTime
    });

    Logger.smtpResponse(235, '2.7.0', 'Authentication successful');

    callback(null, { user: result.user });

  } catch (unexpectedError) {
    // Catch-all for unexpected errors - return temporary failure
    Logger.error('Unexpected authentication error', {
      sessionId: session.id,
      error: (unexpectedError as Error).message
    });

    const tempError = {
      ...AUTH_ERRORS[AuthErrorCode.SERVICE_UNAVAILABLE],
      logMessage: `Unexpected error: ${(unexpectedError as Error).message}`
    };

    Logger.smtpResponse(454, '4.7.0', 'Temporary authentication failure');

    callback(createSMTPAuthError(tempError));
  }
}

/**
 * onMailFrom - Called when client sends MAIL FROM command
 *
 * Validates state transition and stores sender address.
 */
function onMailFrom(
  address: { address: string; args: Record<string, string | boolean> },
  session: SMTPServerSession,
  callback: (err?: Error | null) => void
): void {
  const smtpSession = sessionManager.getSession(session.id);

  // Check session exists
  if (!smtpSession) {
    Logger.error('Session not found during MAIL FROM', { sessionId: session.id });
    return callback(createSMTPError(SMTPErrorCode.LOCAL_ERROR, '4.3.0', 'Session error'));
  }

  // Update activity
  sessionManager.updateActivity(session.id);

  Logger.info('MAIL FROM received', {
    sessionId: session.id,
    from: address.address,
    currentState: smtpSession.state,
    authenticated: smtpSession.authenticated
  });

  // Must be authenticated (our server requires auth)
  if (!smtpSession.authenticated) {
    Logger.smtpResponse(530, '5.7.0', 'Authentication required');
    return callback(createSMTPError(SMTPErrorCode.AUTH_REQUIRED, '5.7.0', 'Authentication required'));
  }

  // Reset session if coming from COMPLETED state (sending another email)
  if (smtpSession.state === SMTPSessionState.COMPLETED) {
    sessionManager.resetForNewMessage(session.id);
  }

  // Validate command is allowed in current state
  if (!sessionManager.canExecuteCommand(session.id, 'MAIL')) {
    Logger.warn('MAIL FROM in invalid state', {
      sessionId: session.id,
      currentState: smtpSession.state
    });
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  // Update session state
  const updated = sessionManager.handleMailFrom(session.id, address.address);

  if (!updated) {
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  Logger.smtpResponse(250, '2.1.0', 'Sender OK');
  callback();
}

/**
 * onRcptTo - Called when client sends RCPT TO command
 *
 * Validates state transition and stores recipient address.
 */
function onRcptTo(
  address: { address: string; args: Record<string, string | boolean> },
  session: SMTPServerSession,
  callback: (err?: Error | null) => void
): void {
  const smtpSession = sessionManager.getSession(session.id);

  // Check session exists
  if (!smtpSession) {
    Logger.error('Session not found during RCPT TO', { sessionId: session.id });
    return callback(createSMTPError(SMTPErrorCode.LOCAL_ERROR, '4.3.0', 'Session error'));
  }

  // Update activity
  sessionManager.updateActivity(session.id);

  Logger.info('RCPT TO received', {
    sessionId: session.id,
    to: address.address,
    currentState: smtpSession.state,
    recipientCount: smtpSession.rcptTo.length + 1
  });

  // Validate command is allowed in current state
  if (!sessionManager.canExecuteCommand(session.id, 'RCPT')) {
    Logger.warn('RCPT TO in invalid state', {
      sessionId: session.id,
      currentState: smtpSession.state
    });
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  // Update session state (handleRcptTo checks recipient limit)
  const updated = sessionManager.handleRcptTo(session.id, address.address);

  if (!updated) {
    // Check if it was a recipient limit issue
    if (smtpSession.rcptTo.length >= 50) {
      Logger.smtpResponse(452, '4.5.3', 'Too many recipients');
      return callback(createSMTPError(SMTPErrorCode.INSUFFICIENT_STORAGE, '4.5.3', 'Too many recipients'));
    }
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  Logger.smtpResponse(250, '2.1.5', 'Recipient OK');
  callback();
}

/**
 * onData - Called when client sends DATA command and message content
 *
 * Validates state, parses message, and updates session.
 */
async function onData(
  stream: Readable,
  session: SMTPServerSession,
  callback: (err?: Error | null, message?: string) => void
): Promise<void> {
  const smtpSession = sessionManager.getSession(session.id);

  // Check session exists
  if (!smtpSession) {
    Logger.error('Session not found during DATA', { sessionId: session.id });
    return callback(createSMTPError(SMTPErrorCode.LOCAL_ERROR, '4.3.0', 'Session error'));
  }

  // Update activity
  sessionManager.updateActivity(session.id);

  // Validate command is allowed in current state
  if (!sessionManager.canExecuteCommand(session.id, 'DATA')) {
    Logger.warn('DATA in invalid state', {
      sessionId: session.id,
      currentState: smtpSession.state
    });
    Logger.smtpResponse(503, '5.5.1', 'Bad sequence of commands');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'Bad sequence of commands'));
  }

  // Must have at least one recipient
  if (smtpSession.rcptTo.length === 0) {
    Logger.smtpResponse(503, '5.5.1', 'No recipients specified');
    return callback(createSMTPError(SMTPErrorCode.BAD_SEQUENCE, '5.5.1', 'No recipients specified'));
  }

  // Transition to DATA state
  sessionManager.handleDataStart(session.id);

  Logger.info('DATA received, processing message', {
    sessionId: session.id,
    from: smtpSession.mailFrom,
    recipientCount: smtpSession.rcptTo.length
  });

  try {
    // Parse the email message
    const parsed: ParsedMail = await simpleParser(stream);

    // Log parsed message details
    Logger.info('Message parsed successfully', {
      sessionId: session.id,
      subject: parsed.subject || '(no subject)',
      from: parsed.from?.text,
      hasHtml: !!parsed.html,
      hasText: !!parsed.text,
      attachmentCount: parsed.attachments?.length || 0
    });

    // Transform email to AgentMail API format
    Logger.info('Transforming email for AgentMail API', {
      sessionId: session.id,
      inbox_id: smtpSession.user!.inbox_id,
      recipientCount: smtpSession.rcptTo.length,
      hasAttachments: (parsed.attachments?.length || 0) > 0
    });

    const apiMessage = transformToAgentMailFormat(parsed, smtpSession);

    // Validate before sending
    validateTransformedMessage(apiMessage);

    // Log API call
    Logger.info('Calling AgentMail API', {
      sessionId: session.id,
      endpoint: '/v0/messages',
      messageSize: JSON.stringify(apiMessage).length
    });

    // Create SDK client with user's API key (per-request)
    const sdkClient = new AgentMailClient(
      smtpSession.user!.api_key,
      Math.floor(config.agentmail.timeout / 1000)  // Convert ms to seconds
    );

    // Send via SDK client
    const result = await sdkClient.sendMessage(apiMessage);

    // Log success
    Logger.info('Email sent successfully', {
      sessionId: session.id,
      messageId: result.messageId,
      threadId: result.threadId
    });

    // Complete the DATA phase
    sessionManager.handleDataComplete(session.id, result.messageId);

    Logger.smtpResponse(250, '2.0.0', `Message queued as ${result.messageId}`);

    callback(null, `Message queued as ${result.messageId}`);

  } catch (error) {
    // Handle AgentMail API errors
    if (error instanceof AgentMailAPIError) {
      Logger.error('AgentMail API error in onData', {
        sessionId: session.id,
        httpStatus: error.httpStatus,
        smtpCode: error.smtpError.smtpCode
      });

      Logger.smtpResponse(
        error.smtpError.smtpCode,
        error.smtpError.enhancedCode,
        error.smtpError.message
      );

      const smtpError = createSMTPError(
        error.smtpError.smtpCode as SMTPErrorCode,
        error.smtpError.enhancedCode,
        error.smtpError.message
      );
      return callback(smtpError);
    }

    // Handle validation errors
    if (error instanceof Error && error.message.includes('Invalid')) {
      Logger.error('Validation error', {
        sessionId: session.id,
        error: error.message
      });

      Logger.smtpResponse(550, '5.1.1', error.message);
      return callback(createSMTPError(SMTPErrorCode.MAILBOX_NOT_FOUND, '5.1.1', error.message));
    }

    // Handle parse errors and other errors
    Logger.error('Failed to process message', {
      sessionId: session.id,
      error: (error as Error).message
    });

    const smtpError = mapToSMTPError(error as Error);
    Logger.smtpResponse(smtpError.responseCode, smtpError.enhancedCode, smtpError.message);

    callback(smtpError);
  }
}

/**
 * onClose - Called when connection closes
 *
 * Cleans up session data.
 */
function onClose(session: SMTPServerSession): void {
  const smtpSession = sessionManager.getSession(session.id);

  Logger.info('Client disconnected', {
    sessionId: session.id,
    remoteAddress: session.remoteAddress,
    finalState: smtpSession?.state,
    messagesDelivered: smtpSession?.messageCount || 0
  });

  // Delete the session
  sessionManager.deleteSession(session.id);
}

// ============================================================================
// CREATE AND START SERVER
// ============================================================================

const server = new SMTPServer({
  // Disable TLS for demo (would enable in production)
  secure: false,
  disabledCommands: ['STARTTLS'],

  // Authentication
  authMethods: ['PLAIN', 'LOGIN'],
  authOptional: false, // Require authentication

  // Limits
  size: MAX_MESSAGE_SIZE,

  // Banner
  banner: 'AgentMail SMTP Demo Server',

  // Hooks
  onConnect,
  onAuth,
  onMailFrom,
  onRcptTo,
  onData,
  onClose,

  // Built-in logging (we use our own logger, but enable for debug)
  logger: false
});

// Error handling
server.on('error', (err: Error) => {
  Logger.error('SMTP Server error', { error: err.message });
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('    AgentMail SMTP Server Demo');
  console.log('='.repeat(60));
  console.log(`\n  Server running on port ${PORT}`);
  console.log('  Auth: PLAIN/LOGIN (inbox_id + API key)');
  console.log('  TLS: Disabled (demo only)');
  console.log(`  Max message size: ${MAX_MESSAGE_SIZE / 1024 / 1024}MB`);
  console.log('  Session timeout: 30 minutes');
  console.log('\n  Test with swaks:');
  console.log(`    swaks --to test@example.com \\`);
  console.log(`          --from test@agentmail.dev \\`);
  console.log(`          --server localhost:${PORT} \\`);
  console.log(`          --auth PLAIN \\`);
  console.log(`          --auth-user inb_valid1234567890 \\`);
  console.log(`          --auth-password am_validkey12345678901234567890123456`);
  console.log('\n' + '='.repeat(60));

  // Print test scenarios
  printTestScenarios();

  console.log('='.repeat(60));
  console.log('  Server ready. Waiting for connections...');
  console.log('='.repeat(60) + '\n');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  Logger.info('Shutting down SMTP server...');
  sessionManager.stopCleanupTimer();
  server.close(() => {
    Logger.info('SMTP server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  Logger.info('Shutting down SMTP server...');
  sessionManager.stopCleanupTimer();
  server.close(() => {
    Logger.info('SMTP server closed');
    process.exit(0);
  });
});
