import type { Account, xdr } from '@stellar/stellar-sdk';

/**
 * Describes a dependency between two transactions in a batch.
 * The dependent transaction will only execute after all its
 * dependencies have completed successfully.
 */
export interface BatchDependency {
  /** Index of the transaction this one depends on. */
  dependsOnIndex: number;
  /** Human-readable label explaining the dependency. */
  label?: string;
}

/**
 * A single transaction within a batch, including optional metadata
 * and dependency information.
 */
export interface BatchTransaction {
  /** Unique label for this transaction within the batch. */
  label: string;
  /** The Stellar operation(s) to execute. */
  operations: xdr.Operation[];
  /** Optional metadata tracked through the batch lifecycle. */
  metadata?: Record<string, unknown>;
  /** Optional dependencies on other transactions in the batch. */
  dependencies?: BatchDependency[];
}

/**
 * Configuration for building and executing a transaction batch.
 */
export interface BatchConfig {
  /** Source account used for all transactions in the batch. */
  sourceAccount: Account;
  /** Fee per operation in stroops (default: 100_000). */
  feePerOperation?: number;
  /** Transaction timeout in seconds (default: 60). */
  timeoutInSeconds?: number;
  /** Network passphrase for the Stellar network. */
  networkPassphrase: string;
  /**
   * When `true`, execution stops at the first failure.
   * When `false`, all transactions are attempted and failures
   * are collected for reporting. Default: `true`.
   */
  stopOnFailure?: boolean;
}

/**
 * The outcome of a single transaction within a batch.
 */
export interface BatchTransactionResult {
  /** Index of this transaction in the batch. */
  index: number;
  /** Matching label from the original BatchTransaction. */
  label: string;
  /** Whether the transaction executed successfully. */
  success: boolean;
  /** The simulation/execution result when successful. */
  result?: unknown;
  /** Error information when the transaction failed. */
  error?: {
    name: string;
    message: string;
    code?: string;
  };
  /** Duration of this transaction in milliseconds. */
  durationMs: number;
}

/**
 * Summary of a completed batch execution.
 */
export interface BatchResult {
  /** Total number of transactions in the batch. */
  totalCount: number;
  /** Number of transactions that completed successfully. */
  successCount: number;
  /** Number of transactions that failed. */
  failureCount: number;
  /** Number of transactions that were skipped (due to stopOnFailure). */
  skippedCount: number;
  /** Per-transaction results in execution order. */
  transactions: BatchTransactionResult[];
  /** Total wall-clock duration of the batch in milliseconds. */
  totalDurationMs: number;
  /** Whether the entire batch completed without errors. */
  allSucceeded: boolean;
  /** When stopOnFailure is true and a transaction failed, subsequent
   *  transactions that were never attempted appear here. */
  skippedIndices: number[];
}

/**
 * Result of pre-execution validation performed on a batch.
 */
export interface BatchValidationResult {
  /** Whether the batch passed all validation checks. */
  valid: boolean;
  /** List of validation issues found (empty when valid). */
  issues: BatchValidationIssue[];
}

/**
 * A single issue discovered during batch validation.
 */
export interface BatchValidationIssue {
  /** Index of the transaction with the issue, or -1 for batch-level issues. */
  transactionIndex: number;
  /** The problematic transaction label, if applicable. */
  label?: string;
  /** Category of the validation issue. */
  category: 'dependency' | 'sequence' | 'fee' | 'account' | 'operation' | 'config';
  /** Human-readable description of the issue. */
  message: string;
}
