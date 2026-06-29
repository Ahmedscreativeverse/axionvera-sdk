import type {
  FeatureFlagDefinition,
  FeatureFlagState,
  FeatureFlagsConfig,
  FeatureFlagsSummary,
  FeaturePolicy,
} from './types';
import { FeatureStability, DEFAULT_FEATURE_FLAGS_CONFIG } from './types';

// ─── Built-in Feature Flag Definitions ─────────────────────────────────

/**
 * Registry of all built-in feature flags.
 * These can be toggled at runtime via configuration.
 */
export const BUILT_IN_FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'batchDeposits',
    name: 'Batch Deposits',
    description:
      'Enable batch deposit functionality that submits multiple deposits in a single transaction.',
    defaultValue: false,
    stability: FeatureStability.Beta,
    sinceVersion: '1.1.0',
  },
  {
    key: 'offlineSigning',
    name: 'Offline Transaction Signing',
    description: 'Allow transactions to be prepared and signed without a live network connection.',
    defaultValue: false,
    stability: FeatureStability.Experimental,
    sinceVersion: '1.2.0',
  },
  {
    key: 'advancedEventParsing',
    name: 'Advanced Event Parsing',
    description: 'Enable deep decoding of contract event bodies with full type metadata.',
    defaultValue: false,
    stability: FeatureStability.Beta,
    sinceVersion: '1.3.0',
  },
  {
    key: 'contractReflection',
    name: 'Contract Reflection',
    description: 'Enable runtime introspection of contract methods, events, and parameters.',
    defaultValue: true,
    stability: FeatureStability.Stable,
    sinceVersion: '1.0.0',
  },
  {
    key: 'xdrValidation',
    name: 'XDR Validation',
    description: 'Validate XDR payloads against the Stellar XDR schema before submission.',
    defaultValue: true,
    stability: FeatureStability.Stable,
    sinceVersion: '1.0.0',
  },
  {
    key: 'telemetry',
    name: 'Telemetry Collection',
    description: 'Collect anonymous usage telemetry for SDK improvement.',
    defaultValue: true,
    stability: FeatureStability.Stable,
    sinceVersion: '1.0.0',
  },
  {
    key: 'concurrencyControl',
    name: 'Concurrency Control',
    description: 'Enable built-in request throttling and concurrency management.',
    defaultValue: true,
    stability: FeatureStability.Stable,
    sinceVersion: '1.0.0',
  },
  {
    key: 'pluginSystem',
    name: 'Plugin System',
    description: 'Enable the extensible plugin architecture for third-party plugins.',
    defaultValue: true,
    stability: FeatureStability.Beta,
    sinceVersion: '1.4.0',
  },
  {
    key: 'contractMigration',
    name: 'Contract Migration Toolkit',
    description: 'Enable tools for migrating between contract versions with state preservation.',
    defaultValue: false,
    stability: FeatureStability.Experimental,
    sinceVersion: '1.4.0',
  },
  {
    key: 'stateHydration',
    name: 'Client State Hydration',
    description: 'Enable serialization and restoration of client state across sessions.',
    defaultValue: true,
    stability: FeatureStability.Beta,
    sinceVersion: '1.2.0',
  },
];

// ─── Feature Flags Service ─────────────────────────────────────────────

/**
 * Central service for evaluating and managing feature flags at runtime.
 *
 * ## Feature Lifecycle
 *
 * ```
 * Experimental ──→ Beta ──→ Stable ──→ Deprecated
 *                                             │
 *                                             └──→ Removed
 * ```
 *
 * - **Experimental**: Under development, disabled by default. May change or be removed.
 * - **Beta**: Feature-complete but needs real-world validation. Opt-in.
 * - **Stable**: Fully supported, enabled by default. Backward compatible.
 * - **Deprecated**: Will be removed in a future version. Migration notes are provided.
 */
export class FeatureFlagsService {
  private definitions: Map<string, FeatureFlagDefinition>;
  private config: FeatureFlagsConfig;
  private overrides: Map<string, boolean>;

  constructor(config?: Partial<FeatureFlagsConfig>) {
    this.definitions = new Map();
    this.config = {
      ...DEFAULT_FEATURE_FLAGS_CONFIG,
      ...config,
      policy: {
        ...DEFAULT_FEATURE_FLAGS_CONFIG.policy,
        ...config?.policy,
      },
      overrides: {
        ...DEFAULT_FEATURE_FLAGS_CONFIG.overrides,
        ...config?.overrides,
      },
    };
    this.overrides = new Map(Object.entries(this.config.overrides));

    // Register all built-in flags
    for (const flag of BUILT_IN_FEATURE_FLAGS) {
      this.definitions.set(flag.key, flag);
    }
  }

  // ─── Flag Registration ─────────────────────────────────────────────

  /**
   * Register a custom feature flag definition.
   * Throws if a flag with the same key already exists.
   */
  register(definition: FeatureFlagDefinition): void {
    if (this.definitions.has(definition.key)) {
      throw new Error(`Feature flag "${definition.key}" is already registered.`);
    }
    this.definitions.set(definition.key, definition);
  }

  /**
   * Unregister a feature flag by key.
   * Returns true if the flag was removed, false if it didn't exist.
   */
  unregister(key: string): boolean {
    this.overrides.delete(key);
    return this.definitions.delete(key);
  }

  /**
   * Check whether a feature flag with the given key is registered.
   */
  has(key: string): boolean {
    return this.definitions.has(key);
  }

  // ─── Feature Evaluation ────────────────────────────────────────────

  /**
   * Determine if a feature is currently enabled.
   *
   * Evaluation order:
   * 1. If an explicit override exists, use it.
   * 2. Otherwise, evaluate against the current policy.
   * 3. If the policy doesn't cover the stability level, use the flag's default.
   */
  isEnabled(key: string): boolean {
    const definition = this.definitions.get(key);
    if (!definition) {
      return false;
    }

    // Check explicit override first
    const override = this.overrides.get(key);
    if (override !== undefined) {
      return override;
    }

    // Evaluate against policy
    return this.evaluateAgainstPolicy(definition);
  }

  /**
   * Explicitly enable a feature flag regardless of policy.
   */
  enable(key: string): void {
    this.assertExists(key);
    this.overrides.set(key, true);
  }

  /**
   * Explicitly disable a feature flag regardless of policy.
   */
  disable(key: string): void {
    this.assertExists(key);
    this.overrides.set(key, false);
  }

  /**
   * Remove any explicit override for a feature flag,
   * reverting to policy-based evaluation.
   */
  reset(key: string): void {
    this.assertExists(key);
    this.overrides.delete(key);
  }

  /**
   * Remove all overrides and reset to the default policy.
   */
  resetAll(): void {
    this.overrides.clear();
    this.config.policy = { ...DEFAULT_FEATURE_FLAGS_CONFIG.policy };
  }

  // ─── Policy Management ─────────────────────────────────────────────

  /**
   * Get the current feature policy.
   */
  getPolicy(): FeaturePolicy {
    return { ...this.config.policy };
  }

  /**
   * Set the feature policy.
   * This will affect all flags that don't have explicit overrides.
   */
  setPolicy(policy: Partial<FeaturePolicy>): void {
    this.config.policy = {
      ...this.config.policy,
      ...policy,
    };
  }

  // ─── Queries ───────────────────────────────────────────────────────

  /**
   * Get the full state of a single feature flag.
   */
  getState(key: string): FeatureFlagState | undefined {
    const definition = this.definitions.get(key);
    if (!definition) {
      return undefined;
    }

    return {
      definition,
      enabled: this.isEnabled(key),
      isOverridden: this.overrides.has(key),
    };
  }

  /**
   * Get the state of all registered feature flags.
   */
  getAllStates(): FeatureFlagState[] {
    return Array.from(this.definitions.values()).map((definition) => ({
      definition,
      enabled: this.isEnabled(definition.key),
      isOverridden: this.overrides.has(definition.key),
    }));
  }

  /**
   * Get a summary of all feature flags for diagnostics.
   */
  getSummary(): FeatureFlagsSummary {
    const flags = this.getAllStates();
    return {
      totalFlags: flags.length,
      enabledFlags: flags.filter((f) => f.enabled).length,
      policy: this.getPolicy(),
      overrideCount: this.overrides.size,
      flags,
    };
  }

  /**
   * Get all flags of a given stability level.
   */
  getByStability(stability: FeatureStability): FeatureFlagState[] {
    return this.getAllStates().filter((f) => f.definition.stability === stability);
  }

  /**
   * Get all currently enabled feature keys (convenience method).
   */
  getEnabledKeys(): string[] {
    return this.getAllStates()
      .filter((f) => f.enabled)
      .map((f) => f.definition.key);
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private assertExists(key: string): void {
    if (!this.definitions.has(key)) {
      throw new Error(`Feature flag "${key}" is not registered.`);
    }
  }

  private evaluateAgainstPolicy(definition: FeatureFlagDefinition): boolean {
    const { stability } = definition;
    const { policy } = this.config;

    switch (stability) {
      case FeatureStability.Stable:
        // Stable features are always enabled unless explicitly disabled
        return true;
      case FeatureStability.Beta:
        return policy.allowBeta;
      case FeatureStability.Experimental:
        return policy.allowExperimental;
      case FeatureStability.Deprecated:
        return policy.allowDeprecated;
      default:
        return definition.defaultValue;
    }
  }
}
