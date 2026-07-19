// Feature Flag Types
export { FeatureStability } from './types';
export type {
  FeatureFlagDefinition,
  FeatureFlagState,
  FeaturePolicy,
  FeatureFlagsConfig,
  FeatureEvaluationContext,
  FeatureFlagsSummary,
} from './types';
export {
  DEFAULT_FEATURE_POLICY,
  PERMISSIVE_FEATURE_POLICY,
  DEFAULT_FEATURE_FLAGS_CONFIG,
} from './types';

// Feature Flags Service & Built-in Definitions
export { FeatureFlagsService, BUILT_IN_FEATURE_FLAGS } from './flags';

// Evaluation Utilities
export {
  evaluateFeature,
  createEvaluationContext,
  isProductionSafe,
  getStabilityLabel,
  getDeprecationWarning,
  filterByStability,
} from './evaluation';

// Policy Presets
export {
  PRODUCTION_POLICY,
  STAGING_POLICY,
  DEVELOPMENT_POLICY,
  PERMISSIVE_POLICY,
  resolvePolicyFromEnvironment,
  mergePolicies,
} from './policies';
