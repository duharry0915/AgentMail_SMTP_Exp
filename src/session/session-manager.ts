/**
 * SMTP Session Manager
 *
 * Manages session lifecycle, state transitions, and cleanup.
 * Implements command-based state validation for SMTP protocol compliance.
 */

import {
  SMTPSession,
  SMTPSessionState,
  SessionUser,
  SessionRecipient,
  ConnectionMetadata,
  StateTransition,
  SESSION_TIMEOUT_MS,
  CLEANUP_INTERVAL_MS,
  MAX_RECIPIENTS,
  canExecuteCommandInState,
  getNextState,
  createEmptySession
} from './session-state';
import Logger from '../utils/logger';

// ============================================================================
// SESSION MANAGER CLASS
// ============================================================================

/**
 * SessionManager handles all session operations for the SMTP server.
 *
 * Responsibilities:
 * - Creating new sessions on connection
 * - Managing state transitions with command-based validation
 * - Tracking session data (user, mailFrom, rcptTo, etc.)
 * - Cleaning up expired sessions
 * - Providing session state for hook validation
 */
export class SessionManager {
  /** In-memory session storage */
  private sessions: Map<string, SMTPSession> = new Map();

  /** Cleanup interval handle */
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor() {
    this.sessions = new Map();
    this.startCleanupTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new session when client connects.
   *
   * @param sessionId - Unique session ID from smtp-server
   * @param connection - Connection metadata
   * @returns The created session
   */
  createSession(sessionId: string, connection: ConnectionMetadata): SMTPSession {
    const session = createEmptySession(sessionId, connection);
    this.sessions.set(sessionId, session);

    Logger.info('Session created', {
      sessionId,
      state: session.state,
      remoteAddress: connection.remoteAddress
    });

    return session;
  }

  /**
   * Get an existing session by ID.
   *
   * @param sessionId - Session identifier
   * @returns Session or undefined if not found
   */
  getSession(sessionId: string): SMTPSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session (on disconnect or timeout).
   *
   * @param sessionId - Session identifier
   * @returns true if session was deleted, false if not found
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      const durationMs = Date.now() - session.timestamps.createdAt.getTime();
      Logger.info('Session deleted', {
        sessionId,
        finalState: session.state,
        messagesDelivered: session.messageCount,
        durationMs
      });
      return this.sessions.delete(sessionId);
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMAND VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a command can be executed in the session's current state.
   *
   * @param sessionId - Session identifier
   * @param command - SMTP command (e.g., 'MAIL', 'RCPT', 'DATA')
   * @returns true if command is allowed
   */
  canExecuteCommand(sessionId: string, command: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }
    return canExecuteCommandInState(session.state, command);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Transition session to a new state after command execution.
   *
   * @param sessionId - Session identifier
   * @param command - Command that triggered the transition
   * @param newState - Target state
   * @returns Updated session or null if transition invalid
   */
  private transitionState(
    sessionId: string,
    command: string,
    newState: SMTPSessionState
  ): SMTPSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      Logger.error('Session not found for state transition', { sessionId, command, newState });
      return null;
    }

    const currentState = session.state;

    // Record transition in history
    const transition: StateTransition = {
      from: currentState,
      to: newState,
      timestamp: new Date(),
      command
    };
    session.stateHistory.push(transition);

    session.state = newState;
    session.timestamps.lastActivityAt = new Date();

    Logger.info('Session state transition', {
      sessionId,
      from: currentState,
      to: newState,
      command
    });

    return session;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMAND HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handle EHLO/HELO command - transition to HELLO state.
   *
   * @param sessionId - Session identifier
   * @param clientHostname - Hostname provided by client
   * @returns Updated session or null if invalid
   */
  handleHello(sessionId: string, clientHostname?: string): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const nextState = getNextState(session.state, 'EHLO');
    if (!nextState) {
      Logger.warn('Invalid EHLO/HELO in state', { sessionId, currentState: session.state });
      return null;
    }

    if (clientHostname) {
      session.connection.clientHostname = clientHostname;
    }

    return this.transitionState(sessionId, 'EHLO', nextState);
  }

  /**
   * Handle successful AUTH - store user and transition to AUTHENTICATED.
   *
   * @param sessionId - Session identifier
   * @param user - Authenticated user information
   * @returns Updated session or null if invalid
   */
  handleAuthentication(sessionId: string, user: SessionUser): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const nextState = getNextState(session.state, 'AUTH');
    if (!nextState) {
      Logger.warn('Invalid AUTH in state', { sessionId, currentState: session.state });
      return null;
    }

    session.user = user;
    session.authenticated = true;
    session.timestamps.authenticatedAt = new Date();

    Logger.info('Session authenticated', {
      sessionId,
      inbox_id: user.inbox_id,
      organization_id: user.organization_id
    });

    return this.transitionState(sessionId, 'AUTH', nextState);
  }

  /**
   * Handle MAIL FROM command - store sender and transition to MAIL_FROM.
   *
   * @param sessionId - Session identifier
   * @param mailFrom - Sender email address
   * @returns Updated session or null if invalid
   */
  handleMailFrom(sessionId: string, mailFrom: string): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const nextState = getNextState(session.state, 'MAIL');
    if (!nextState) {
      Logger.warn('Invalid MAIL FROM in state', { sessionId, currentState: session.state });
      return null;
    }

    session.mailFrom = mailFrom;
    session.timestamps.mailFromAt = new Date();
    // Clear any previous recipients
    session.rcptTo = [];
    session.messageData = undefined;
    session.messageId = undefined;

    Logger.info('MAIL FROM stored', {
      sessionId,
      mailFrom
    });

    return this.transitionState(sessionId, 'MAIL', nextState);
  }

  /**
   * Handle RCPT TO command - add recipient and ensure state is RCPT_TO.
   *
   * @param sessionId - Session identifier
   * @param recipient - Recipient email address
   * @returns Updated session or null if invalid/limit exceeded
   */
  handleRcptTo(sessionId: string, recipient: string): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Check recipient limit
    if (session.rcptTo.length >= MAX_RECIPIENTS) {
      Logger.warn('Recipient limit exceeded', {
        sessionId,
        limit: MAX_RECIPIENTS,
        current: session.rcptTo.length
      });
      return null;
    }

    const nextState = getNextState(session.state, 'RCPT');
    if (!nextState) {
      Logger.warn('Invalid RCPT TO in state', { sessionId, currentState: session.state });
      return null;
    }

    // Add recipient
    const recipientEntry: SessionRecipient = {
      address: recipient,
      addedAt: new Date()
    };
    session.rcptTo.push(recipientEntry);

    Logger.info('Recipient added', {
      sessionId,
      recipient,
      totalRecipients: session.rcptTo.length
    });

    // Only transition state if we're not already in RCPT_TO
    if (session.state !== SMTPSessionState.RCPT_TO) {
      return this.transitionState(sessionId, 'RCPT', nextState);
    }

    // Update activity timestamp
    session.timestamps.lastActivityAt = new Date();
    return session;
  }

  /**
   * Handle DATA command start - transition to DATA state.
   *
   * @param sessionId - Session identifier
   * @returns Updated session or null if invalid
   */
  handleDataStart(sessionId: string): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Must have at least one recipient
    if (session.rcptTo.length === 0) {
      Logger.warn('DATA without recipients', { sessionId });
      return null;
    }

    const nextState = getNextState(session.state, 'DATA');
    if (!nextState) {
      Logger.warn('Invalid DATA in state', { sessionId, currentState: session.state });
      return null;
    }

    session.timestamps.dataStartedAt = new Date();

    return this.transitionState(sessionId, 'DATA', nextState);
  }

  /**
   * Handle DATA completion - store message ID and transition to COMPLETED.
   *
   * @param sessionId - Session identifier
   * @param messageId - Assigned message ID
   * @returns Updated session or null if invalid
   */
  handleDataComplete(sessionId: string, messageId: string): SMTPSession | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const nextState = getNextState(session.state, 'DATA_COMPLETE');
    if (!nextState) {
      Logger.warn('Invalid DATA_COMPLETE in state', { sessionId, currentState: session.state });
      return null;
    }

    session.messageId = messageId;
    session.timestamps.completedAt = new Date();
    session.messageCount++;

    Logger.info('Message completed', {
      sessionId,
      messageId,
      messageCount: session.messageCount
    });

    return this.transitionState(sessionId, 'DATA_COMPLETE', nextState);
  }

  /**
   * Reset session for sending another message in the same connection.
   *
   * Called when MAIL FROM is received in COMPLETED state.
   * Keeps user and connection info, clears email data.
   *
   * @param sessionId - Session identifier
   */
  resetForNewMessage(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      Logger.warn('Cannot reset: session not found', { sessionId });
      return;
    }

    // Clear email-specific data
    session.mailFrom = undefined;
    session.rcptTo = [];
    session.messageData = undefined;
    session.messageId = undefined;

    // Clear email timestamps (keep createdAt and authenticatedAt)
    session.timestamps.mailFromAt = undefined;
    session.timestamps.dataStartedAt = undefined;
    session.timestamps.completedAt = undefined;

    // Update activity
    session.timestamps.lastActivityAt = new Date();

    // Return to AUTHENTICATED state (if authenticated) or HELLO state
    const previousState = session.state;
    session.state = session.authenticated
      ? SMTPSessionState.AUTHENTICATED
      : SMTPSessionState.HELLO;

    // Record in history
    session.stateHistory.push({
      from: previousState,
      to: session.state,
      timestamp: new Date(),
      command: 'RESET'
    });

    Logger.info('Session reset for new message', {
      sessionId,
      messagesDelivered: session.messageCount,
      newState: session.state
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVITY TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update last activity timestamp.
   * Call this on every command to track session activity.
   *
   * @param sessionId - Session identifier
   */
  updateActivity(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.timestamps.lastActivityAt = new Date();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Remove expired sessions (inactive for longer than SESSION_TIMEOUT_MS).
   *
   * @returns Number of sessions cleaned up
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveMs = now - session.timestamps.lastActivityAt.getTime();

      if (inactiveMs > SESSION_TIMEOUT_MS) {
        Logger.info('Session expired - cleaning up', {
          sessionId,
          inactiveMinutes: Math.round(inactiveMs / 60000),
          state: session.state,
          messagesDelivered: session.messageCount
        });
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Start the periodic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupIntervalId = setInterval(() => {
      const count = this.cleanupExpiredSessions();
      if (count > 0) {
        Logger.info(`Cleaned up ${count} expired sessions`);
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * Stop the cleanup timer (for graceful shutdown).
   */
  stopCleanupTimer(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
      Logger.info('Session cleanup timer stopped');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATISTICS & DEBUGGING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get current session count.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session statistics for monitoring.
   *
   * @returns Session stats including total and breakdown by state
   */
  getStats(): { total: number; byState: Record<string, number> } {
    const stats = {
      total: this.sessions.size,
      byState: {} as Record<string, number>
    };

    // Initialize all states with 0
    for (const state of Object.values(SMTPSessionState)) {
      stats.byState[state] = 0;
    }

    // Count sessions by state
    for (const session of this.sessions.values()) {
      stats.byState[session.state]++;
    }

    return stats;
  }

  /**
   * Get detailed session info (for debugging).
   *
   * @param sessionId - Session identifier
   * @returns Session details or undefined
   */
  getSessionDetails(sessionId: string): {
    state: string;
    authenticated: boolean;
    user?: string;
    mailFrom?: string;
    recipientCount: number;
    messageCount: number;
    ageSeconds: number;
    lastActivitySeconds: number;
  } | undefined {
    const session = this.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    const now = Date.now();
    return {
      state: session.state,
      authenticated: session.authenticated,
      user: session.user?.inbox_id,
      mailFrom: session.mailFrom,
      recipientCount: session.rcptTo.length,
      messageCount: session.messageCount,
      ageSeconds: Math.round((now - session.timestamps.createdAt.getTime()) / 1000),
      lastActivitySeconds: Math.round((now - session.timestamps.lastActivityAt.getTime()) / 1000)
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Default session manager instance.
 * Use this for the main SMTP server.
 */
export const sessionManager = new SessionManager();
