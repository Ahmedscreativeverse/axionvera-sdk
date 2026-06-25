import type { StellarClient } from "../client/stellarClient";
import type { WalletConnector } from "../wallet/walletConnector";

/**
 * Lifecycle state of a session.
 *
 * - `active`: the session is ready to coordinate contract interactions.
 * - `suspended`: the session is temporarily paused; it can be resumed.
 * - `closed`: the session has been torn down and can no longer be used.
 */
export type SessionStatus = "active" | "suspended" | "closed";

/**
 * A single contract registered within a session.
 *
 * Each context binds a human-readable `name` to an on-chain `contractId` and,
 * optionally, a ready-to-use contract wrapper `instance` (e.g. a `VaultContract`).
 *
 * @typeParam TInstance - The type of the attached contract wrapper, if any.
 */
export type ContractContext<TInstance = unknown> = {
  /** Unique name of the contract within its session. */
  readonly name: string;
  /** The on-chain contract identifier. */
  readonly contractId: string;
  /** Optional pre-built contract wrapper instance. */
  readonly instance?: TInstance;
  /** Epoch milliseconds at which the contract was registered. */
  readonly registeredAt: number;
  /** Arbitrary, caller-supplied metadata for this contract. */
  readonly metadata: Record<string, unknown>;
};

/**
 * Parameters used to register a contract inside a session.
 *
 * @typeParam TInstance - The type of the attached contract wrapper, if any.
 */
export type RegisterContractParams<TInstance = unknown> = {
  /** Unique name of the contract within the session. */
  name: string;
  /** The on-chain contract identifier. */
  contractId: string;
  /** Optional pre-built contract wrapper instance. */
  instance?: TInstance;
  /** Arbitrary, caller-supplied metadata for this contract. */
  metadata?: Record<string, unknown>;
};

/**
 * Configuration for a single {@link ContractSession}.
 */
export type SessionConfig = {
  /** Optional explicit id. A unique id is generated when omitted. */
  id?: string;
  /** Shared RPC client used by every contract in the session. */
  client: StellarClient;
  /** Optional shared wallet connector used for signing. */
  wallet?: WalletConnector;
  /** Contracts to register up-front when the session is created. */
  contracts?: RegisterContractParams[];
  /** Arbitrary, caller-supplied metadata for the session. */
  metadata?: Record<string, unknown>;
};

/**
 * A plain, serializable snapshot of a session's state.
 *
 * Produced by {@link ContractSession.toJSON} for logging, diagnostics, or
 * persistence. It intentionally omits live resources (client, wallet).
 */
export type SessionSnapshot = {
  /** The session id. */
  id: string;
  /** Current lifecycle status. */
  status: SessionStatus;
  /** Network the shared client is connected to. */
  network: string;
  /** Whether a wallet connector is attached. */
  hasWallet: boolean;
  /** Epoch milliseconds at which the session was created. */
  createdAt: number;
  /** Epoch milliseconds of the most recent mutation. */
  updatedAt: number;
  /** Registered contracts (without live instances). */
  contracts: Array<{
    name: string;
    contractId: string;
    registeredAt: number;
    metadata: Record<string, unknown>;
  }>;
  /** Session metadata. */
  metadata: Record<string, unknown>;
};

/**
 * Configuration for the {@link SessionManager}.
 */
export type SessionManagerConfig = {
  /** Default shared RPC client handed to sessions that don't bring their own. */
  client?: StellarClient;
  /** Default shared wallet connector for sessions that don't bring their own. */
  wallet?: WalletConnector;
  /** Upper bound on concurrently open sessions. Defaults to unlimited. */
  maxSessions?: number;
};
