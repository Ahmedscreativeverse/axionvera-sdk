/**
 * Feature Flag System Types
 *
 * Provides type definitions for the feature flag system that allows
 * experimental SDK functionality to be enabled or disabled without
 * affecting stable releases.
 */

// ─── Stability Level ───────────────────────────────────────────────────

/**
 * Indicates the stability level of a feature flag.
 *
 * - `stable`: Production-ready, enabled by default.
 * - `beta`: Near-complete, may have minor issues, disabled by default.
 * - `experimental`: Under active development, disabled by default.
 * - `deprecated`: Slated for removal, disabled by default.
 */
export enum FeatureStability {
  Stable = 'stable',
  Beta = 'beta',
  Experimental = 'experimental',
  Deprecated = 'deprecated',
}

// ─── Feature Flag Definition ───────────────────────────────────────────

/**
 * Static definition of a feature flag.
 * Each flag describes a named feature with metadata about its lifecycle.
 */
export interface FeatureFlagDefinition {
  /** Unique feature key (e.g. "batchDeposits", "offlineSigning") */
  key: string;
  /** Human-readable short name */
  name: string;
  /** Description of what the feature does */
  description: string;
  /** Default enabled state when no policy or override is applied */
  defaultValue: boolean;
  /** Stability level of the feature */
  stability: FeatureStability;
  /** SDK version the feature was introduced in */
  sinceVersion: string;
  /** SDK version the feature was deprecated in (only relevant for deprecated) */
  deprecatedInVersion?: string;
  /** SDK version the feature is scheduled for removal */
  scheduledRemovalVersion?: string;
  /** Optional migration guidance shown when feature is toggled */
  migrationNote?: string;
}

// ─── Feature Flag State ────────────────────────────────────────────────

/**
 * Runtime state of a single feature flag, combining the definition
 * with its current effective value and override status.
 */
export interface FeatureFlagState {
  /** The static definition */
  definition: FeatureFlagDefinition;
  /** Whether the feature is currently enabled */
  enabled: boolean;
  /** Whether the value differs from the default (due to policy or override) */
  isOverridden: boolean;
}

// ─── Feature Policy ────────────────────────────────────────────────────

/**
 * Policy that controls the default behaviour for features of
 * different stability levels. Policies are evaluated *before*
 * individual overrides.
 */
export interface FeaturePolicy {
  /** Allow features marked as beta */
  allowBeta: boolean;
  /** Allow features marked as experimental */
  allowExperimental: boolean;
  /** Allow features marked as deprecated */
  allowDeprecated: boolean;
}

/**
 * Sensible default policy: only stable features are enabled by default.
 */
export const DEFAULT_FEATURE_POLICY: FeaturePolicy = {
  allowBeta: false,
  allowExperimental: false,
  allowDeprecated: false,
};

/**
 * Permissive policy for development/testing: enables everything.
 */
export const PERMISSIVE_FEATURE_POLICY: FeaturePolicy = {
  allowBeta: true,
  allowExperimental: true,
  allowDeprecated: true,
};

// ─── Feature Config ────────────────────────────────────────────────────

/**
 * Runtime configuration for the feature flag system.
 */
export interface FeatureFlagsConfig {
  /** Policy governing default behaviour per stability level */
  policy: FeaturePolicy;
  /** Explicit per-flag overrides (key → enabled) */
  overrides: Record<string, boolean>;
}

/**
 * Default config: stable features enabled, no overrides.
 */
export const DEFAULT_FEATURE_FLAGS_CONFIG: FeatureFlagsConfig = {
  policy: { ...DEFAULT_FEATURE_POLICY },
  overrides: {},
};

// ─── Feature Evaluation Context ────────────────────────────────────────

/**
 * Context passed to custom feature evaluators when determining
 * whether a feature should be enabled.
 */
export interface FeatureEvaluationContext {
  /** The feature being evaluated */
  flag: FeatureFlagDefinition;
  /** Current policy */
  policy: FeaturePolicy;
  /** Any explicit override for this flag */
  override: boolean | undefined;
}

// ─── Feature Summary ───────────────────────────────────────────────────

/**
 * Human-readable summary of all feature flags and their current state,
 * useful for diagnostics and debugging.
 */
export interface FeatureFlagsSummary {
  /** Total number of registered flags */
  totalFlags: number;
  /** Number of currently enabled flags */
  enabledFlags: number;
  /** Current policy in effect */
  policy: FeaturePolicy;
  /** Number of overridden flags */
  overrideCount: number;
  /** Per-flag state breakdown */
  flags: FeatureFlagState[];
}
