/**
 * Application Configuration
 *
 * Centralizes all configuration from environment variables.
 * Uses dotenv to load from .env file in development.
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  smtp: {
    port: parseInt(process.env.SMTP_PORT || '2525'),
    maxMessageSize: 10 * 1024 * 1024, // 10MB
  },
  agentmail: {
    apiBaseUrl: process.env.AGENTMAIL_API_URL || 'https://api.agentmail.to',
    timeout: parseInt(process.env.AGENTMAIL_TIMEOUT || '30000'),
    apiKey: process.env.AGENTMAIL_API_KEY || '',
    orgId: process.env.AGENTMAIL_ORG_ID || '',
  }
};
