/**
 * Abstract Session Store Interface
 *
 * Defines the contract for session storage backends.
 * Current implementation uses in-memory Map (in SessionManager),
 * but this interface allows future migration to Redis, DynamoDB, etc.
 */

import { SMTPSession, SMTPSessionState } from './session-state';

// ============================================================================
// SESSION STORE INTERFACE
// ============================================================================

/**
 * Abstract interface for session storage.
 *
 * Future implementations:
 * - RedisSessionStore - for distributed deployments
 * - DynamoDBSessionStore - for AWS deployments
 * - PostgresSessionStore - for relational DB storage
 */
export interface SessionStore {
  /**
   * Create and store a new session.
   */
  create(session: SMTPSession): Promise<SMTPSession>;

  /**
   * Retrieve a session by ID.
   */
  get(sessionId: string): Promise<SMTPSession | null>;

  /**
   * Update an existing session.
   */
  update(session: SMTPSession): Promise<SMTPSession>;

  /**
   * Delete a session.
   *
   * @param sessionId - Session identifier
   * @returns true if deleted, false if not found
   */
  delete(sessionId: string): Promise<boolean>;

  /**
   * Find session IDs that have expired.
   *
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Array of expired session IDs
   */
  findExpired(maxAgeMs: number): Promise<string[]>;

  /**
   * Count sessions grouped by state.
   *
   * @returns Map of state to count
   */
  countByState(): Promise<Record<SMTPSessionState, number>>;

  /**
   * Get total session count.
   *
   * @returns Number of active sessions
   */
  count(): Promise<number>;

  /**
   * Clear all sessions (for testing).
   */
  clear(): Promise<void>;
}

// ============================================================================
// MEMORY STORE IMPLEMENTATION
// ============================================================================

/**
 * In-memory session store implementation.
 *
 * Suitable for single-instance deployments and testing.
 * For multi-instance or production deployments, use RedisSessionStore.
 */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SMTPSession> = new Map();

  async create(session: SMTPSession): Promise<SMTPSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async get(sessionId: string): Promise<SMTPSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async update(session: SMTPSession): Promise<SMTPSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async findExpired(maxAgeMs: number): Promise<string[]> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      const lastActivity = session.timestamps.lastActivityAt.getTime();
      if (now - lastActivity > maxAgeMs) {
        expired.push(id);
      }
    }

    return expired;
  }

  async countByState(): Promise<Record<SMTPSessionState, number>> {
    const counts = {} as Record<SMTPSessionState, number>;

    // Initialize all states with 0
    for (const state of Object.values(SMTPSessionState)) {
      counts[state] = 0;
    }

    // Count sessions
    for (const session of this.sessions.values()) {
      counts[session.state]++;
    }

    return counts;
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }
}
