/**
 * Feature flag policy presets and helpers.
 *
 * Policies determine the default enabled/disabled state for features
 * based on their stability level.
 */

import type { FeaturePolicy } from './types';

/**
 * Standard production policy: only stable features enabled.
 */
export const PRODUCTION_POLICY: FeaturePolicy = {
  allowBeta: false,
  allowExperimental: false,
  allowDeprecated: false,
};

/**
 * Staging/testing policy: stable + beta features enabled.
 */
export const STAGING_POLICY: FeaturePolicy = {
  allowBeta: true,
  allowExperimental: false,
  allowDeprecated: false,
};

/**
 * Development policy: all non-deprecated features enabled.
 */
export const DEVELOPMENT_POLICY: FeaturePolicy = {
  allowBeta: true,
  allowExperimental: true,
  allowDeprecated: false,
};

/**
 * Permissive policy: everything enabled (including deprecated flags).
 * Use for local exploration and debugging only.
 */
export const PERMISSIVE_POLICY: FeaturePolicy = {
  allowBeta: true,
  allowExperimental: true,
  allowDeprecated: true,
};

/**
 * Environment-based policy selection.
 *
 * Resolves a sensible default policy from a conventional environment
 * variable or explicit string hint.
 *
 * - `"production"` → PRODUCTION_POLICY
 * - `"staging"`    → STAGING_POLICY
 * - `"development"`|`"test"` → DEVELOPMENT_POLICY
 * - anything else   → PRODUCTION_POLICY (safe default)
 */
export function resolvePolicyFromEnvironment(env?: string): FeaturePolicy {
  const environment = (env ?? process.env.NODE_ENV ?? 'production').toLowerCase();

  switch (environment) {
    case 'production':
      return { ...PRODUCTION_POLICY };
    case 'staging':
      return { ...STAGING_POLICY };
    case 'development':
    case 'test':
      return { ...DEVELOPMENT_POLICY };
    default:
      return { ...PRODUCTION_POLICY };
  }
}

/**
 * Merge multiple partial policies into a single policy.
 * Later policies override earlier ones.
 */
export function mergePolicies(...policies: Partial<FeaturePolicy>[]): FeaturePolicy {
  const merged: FeaturePolicy = {
    allowBeta: false,
    allowExperimental: false,
    allowDeprecated: false,
  };

  for (const policy of policies) {
    if (policy.allowBeta !== undefined) {
      merged.allowBeta = policy.allowBeta;
    }
    if (policy.allowExperimental !== undefined) {
      merged.allowExperimental = policy.allowExperimental;
    }
    if (policy.allowDeprecated !== undefined) {
      merged.allowDeprecated = policy.allowDeprecated;
    }
  }

  return merged;
}
