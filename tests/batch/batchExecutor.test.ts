import { Account, Keypair, Networks, xdr } from '@stellar/stellar-sdk';
import { BatchExecutor } from '../../src/batch';
import { BatchValidationError, SimulationFailedError } from '../../src/errors/axionveraError';
import type { BatchConfig, BatchRpcClient, BatchTransaction } from '../../src/batch';

function makeMockOp(): xdr.Operation {
  return {} as xdr.Operation;
}

function makeConfig(overrides: Partial<BatchConfig> = {}): BatchConfig {
  const keypair = Keypair.random();
  return {
    sourceAccount: new Account(keypair.publicKey(), '1'),
    networkPassphrase: Networks.TESTNET,
    feePerOperation: 100_000,
    timeoutInSeconds: 60,
    stopOnFailure: true,
    ...overrides,
  };
}

function makeMockClient(simResults: unknown[]): BatchRpcClient {
  let callCount = 0;
  return {
    simulateTransaction: jest.fn().mockImplementation(() => {
      const result = simResults[callCount++];
      if (result instanceof Error) throw result;
      return Promise.resolve(result);
    }),
    sendTransaction: jest.fn().mockResolvedValue({ hash: 'mock-hash', status: 'SUCCESS' }),
  };
}

describe('BatchExecutor', () => {
  describe('pre-execution validation', () => {
    it('throws BatchValidationError for an invalid batch', async () => {
      const executor = new BatchExecutor(makeMockClient([]));
      const config = makeConfig();
      const txs: BatchTransaction[] = [];

      await expect(executor.execute(txs, config)).rejects.toThrow(
        BatchValidationError
      );
    });
  });

  describe('successful execution', () => {
    it('executes all transactions sequentially and returns results', async () => {
      const client = makeMockClient([
        { result: { cost: { cpuInsns: '100', memBytes: '200' } } },
        { result: { cost: { cpuInsns: '150', memBytes: '250' } } },
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        { label: 'tx-2', operations: [makeMockOp()] },
      ];

      const result = await executor.execute(txs, config);

      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.allSucceeded).toBe(true);
      expect(result.skippedIndices).toEqual([]);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].label).toBe('tx-1');
      expect(result.transactions[1].label).toBe('tx-2');
      expect(client.simulateTransaction).toHaveBeenCalledTimes(2);
    });

    it('records per-transaction durations', async () => {
      const client = makeMockClient([
        { result: {} },
        { result: {} },
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        { label: 'tx-2', operations: [makeMockOp()] },
      ];

      const result = await executor.execute(txs, config);

      for (const txResult of result.transactions) {
        expect(txResult.durationMs).toBeGreaterThanOrEqual(0);
      }
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('failure handling with stopOnFailure=true', () => {
    it('stops at the first failure and skips remaining transactions', async () => {
      const simError = new SimulationFailedError('simulation exploded');
      const client = makeMockClient([
        { result: {} },          // tx-1 succeeds
        simError,                 // tx-2 fails
        { result: {} },          // tx-3 would succeed (but skipped)
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig({ stopOnFailure: true });
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        { label: 'tx-2', operations: [makeMockOp()] },
        { label: 'tx-3', operations: [makeMockOp()] },
      ];

      const result = await executor.execute(txs, config);

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.allSucceeded).toBe(false);
      expect(result.skippedIndices).toEqual([2]);

      expect(result.transactions[0].success).toBe(true);
      expect(result.transactions[1].success).toBe(false);
      expect(result.transactions[1].error?.name).toBe('SimulationFailedError');
      expect(result.transactions[2].success).toBe(false);
      expect(result.transactions[2].error?.name).toBe('BatchSkippedError');

      // Only 2 transactions attempted (tx-1, tx-2)
      expect(client.simulateTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('failure handling with stopOnFailure=false', () => {
    it('continues executing after failures', async () => {
      const client = makeMockClient([
        { result: {} },          // tx-1 succeeds
        new Error('tx-2 failed'), // tx-2 fails
        { result: {} },          // tx-3 succeeds
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig({ stopOnFailure: false });
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        { label: 'tx-2', operations: [makeMockOp()] },
        { label: 'tx-3', operations: [makeMockOp()] },
      ];

      const result = await executor.execute(txs, config);

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.allSucceeded).toBe(false);

      expect(result.transactions[0].success).toBe(true);
      expect(result.transactions[1].success).toBe(false);
      expect(result.transactions[2].success).toBe(true);

      // All 3 attempted
      expect(client.simulateTransaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('dependency enforcement', () => {
    it('skips transactions with unmet dependencies', async () => {
      const client = makeMockClient([
        new Error('tx-1 fails'),  // tx-1 fails -> tx-2 depends on it
        { result: {} },           // tx-2 (won't run due to unmet dep)
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig({ stopOnFailure: false });
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        {
          label: 'tx-2',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0 }],
        },
      ];

      const result = await executor.execute(txs, config);

      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);

      expect(result.transactions[0].success).toBe(false);
      expect(result.transactions[1].success).toBe(false);
      expect(result.transactions[1].error?.name).toBe('DependencyNotMetError');
    });

    it('executes dependent transaction when dependency succeeds', async () => {
      const client = makeMockClient([
        { result: {} },
        { result: {} },
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
        {
          label: 'tx-2',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0 }],
        },
      ];

      const result = await executor.execute(txs, config);

      expect(result.allSucceeded).toBe(true);
      expect(result.transactions[1].success).toBe(true);
    });
  });

  describe('simulation error detection', () => {
    it('treats responses with an error property as failures', async () => {
      const client = makeMockClient([
        { error: 'HostError: something went wrong' },
      ]);

      const executor = new BatchExecutor(client);
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'tx-1', operations: [makeMockOp()] },
      ];

      const result = await executor.execute(txs, config);

      expect(result.transactions[0].success).toBe(false);
      expect(result.transactions[0].error?.name).toBe('SimulationFailedError');
    });
  });
});
