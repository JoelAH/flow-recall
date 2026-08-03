/**
 * Unit tests for message deduplication utilities
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isDuplicate, storeMessagesWithDeduplication, initializeClient } from './deduplication';
import { NormalizedMessage } from './normalization';

const mockSend = jest.fn();

describe('deduplication utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize with mock client before each test
    const mockClient = {
      send: mockSend,
    } as unknown as DynamoDBDocumentClient;
    
    initializeClient(mockClient);
  });

  describe('isDuplicate', () => {
    it('should return true when hash exists in job', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ messageId: 'msg-123' }],
        Count: 1,
      });

      const result = await isDuplicate('job-1', 'hash-abc', 'messages');

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      const call = mockSend.mock.calls[0][0];
      expect(call.input).toMatchObject({
        TableName: 'messages',
        IndexName: 'JobIdDeduplicationHashIndex',
        KeyConditionExpression: 'jobId = :jobId AND deduplicationHash = :hash',
        ExpressionAttributeValues: {
          ':jobId': 'job-1',
          ':hash': 'hash-abc',
        },
        Limit: 1,
      });
    });

    it('should return false when hash does not exist in job', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await isDuplicate('job-1', 'hash-xyz', 'messages');

      expect(result).toBe(false);
    });

    it('should return false when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        Count: 0,
      });

      const result = await isDuplicate('job-1', 'hash-xyz', 'messages');

      expect(result).toBe(false);
    });
  });

  describe('storeMessagesWithDeduplication', () => {
    const createMessage = (id: string, hash: string, jobId: string = 'job-1'): NormalizedMessage => ({
      messageId: id,
      jobId,
      source: 'gmail',
      subject: 'Test',
      text: 'Test message',
      timestamp: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      sender: 'sender@example.com',
      recipient: 'recipient@example.com',
      deduplicationHash: hash,
    });

    it('should store all unique messages', async () => {
      const messages = [
        createMessage('msg-1', 'hash-1'),
        createMessage('msg-2', 'hash-2'),
        createMessage('msg-3', 'hash-3'),
      ];

      // All hashes are unique (not in DB)
      mockSend.mockResolvedValue({ Items: [], Count: 0 });

      const result = await storeMessagesWithDeduplication(messages, 'messages');

      expect(result).toEqual({
        storedCount: 3,
        duplicateCount: 0,
      });

      // Should have 3 queries (one per message) and 1 batch write
      expect(mockSend).toHaveBeenCalledTimes(4);

      // Verify batch write contains all 3 messages
      const batchCall = mockSend.mock.calls[3][0];
      expect(batchCall.input.RequestItems?.messages).toHaveLength(3);
    });

    it('should skip duplicate messages from database', async () => {
      const messages = [
        createMessage('msg-1', 'hash-1'),
        createMessage('msg-2', 'hash-2'),
        createMessage('msg-3', 'hash-1'), // Duplicate hash
      ];

      // First query returns existing message, others return empty
      mockSend
        .mockResolvedValueOnce({ Items: [{ messageId: 'existing' }], Count: 1 }) // hash-1 exists
        .mockResolvedValueOnce({ Items: [], Count: 0 }) // hash-2 doesn't exist
        .mockResolvedValueOnce({}); // batch write
      
      const result = await storeMessagesWithDeduplication(messages, 'messages');

      expect(result).toEqual({
        storedCount: 1,
        duplicateCount: 2,
      });

      // Should store only msg-2
      expect(mockSend).toHaveBeenCalledTimes(3);
      const batchCall = mockSend.mock.calls[2][0];
      expect(batchCall.input.RequestItems?.messages).toHaveLength(1);
      expect(batchCall.input.RequestItems?.messages[0].PutRequest?.Item.messageId).toBe('msg-2');
    });

    it('should skip duplicate messages within the same batch', async () => {
      const messages = [
        createMessage('msg-1', 'hash-1'),
        createMessage('msg-2', 'hash-1'), // Same hash as msg-1
        createMessage('msg-3', 'hash-1'), // Same hash as msg-1
      ];

      // First query for hash-1 returns empty (not in DB)
      // Subsequent messages with same hash are skipped before querying
      mockSend
        .mockResolvedValueOnce({ Items: [], Count: 0 }) // hash-1 query
        .mockResolvedValueOnce({}); // batch write

      const result = await storeMessagesWithDeduplication(messages, 'messages');

      expect(result).toEqual({
        storedCount: 1,
        duplicateCount: 2,
      });

      // Should only query once (for the first occurrence of hash-1)
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Should store only msg-1
      const batchCall = mockSend.mock.calls[1][0];
      expect(batchCall.input.RequestItems?.messages).toHaveLength(1);
      expect(batchCall.input.RequestItems?.messages[0].PutRequest?.Item.messageId).toBe('msg-1');
    });

    it('should handle mixed duplicates and unique messages', async () => {
      const messages = [
        createMessage('msg-1', 'hash-1'),
        createMessage('msg-2', 'hash-2'),
        createMessage('msg-3', 'hash-1'), // Duplicate in batch
        createMessage('msg-4', 'hash-3'),
        createMessage('msg-5', 'hash-4'),
      ];

      // hash-1 not in DB, hash-2 in DB, hash-3 not in DB, hash-4 not in DB
      mockSend
        .mockResolvedValueOnce({ Items: [], Count: 0 }) // hash-1
        .mockResolvedValueOnce({ Items: [{ messageId: 'existing' }], Count: 1 }) // hash-2
        .mockResolvedValueOnce({ Items: [], Count: 0 }) // hash-3
        .mockResolvedValueOnce({ Items: [], Count: 0 }) // hash-4
        .mockResolvedValueOnce({}); // batch write
      
      const result = await storeMessagesWithDeduplication(messages, 'messages');

      expect(result).toEqual({
        storedCount: 3, // msg-1, msg-4, msg-5
        duplicateCount: 2, // msg-2 (in DB), msg-3 (in batch)
      });
    });

    it('should handle empty message array', async () => {
      const result = await storeMessagesWithDeduplication([], 'messages');

      expect(result).toEqual({
        storedCount: 0,
        duplicateCount: 0,
      });

      // Should not make any DynamoDB calls
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should batch messages in groups of 25', async () => {
      // Create 60 unique messages
      const messages = Array.from({ length: 60 }, (_, i) => 
        createMessage(`msg-${i}`, `hash-${i}`)
      );

      // All hashes are unique
      mockSend.mockResolvedValue({ Items: [], Count: 0 });

      const result = await storeMessagesWithDeduplication(messages, 'messages');

      expect(result).toEqual({
        storedCount: 60,
        duplicateCount: 0,
      });

      // Should have 60 queries + 3 batch writes (25 + 25 + 10)
      expect(mockSend).toHaveBeenCalledTimes(63);
      
      // Check the batch write calls (last 3 calls)
      expect(mockSend.mock.calls[60][0].input.RequestItems?.messages).toHaveLength(25);
      expect(mockSend.mock.calls[61][0].input.RequestItems?.messages).toHaveLength(25);
      expect(mockSend.mock.calls[62][0].input.RequestItems?.messages).toHaveLength(10);
    });

    it('should allow same message in different jobs', async () => {
      const messages = [
        createMessage('msg-1', 'hash-1', 'job-1'),
        createMessage('msg-2', 'hash-1', 'job-2'), // Same hash, different job
      ];

      // Both queries return empty (hash doesn't exist in respective jobs)
      mockSend.mockResolvedValue({ Items: [], Count: 0 });

      // Store messages for job-1
      const result1 = await storeMessagesWithDeduplication([messages[0]], 'messages');
      expect(result1.storedCount).toBe(1);

      jest.clearAllMocks();

      // Store messages for job-2 (should succeed even with same hash)
      const result2 = await storeMessagesWithDeduplication([messages[1]], 'messages');
      expect(result2.storedCount).toBe(1);
    });

    it('should treat messages with different timestamps as distinct', async () => {
      const msg1 = createMessage('msg-1', 'hash-1');
      const msg2 = {
        ...createMessage('msg-2', 'hash-2'),
        timestamp: '2024-01-02T00:00:00.000Z', // Different timestamp
      };

      // Both hashes are unique
      mockSend.mockResolvedValue({ Items: [], Count: 0 });

      const result = await storeMessagesWithDeduplication([msg1, msg2], 'messages');

      expect(result).toEqual({
        storedCount: 2,
        duplicateCount: 0,
      });
    });
  });
});
