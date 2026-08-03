/**
 * Message normalization utilities for data ingestion pipeline
 * Transforms Gmail and Slack messages into a standard schema
 */

import * as crypto from 'crypto';

export interface NormalizedMessage {
  messageId: string;
  jobId: string;
  source: 'gmail' | 'slack';
  subject: string;
  text: string;
  timestamp: string;
  createdAt: string;
  sender: string;
  recipient: string;
  deduplicationHash: string;
}

export interface GmailMessage {
  id: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
      parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    }>;
  };
}

export interface SlackMessage {
  ts: string;
  user: string;
  channel: string;
  text: string;
}

/**
 * Normalizes whitespace in text: trims and reduces consecutive spaces to single space
 */
export function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Extracts text content from Gmail message payload
 */
function extractTextFromGmailPayload(payload: GmailMessage['payload']): string {
  // Try body.data first
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Try parts array
  if (payload.parts) {
    for (const part of payload.parts) {
      // Look for text/plain or text/html
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      // Check nested parts
      if (part.parts) {
        for (const nestedPart of part.parts) {
          if (nestedPart.mimeType === 'text/plain' && nestedPart.body?.data) {
            return Buffer.from(nestedPart.body.data, 'base64').toString('utf-8');
          }
        }
      }
    }
    
    // Fallback to text/html if no text/plain found
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  return '';
}

/**
 * Computes deduplication hash from message components
 */
export function computeDeduplicationHash(
  source: string,
  timestamp: string,
  sender: string,
  text: string
): string {
  const hashInput = `${source}:${timestamp}:${sender}:${text}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Transforms a Gmail message into normalized format
 */
export function normalizeGmailMessage(
  message: GmailMessage,
  jobId: string,
  messageId: string
): NormalizedMessage {
  const headers = message.payload.headers;
  
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const sender = headers.find(h => h.name === 'From')?.value || '';
  const recipient = headers.find(h => h.name === 'To')?.value || '';
  
  const rawText = extractTextFromGmailPayload(message.payload);
  const text = normalizeWhitespace(rawText);
  
  const timestamp = new Date(parseInt(message.internalDate)).toISOString();
  const createdAt = new Date().toISOString();
  
  const deduplicationHash = computeDeduplicationHash('gmail', timestamp, sender, text);

  return {
    messageId,
    jobId,
    source: 'gmail',
    subject,
    text,
    timestamp,
    createdAt,
    sender,
    recipient,
    deduplicationHash,
  };
}

/**
 * Transforms a Slack message into normalized format
 */
export function normalizeSlackMessage(
  message: SlackMessage,
  jobId: string,
  messageId: string
): NormalizedMessage {
  const text = normalizeWhitespace(message.text);
  const timestamp = new Date(parseFloat(message.ts) * 1000).toISOString();
  const createdAt = new Date().toISOString();
  
  const deduplicationHash = computeDeduplicationHash('slack', timestamp, message.user, text);

  return {
    messageId,
    jobId,
    source: 'slack',
    subject: '', // Slack messages don't have subjects
    text,
    timestamp,
    createdAt,
    sender: message.user,
    recipient: message.channel,
    deduplicationHash,
  };
}
