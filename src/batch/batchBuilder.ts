import type { Account, xdr } from '@stellar/stellar-sdk';
import { BatchValidator, batchValidator } from './batchValidator';
import type {
  BatchConfig,
  BatchDependency,
  BatchTransaction,
  BatchValidationResult,
} from './types';

/**
 * Fluent builder for constructing a batch of contract transactions.
 *
 * @example
 * ```typescript
 * const batch = new BatchBuilder()
 *   .withSourceAccount(account)
 *   .withNetworkPassphrase(Networks.TESTNET)
 *   .addTransaction({
 *     label: 'deposit-vault-1',
 *     operations: [depositOp1],
 *   })
 *   .addTransaction({
 *     label: 'deposit-vault-2',
 *     operations: [depositOp2],
 *     dependencies: [{ dependsOnIndex: 0, label: 'Must deposit vault-1 first' }],
 *   })
 *   .validate()
 *   .build();
 * ```
 */
export class BatchBuilder {
  private transactions: BatchTransaction[] = [];
  private config: Partial<BatchConfig> = {};
  private validator: BatchValidator;
  private lastValidationResult: BatchValidationResult | null = null;

  constructor(validator?: BatchValidator) {
    this.validator = validator ?? batchValidator;
  }

  /** Sets the source account for all transactions in the batch. */
  withSourceAccount(account: Account): this {
    this.config.sourceAccount = account;
    return this;
  }

  /** Sets the network passphrase (required). */
  withNetworkPassphrase(passphrase: string): this {
    this.config.networkPassphrase = passphrase;
    return this;
  }

  /** Sets the fee per operation (applied to each transaction in the batch). */
  withFeePerOperation(fee: number): this {
    this.config.feePerOperation = fee;
    return this;
  }

  /** Sets the transaction timeout in seconds. */
  withTimeoutInSeconds(seconds: number): this {
    this.config.timeoutInSeconds = seconds;
    return this;
  }

  /** When `true`, execution halts on the first failing transaction. Default: `true`. */
  withStopOnFailure(stop: boolean): this {
    this.config.stopOnFailure = stop;
    return this;
  }

  /** Overrides the default validator instance. */
  withValidator(validator: BatchValidator): this {
    this.validator = validator;
    return this;
  }

  /**
   * Adds a transaction to the batch.
   *
   * @param label - Unique label for this transaction
   * @param operations - Stellar operations to execute
   * @param dependencies - Optional dependencies on other batch transactions
   * @param metadata - Optional metadata tracked through the lifecycle
   */
  addTransaction(
    tx: Omit<BatchTransaction, 'dependencies' | 'metadata'> & {
      dependencies?: BatchDependency[];
      metadata?: Record<string, unknown>;
    }
  ): this {
    this.transactions.push({
      label: tx.label,
      operations: tx.operations,
      dependencies: tx.dependencies,
      metadata: tx.metadata,
    });
    return this;
  }

  /**
   * Convenience method to add a transaction by specifying its label and
   * operations directly.
   */
  add(label: string, operations: xdr.Operation[]): this {
    return this.addTransaction({ label, operations });
  }

  /** Returns the number of transactions currently in the batch. */
  get size(): number {
    return this.transactions.length;
  }

  /**
   * Validates the current batch configuration and transactions.
   * Returns the builder for chaining; callers can inspect
   * {@link lastValidationResult} after this call.
   */
  validate(): this {
    const cfg = this.buildConfig();
    this.lastValidationResult = this.validator.validate(this.transactions, cfg);
    return this;
  }

  /**
   * Validates and throws if any issues are found.
   * Convenience wrapper around the validator's throw-on-fail contract.
   */
  validateOrThrow(): this {
    const cfg = this.buildConfig();
    this.validator.validateOrThrow(this.transactions, cfg);
    this.lastValidationResult = { valid: true, issues: [] };
    return this;
  }

  /** Returns the result of the most recent validation, or `null` if never validated. */
  getLastValidation(): BatchValidationResult | null {
    return this.lastValidationResult;
  }

  /**
   * Finalizes and returns the batch configuration and transactions.
   * Throws if the configuration is incomplete.
   */
  build(): { transactions: BatchTransaction[]; config: BatchConfig } {
    const config = this.buildConfig();

    if (!config.sourceAccount) {
      throw new Error(
        'BatchConfig.sourceAccount is required. Call withSourceAccount() before build().'
      );
    }
    if (!config.networkPassphrase) {
      throw new Error(
        'BatchConfig.networkPassphrase is required. Call withNetworkPassphrase() before build().'
      );
    }

    return {
      transactions: [...this.transactions],
      config,
    };
  }

  // ── Private helpers ────────────────────────────────────────────

  private buildConfig(): BatchConfig {
    return {
      sourceAccount: this.config.sourceAccount!,
      networkPassphrase: this.config.networkPassphrase!,
      feePerOperation: this.config.feePerOperation ?? 100_000,
      timeoutInSeconds: this.config.timeoutInSeconds ?? 60,
      stopOnFailure: this.config.stopOnFailure ?? true,
    };
  }
}
