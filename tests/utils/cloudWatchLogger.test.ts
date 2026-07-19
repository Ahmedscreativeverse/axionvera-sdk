import { CloudWatchLogger } from '../../src/utils/logging/cloudwatch/cloudWatchLogger';
import { CloudWatchConfig, LogEntry } from '../../src/utils/logging/cloudwatch/types';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  CreateLogGroupCommand: jest.fn(),
  CreateLogStreamCommand: jest.fn(),
  PutLogEventsCommand: jest.fn(),
  DescribeLogStreamsCommand: jest.fn(),
}));

describe('CloudWatchLogger', () => {
  let logger: CloudWatchLogger;
  let config: CloudWatchConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      logGroupName: 'test-group',
      logStreamName: 'test-stream',
      region: 'us-west-2',
      batchSize: 2,
      flushIntervalMs: 1000,
      maxRetries: 3,
    };
    logger = new CloudWatchLogger(config);
  });

  afterEach(async () => {
    await logger.destroy();
  });

  describe('initialization', () => {
    it('should create a logger with default config values', () => {
      const minimalConfig: CloudWatchConfig = {
        logGroupName: 'minimal-group',
      };
      const minimalLogger = new CloudWatchLogger(minimalConfig);
      expect(minimalLogger.isReady()).toBe(false);
    });

    it('should initialize successfully', async () => {
      // Mock the AWS client send method
      const { CloudWatchLogsClient } = require('@aws-sdk/client-cloudwatch-logs');
      const mockClient = CloudWatchLogsClient.mock.instances[0];
      mockClient.send.mockResolvedValue({});

      await logger.initialize();
      expect(logger.isReady()).toBe(true);
    });
  });

  describe('logging', () => {
    it('should add logs to queue and flush when batch size is reached', async () => {
      const { CloudWatchLogsClient } = require('@aws-sdk/client-cloudwatch-logs');
      const mockClient = CloudWatchLogsClient.mock.instances[0];
      mockClient.send.mockResolvedValue({ nextSequenceToken: 'token123' });

      await logger.initialize();

      const logEntry1: LogEntry = {
        timestamp: Date.now(),
        message: 'Test message 1',
        level: 'INFO',
      };
      const logEntry2: LogEntry = {
        timestamp: Date.now(),
        message: 'Test message 2',
        level: 'ERROR',
      };

      await logger.log(logEntry1);
      expect(logger.getQueueSize()).toBe(1);

      await logger.log(logEntry2);
      expect(logger.getQueueSize()).toBe(0); // Should have flushed
    });

    it('should handle flush failure and re-add logs to queue', async () => {
      const { CloudWatchLogsClient } = require('@aws-sdk/client-cloudwatch-logs');
      const mockClient = CloudWatchLogsClient.mock.instances[0];
      mockClient.send.mockRejectedValueOnce(new Error('Flush failed'));

      await logger.initialize();

      const logEntry: LogEntry = {
        timestamp: Date.now(),
        message: 'Test message',
        level: 'WARN',
      };

      await logger.log(logEntry);
      await logger.flush();
      expect(logger.getQueueSize()).toBe(1); // Should have re-added
    });
  });
});
