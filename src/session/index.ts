/**
 * Session Management Module
 *
 * Re-exports all session-related types and the default session manager.
 *
 * Usage:
 * ```typescript
 * import {
 *   sessionManager,
 *   SMTPSessionState,
 *   SMTPSession
 * } from './session';
 * ```
 */

// Session state types and enums
export { SMTPSessionState } from './session-state';
export type {
  SMTPSession,
  SessionUser,
  SessionRecipient,
  ConnectionMetadata,
  SessionTimestamps,
  StateTransition
} from './session-state';
export {
  VALID_COMMANDS_BY_STATE,
  COMMAND_STATE_TRANSITIONS,
  SESSION_TIMEOUT_MS,
  MAX_RECIPIENTS,
  CLEANUP_INTERVAL_MS,
  canExecuteCommandInState, 
  getNextState,
  createEmptySession
} from './session-state';

// Session manager
export {
  SessionManager,
  sessionManager
} from './session-manager';

// Session store interfaces
export type {
  SessionStore,
} from './session-store';
export { MemorySessionStore } from './session-store';
