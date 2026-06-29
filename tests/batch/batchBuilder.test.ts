import { Account, Keypair, Networks, xdr } from '@stellar/stellar-sdk';
import { BatchBuilder, BatchValidator } from '../../src/batch';
import { BatchValidationError } from '../../src/errors/axionveraError';

// A minimal xdr.Operation stub for testing — the batch builder and validator
// do not inspect operation internals beyond checking that the array is non-empty.
function makeMockOp(): xdr.Operation {
  return {} as xdr.Operation;
}

describe('BatchBuilder', () => {
  const keypair = Keypair.random();
  const account = new Account(keypair.publicKey(), '1');

  describe('fluent construction', () => {
    it('builds a valid batch with minimal configuration', () => {
      const { transactions, config } = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('tx-1', [makeMockOp()])
        .add('tx-2', [makeMockOp()])
        .build();

      expect(transactions).toHaveLength(2);
      expect(transactions[0].label).toBe('tx-1');
      expect(transactions[1].label).toBe('tx-2');
      expect(config.sourceAccount).toBe(account);
      expect(config.networkPassphrase).toBe(Networks.TESTNET);
    });

    it('applies custom fee and timeout', () => {
      const { config } = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .withFeePerOperation(50_000)
        .withTimeoutInSeconds(120)
        .add('tx', [makeMockOp()])
        .build();

      expect(config.feePerOperation).toBe(50_000);
      expect(config.timeoutInSeconds).toBe(120);
    });

    it('defaults stopOnFailure to true', () => {
      const { config } = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('tx', [makeMockOp()])
        .build();

      expect(config.stopOnFailure).toBe(true);
    });

    it('allows disabling stopOnFailure', () => {
      const { config } = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .withStopOnFailure(false)
        .add('tx', [makeMockOp()])
        .build();

      expect(config.stopOnFailure).toBe(false);
    });
  });

  describe('addTransaction', () => {
    it('accepts dependencies and metadata', () => {
      const builder = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .addTransaction({
          label: 'first',
          operations: [makeMockOp()],
          metadata: { priority: 'high' },
        })
        .addTransaction({
          label: 'second',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0, label: 'requires first' }],
        });

      expect(builder.size).toBe(2);
      const { transactions } = builder.build();
      expect(transactions[0].metadata).toEqual({ priority: 'high' });
      expect(transactions[1].dependencies).toEqual([
        { dependsOnIndex: 0, label: 'requires first' },
      ]);
    });
  });

  describe('validation', () => {
    it('validate() runs validation without throwing', () => {
      const builder = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('tx', [makeMockOp()])
        .validate();

      const result = builder.getLastValidation();
      expect(result).not.toBeNull();
      expect(result!.valid).toBe(true);
    });

    it('validateOrThrow() throws on invalid batch', () => {
      const builder = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET);

      // Empty batch should fail validation
      expect(() => builder.validateOrThrow()).toThrow(BatchValidationError);
    });

    it('validateOrThrow() succeeds for valid batch', () => {
      const builder = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('tx', [makeMockOp()])
        .validateOrThrow();

      const result = builder.getLastValidation();
      expect(result!.valid).toBe(true);
    });

    it('detects empty operations', () => {
      const builder = new BatchBuilder()
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('empty-tx', [])
        .validate();

      const result = builder.getLastValidation();
      expect(result!.valid).toBe(false);
      expect(result!.issues.some((i) => i.category === 'operation')).toBe(true);
    });
  });

  describe('build() errors', () => {
    it('throws when sourceAccount is missing', () => {
      expect(() =>
        new BatchBuilder()
          .withNetworkPassphrase(Networks.TESTNET)
          .add('tx', [makeMockOp()])
          .build()
      ).toThrow(/sourceAccount/);
    });

    it('throws when networkPassphrase is missing', () => {
      expect(() =>
        new BatchBuilder()
          .withSourceAccount(account)
          .add('tx', [makeMockOp()])
          .build()
      ).toThrow(/networkPassphrase/);
    });
  });

  describe('custom validator', () => {
    it('accepts a custom validator instance', () => {
      const custom = new BatchValidator();
      const builder = new BatchBuilder(custom);
      // The builder should work the same with a custom validator
      builder
        .withSourceAccount(account)
        .withNetworkPassphrase(Networks.TESTNET)
        .add('tx', [makeMockOp()])
        .validate();

      expect(builder.getLastValidation()!.valid).toBe(true);
    });
  });
});
