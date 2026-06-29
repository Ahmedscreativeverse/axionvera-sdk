import { Account, Keypair, Networks, xdr } from '@stellar/stellar-sdk';
import { BatchValidator, batchValidator } from '../../src/batch';
import type { BatchConfig, BatchTransaction } from '../../src/batch';

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

describe('BatchValidator', () => {
  const validator = new BatchValidator();

  describe('config validation', () => {
    it('flags missing sourceAccount', () => {
      const config = makeConfig({ sourceAccount: undefined as unknown as Account });
      const txs: BatchTransaction[] = [{ label: 'tx', operations: [makeMockOp()] }];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'account')).toBe(true);
    });

    it('flags missing networkPassphrase', () => {
      const config = makeConfig({ networkPassphrase: '' });
      const txs: BatchTransaction[] = [{ label: 'tx', operations: [makeMockOp()] }];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'config')).toBe(true);
    });

    it('flags non-positive feePerOperation', () => {
      const config = makeConfig({ feePerOperation: 0 });
      const txs: BatchTransaction[] = [{ label: 'tx', operations: [makeMockOp()] }];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'fee')).toBe(true);
    });

    it('flags non-positive timeout', () => {
      const config = makeConfig({ timeoutInSeconds: -1 });
      const txs: BatchTransaction[] = [{ label: 'tx', operations: [makeMockOp()] }];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'config')).toBe(true);
    });
  });

  describe('transaction validation', () => {
    it('flags an empty batch', () => {
      const config = makeConfig();
      const result = validator.validate([], config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'operation')).toBe(true);
    });

    it('flags transactions without labels', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: '', operations: [makeMockOp()] },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('label'))).toBe(true);
    });

    it('flags transactions without operations', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'empty', operations: [] },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('no operations'))).toBe(true);
    });

    it('accepts a valid single-transaction batch', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'valid', operations: [makeMockOp()] },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('dependency validation', () => {
    it('flags self-referencing dependency', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        {
          label: 'self-ref',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0 }],
        },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.category === 'dependency')).toBe(true);
    });

    it('flags out-of-range dependency index', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        {
          label: 'tx-0',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 5 }],
        },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('out of range'))).toBe(true);
    });

    it('flags dependency on a later transaction', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        {
          label: 'tx-0',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 1 }],
        },
        { label: 'tx-1', operations: [makeMockOp()] },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (i) => i.category === 'dependency' && i.message.includes('precede')
        )
      ).toBe(true);
    });

    it('accepts valid forward dependencies', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'first', operations: [makeMockOp()] },
        {
          label: 'second',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0, label: 'needs first' }],
        },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(true);
    });

    it('detects dependency cycles', () => {
      const config = makeConfig();
      // A -> B -> C -> A
      const txs: BatchTransaction[] = [
        {
          label: 'A',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 2 }], // A depends on C
        },
        {
          label: 'B',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 0 }], // B depends on A
        },
        {
          label: 'C',
          operations: [makeMockOp()],
          dependencies: [{ dependsOnIndex: 1 }], // C depends on B
        },
      ];

      const result = validator.validate(txs, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('cycle'))).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('throws BatchValidationError on invalid batch', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [];

      expect(() => validator.validateOrThrow(txs, config)).toThrow();
    });

    it('does not throw for a valid batch', () => {
      const config = makeConfig();
      const txs: BatchTransaction[] = [
        { label: 'tx', operations: [makeMockOp()] },
      ];

      expect(() => validator.validateOrThrow(txs, config)).not.toThrow();
    });
  });

  describe('singleton', () => {
    it('batchValidator is an instance of BatchValidator', () => {
      expect(batchValidator).toBeInstanceOf(BatchValidator);
    });
  });
});
