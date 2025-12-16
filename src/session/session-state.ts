/**
 * SMTP Session State Management
 *
 * Defines the session state machine for SMTP protocol compliance.
 * Based on RFC 5321 state transitions with command-based validation.
 */

// ============================================================================
// SESSION STATE ENUM
// ============================================================================

/**
 * SMTP session states representing the protocol state machine.
 *
 * State flow:
 * - INIT: Connection established, awaiting EHLO/HELO
 * - HELLO: After EHLO/HELO, ready for AUTH or MAIL FROM
 * - AUTHENTICATED: After successful AUTH
 * - MAIL_FROM: After MAIL FROM accepted
 * - RCPT_TO: After at least one RCPT TO accepted
 * - DATA: During DATA transfer (handled by smtp-server library)
 * - COMPLETED: After message processed, ready for another MAIL FROM
 */
export enum SMTPSessionState {
  /** Initial state after connection established */
  INIT = 'INIT',
  /** After EHLO/HELO received */
  HELLO = 'HELLO',
  /** After successful AUTH */
  AUTHENTICATED = 'AUTHENTICATED',
  /** After MAIL FROM accepted */
  MAIL_FROM = 'MAIL_FROM',
  /** After at least one RCPT TO accepted */
  RCPT_TO = 'RCPT_TO',
  /** During DATA transfer */
  DATA = 'DATA',
  /** After message successfully processed */
  COMPLETED = 'COMPLETED'
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Connection metadata for tracking session origin
 */
export interface ConnectionMetadata {
  /** Remote IP address */
  remoteAddress: string;
  /** Remote port */
  remotePort?: number;
  /** Hostname provided by client in EHLO/HELO */
  clientHostname?: string;
  /** Whether TLS is enabled */
  tlsEnabled: boolean;
}

/**
 * Authenticated user information stored in session
 */
export interface SessionUser {
  /** AgentMail inbox ID */
  inbox_id: string;
  /** Organization ID */
  organization_id: string;
  /** Email address for this inbox */
  email_address: string;
  /** API key ID used for authentication */
  api_key_id: string;
  /** API key used for authentication (needed for API calls) */
  api_key: string;
}

/**
 * Recipient information
 */
export interface SessionRecipient {
  /** Recipient email address */
  address: string;
  /** Timestamp when recipient was added */
  addedAt: Date;
}

/**
 * State transition record for debugging
 */
export interface StateTransition {
  /** Previous state */
  from: SMTPSessionState;
  /** New state */
  to: SMTPSessionState;
  /** Timestamp of transition */
  timestamp: Date;
  /** Command that triggered the transition */
  command?: string;
}

/**
 * Timestamps for session lifecycle tracking
 */
export interface SessionTimestamps {
  /** When session was created */
  createdAt: Date;
  /** Last activity timestamp (updated on every command) */
  lastActivityAt: Date;
  /** When authentication occurred */
  authenticatedAt?: Date;
  /** When MAIL FROM was received */
  mailFromAt?: Date;
  /** When DATA phase started */
  dataStartedAt?: Date;
  /** When message was completed */
  completedAt?: Date;
}

/**
 * Complete SMTP session data
 */
export interface SMTPSession {
  /* Unique session identifier (from smtp-server library) */
  id: string;
  /* Current session state */
  state: SMTPSessionState;
  /* Session timestamps */
  timestamps: SessionTimestamps;
  /* Authenticated user (set after AUTH) */
  user?: SessionUser;
  /* Whether session is authenticated */
  authenticated: boolean;
  /* MAIL FROM address (set after MAIL FROM) */
  mailFrom?: string;
  /* List of RCPT TO addresses */
  rcptTo: SessionRecipient[];
  /* Raw message data (populated during DATA phase) */
  messageData?: string;
  /* Message ID assigned after processing */
  messageId?: string;
  /* Connection metadata */
  connection: ConnectionMetadata;
  /** Number of messages sent in this session */
  messageCount: number;
  /** State transition history for debugging */
  stateHistory: StateTransition[];
}

// ============================================================================
// COMMAND-BASED STATE VALIDATION
// ============================================================================

/**
 * Valid SMTP commands by state.
 *
 * Note: Our server requires authentication (authOptional: false),
 * but the state machine allows MAIL without AUTH for SMTP compliance.
 * The server.ts hooks enforce authentication separately.
 */
export const VALID_COMMANDS_BY_STATE: Record<SMTPSessionState, string[]> = {
  [SMTPSessionState.INIT]: ['EHLO', 'HELO'],
  [SMTPSessionState.HELLO]: ['AUTH', 'MAIL', 'QUIT'],        // Can AUTH or go straight to MAIL
  [SMTPSessionState.AUTHENTICATED]: ['MAIL', 'QUIT'],
  [SMTPSessionState.MAIL_FROM]: ['RCPT', 'QUIT'],
  [SMTPSessionState.RCPT_TO]: ['RCPT', 'DATA', 'QUIT'],      // Can add multiple recipients
  [SMTPSessionState.DATA]: [],                                // Handled by smtp-server library
  [SMTPSessionState.COMPLETED]: ['MAIL', 'QUIT']              // Can send another email
};

/**
 * State transitions triggered by commands
 */
export const COMMAND_STATE_TRANSITIONS: Record<string, { from: SMTPSessionState[]; to: SMTPSessionState }> = {
  'EHLO': { from: [SMTPSessionState.INIT], to: SMTPSessionState.HELLO },
  'HELO': { from: [SMTPSessionState.INIT], to: SMTPSessionState.HELLO },
  'AUTH': { from: [SMTPSessionState.HELLO], to: SMTPSessionState.AUTHENTICATED },
  'MAIL': {
    from: [SMTPSessionState.HELLO, SMTPSessionState.AUTHENTICATED, SMTPSessionState.COMPLETED],
    to: SMTPSessionState.MAIL_FROM
  },
  'RCPT': {
    from: [SMTPSessionState.MAIL_FROM, SMTPSessionState.RCPT_TO],
    to: SMTPSessionState.RCPT_TO
  },
  'DATA': { from: [SMTPSessionState.RCPT_TO], to: SMTPSessionState.DATA },
  'DATA_COMPLETE': { from: [SMTPSessionState.DATA], to: SMTPSessionState.COMPLETED }
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Session timeout in milliseconds (30 minutes)
 */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Maximum recipients per message
 */
export const MAX_RECIPIENTS = 50;

/**
 * Cleanup interval in milliseconds (5 minutes)
 */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a command can be executed in the current state.
 *
 * @param state - Current session state
 * @param command - SMTP command to validate (e.g., 'MAIL', 'RCPT', 'DATA')
 * @returns true if command is allowed in this state
 *
 * @example
 * canExecuteCommandInState(SMTPSessionState.AUTHENTICATED, 'MAIL') // true
 * canExecuteCommandInState(SMTPSessionState.AUTHENTICATED, 'DATA') // false
 */
export function canExecuteCommandInState(state: SMTPSessionState, command: string): boolean {
  const allowedCommands = VALID_COMMANDS_BY_STATE[state];
  return allowedCommands?.includes(command) ?? false;
}

/**
 * Get the next state after executing a command.
 *
 * @param currentState - Current session state
 * @param command - Command being executed
 * @returns Next state, or null if transition is invalid
 */
export function getNextState(currentState: SMTPSessionState, command: string): SMTPSessionState | null {
  const transition = COMMAND_STATE_TRANSITIONS[command];
  if (!transition) {
    return null;
  }

  if (transition.from.includes(currentState)) {
    return transition.to;
  }

  return null;
}

/**
 * Create a new empty session object.
 *
 * @param sessionId - Unique session ID
 * @param connection - Connection metadata
 * @returns New SMTPSession object in INIT state
 */
export function createEmptySession(sessionId: string, connection: ConnectionMetadata): SMTPSession {
  const now = new Date();

  return {
    id: sessionId,
    state: SMTPSessionState.INIT,
    timestamps: {
      createdAt: now,
      lastActivityAt: now
    },
    authenticated: false,
    rcptTo: [],
    connection,
    messageCount: 0,
    stateHistory: []
  };
}
