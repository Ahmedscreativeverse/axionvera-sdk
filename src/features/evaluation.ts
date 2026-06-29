/**
 * Feature flag evaluation utilities.
 *
 * Provides helper functions for evaluating feature flags in different
 * contexts without requiring a full FeatureFlagsService instance.
 */

import type { FeatureFlagDefinition, FeatureEvaluationContext, FeaturePolicy } from './types';
import { FeatureStability } from './types';

/**
 * Evaluate whether a feature should be enabled given a definition,
 * policy, and optional override.
 *
 * This is a pure function suitable for unit testing and
 * scenarios where a full service instance is not available.
 */
export function evaluateFeature(
  definition: FeatureFlagDefinition,
  policy: FeaturePolicy,
  override?: boolean
): boolean {
  // Explicit override takes highest precedence
  if (override !== undefined) {
    return override;
  }

  // Policy-based evaluation by stability level
  switch (definition.stability) {
    case FeatureStability.Stable:
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

/**
 * Create an evaluation context from a flag, policy, and override.
 */
export function createEvaluationContext(
  flag: FeatureFlagDefinition,
  policy: FeaturePolicy,
  override: boolean | undefined
): FeatureEvaluationContext {
  return { flag, policy, override };
}

/**
 * Check if a feature is considered "safe for production".
 * A feature is production-safe if it is Stable or Beta.
 */
export function isProductionSafe(stability: FeatureStability): boolean {
  return stability === FeatureStability.Stable || stability === FeatureStability.Beta;
}

/**
 * Get a human-readable label for a stability level.
 */
export function getStabilityLabel(stability: FeatureStability): string {
  switch (stability) {
    case FeatureStability.Stable:
      return 'Stable';
    case FeatureStability.Beta:
      return 'Beta';
    case FeatureStability.Experimental:
      return 'Experimental';
    case FeatureStability.Deprecated:
      return 'Deprecated';
    default:
      return 'Unknown';
  }
}

/**
 * Warn about deprecated features when they are enabled.
 * Returns a warning message, or null if the feature is not deprecated.
 */
export function getDeprecationWarning(definition: FeatureFlagDefinition): string | null {
  if (definition.stability !== FeatureStability.Deprecated) {
    return null;
  }

  let warning = `Feature "${definition.key}" is deprecated`;
  if (definition.deprecatedInVersion) {
    warning += ` since v${definition.deprecatedInVersion}`;
  }
  if (definition.scheduledRemovalVersion) {
    warning += ` and will be removed in v${definition.scheduledRemovalVersion}`;
  }
  if (definition.migrationNote) {
    warning += `. ${definition.migrationNote}`;
  }
  warning += '.';

  return warning;
}

/**
 * Filter a list of flag definitions to only those matching a given stability.
 */
export function filterByStability(
  flags: FeatureFlagDefinition[],
  stability: FeatureStability
): FeatureFlagDefinition[] {
  return flags.filter((f) => f.stability === stability);
}
