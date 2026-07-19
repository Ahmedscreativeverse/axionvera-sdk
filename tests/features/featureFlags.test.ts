/**
 * Tests for the Feature Flags System
 *
 * Covers:
 *  - Feature flag definitions and registration
 *  - Feature evaluation (policy-based, overrides)
 *  - Feature flag service lifecycle
 *  - Policy presets and environment resolution
 *  - Deprecation warnings
 *  - Stability filtering and utilities
 */

import {
  FeatureFlagsService,
  BUILT_IN_FEATURE_FLAGS,
  FeatureStability,
  evaluateFeature,
  isProductionSafe,
  getStabilityLabel,
  getDeprecationWarning,
  filterByStability,
  resolvePolicyFromEnvironment,
  mergePolicies,
  PRODUCTION_POLICY,
  STAGING_POLICY,
  DEVELOPMENT_POLICY,
  PERMISSIVE_POLICY,
  DEFAULT_FEATURE_POLICY,
} from '../../src/features';
import type { FeatureFlagDefinition, FeaturePolicy } from '../../src/features';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeFlag(overrides: Partial<FeatureFlagDefinition> = {}): FeatureFlagDefinition {
  return {
    key: 'test.flag',
    name: 'Test Flag',
    description: 'A test feature flag',
    defaultValue: false,
    stability: FeatureStability.Experimental,
    sinceVersion: '1.0.0',
    ...overrides,
  };
}

// ─── Feature Flag Definitions ──────────────────────────────────────────

describe('Feature Flag Definitions', () => {
  it('should have built-in flags registered', () => {
    expect(BUILT_IN_FEATURE_FLAGS.length).toBeGreaterThan(0);
    const keys = BUILT_IN_FEATURE_FLAGS.map((f) => f.key);
    expect(keys).toContain('batchDeposits');
    expect(keys).toContain('contractReflection');
  });

  it('should ensure all built-in flags have unique keys', () => {
    const keys = BUILT_IN_FEATURE_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should have proper stability levels on built-in flags', () => {
    const stableFlags = BUILT_IN_FEATURE_FLAGS.filter(
      (f) => f.stability === FeatureStability.Stable
    );
    const experimentalFlags = BUILT_IN_FEATURE_FLAGS.filter(
      (f) => f.stability === FeatureStability.Experimental
    );

    expect(stableFlags.length).toBeGreaterThan(0);
    expect(experimentalFlags.length).toBeGreaterThan(0);
  });
});

// ─── Feature Flags Service ─────────────────────────────────────────────

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(() => {
    service = new FeatureFlagsService();
  });

  describe('registration', () => {
    it('should register a custom flag', () => {
      const flag = makeFlag({ key: 'custom.feature' });
      service.register(flag);
      expect(service.has('custom.feature')).toBe(true);
    });

    it('should throw when registering a duplicate flag', () => {
      const flag = makeFlag({ key: 'custom.feature' });
      service.register(flag);
      expect(() => service.register(flag)).toThrow(
        'Feature flag "custom.feature" is already registered.'
      );
    });

    it('should unregister a flag', () => {
      const flag = makeFlag({ key: 'custom.feature' });
      service.register(flag);
      expect(service.unregister('custom.feature')).toBe(true);
      expect(service.has('custom.feature')).toBe(false);
    });

    it('should return false when unregistering unknown flag', () => {
      expect(service.unregister('nonexistent')).toBe(false);
    });

    it('should have built-in flags pre-registered', () => {
      for (const flag of BUILT_IN_FEATURE_FLAGS) {
        expect(service.has(flag.key)).toBe(true);
      }
    });
  });

  describe('feature evaluation', () => {
    it('should enable stable features by default', () => {
      expect(service.isEnabled('contractReflection')).toBe(true);
      expect(service.isEnabled('xdrValidation')).toBe(true);
    });

    it('should disable experimental features under production policy', () => {
      expect(service.isEnabled('offlineSigning')).toBe(false);
      expect(service.isEnabled('contractMigration')).toBe(false);
    });

    it('should disable beta features under production policy', () => {
      expect(service.isEnabled('batchDeposits')).toBe(false);
    });

    it('should return false for unknown flags', () => {
      expect(service.isEnabled('nonexistent.flag')).toBe(false);
    });

    it('should respect explicit overrides', () => {
      // Experimental feature disabled by default
      expect(service.isEnabled('offlineSigning')).toBe(false);

      service.enable('offlineSigning');
      expect(service.isEnabled('offlineSigning')).toBe(true);

      service.disable('offlineSigning');
      expect(service.isEnabled('offlineSigning')).toBe(false);
    });

    it('should allow disabling a stable feature', () => {
      expect(service.isEnabled('xdrValidation')).toBe(true);
      service.disable('xdrValidation');
      expect(service.isEnabled('xdrValidation')).toBe(false);
    });

    it('should reset an override to policy-based evaluation', () => {
      service.enable('offlineSigning');
      expect(service.isEnabled('offlineSigning')).toBe(true);
      service.reset('offlineSigning');
      expect(service.isEnabled('offlineSigning')).toBe(false);
    });

    it('should throw when enabling an unknown flag', () => {
      expect(() => service.enable('nonexistent')).toThrow(
        'Feature flag "nonexistent" is not registered.'
      );
    });

    it('should throw when disabling an unknown flag', () => {
      expect(() => service.disable('nonexistent')).toThrow(
        'Feature flag "nonexistent" is not registered.'
      );
    });
  });

  describe('policy management', () => {
    it('should use provided policy', () => {
      const svc = new FeatureFlagsService({
        policy: { allowBeta: true, allowExperimental: true, allowDeprecated: false },
      });
      expect(svc.isEnabled('batchDeposits')).toBe(true);
      expect(svc.isEnabled('offlineSigning')).toBe(true);
    });

    it('should update policy at runtime', () => {
      expect(service.isEnabled('batchDeposits')).toBe(false);
      service.setPolicy({ allowBeta: true });
      expect(service.isEnabled('batchDeposits')).toBe(true);
    });

    it('should override take precedence over policy', () => {
      service.setPolicy({ allowBeta: true });
      expect(service.isEnabled('batchDeposits')).toBe(true);
      service.disable('batchDeposits');
      expect(service.isEnabled('batchDeposits')).toBe(false);
    });

    it('should reset all overrides and policy', () => {
      service.enable('offlineSigning');
      service.setPolicy({ allowBeta: true });
      service.resetAll();
      expect(service.isEnabled('offlineSigning')).toBe(false);
      expect(service.isEnabled('batchDeposits')).toBe(false);
      expect(service.getPolicy()).toEqual(DEFAULT_FEATURE_POLICY);
    });
  });

  describe('queries', () => {
    it('should get state for a flag', () => {
      const state = service.getState('contractReflection');
      expect(state).toBeDefined();
      expect(state!.enabled).toBe(true);
      expect(state!.isOverridden).toBe(false);
      expect(state!.definition.key).toBe('contractReflection');
    });

    it('should return undefined for unknown flag state', () => {
      expect(service.getState('nonexistent')).toBeUndefined();
    });

    it('should get all states', () => {
      const states = service.getAllStates();
      expect(states.length).toBe(BUILT_IN_FEATURE_FLAGS.length);
    });

    it('should get summary', () => {
      const summary = service.getSummary();
      expect(summary.totalFlags).toBe(BUILT_IN_FEATURE_FLAGS.length);
      expect(summary.policy).toBeDefined();
      expect(summary.flags).toHaveLength(BUILT_IN_FEATURE_FLAGS.length);
    });

    it('should filter by stability', () => {
      const stable = service.getByStability(FeatureStability.Stable);
      expect(stable.every((s) => s.definition.stability === FeatureStability.Stable)).toBe(true);
    });

    it('should get enabled keys', () => {
      const keys = service.getEnabledKeys();
      expect(keys).toContain('contractReflection');
      expect(keys).not.toContain('offlineSigning');
    });
  });

  describe('config constructor', () => {
    it('should merge partial config with defaults', () => {
      const svc = new FeatureFlagsService({
        policy: { allowBeta: true, allowExperimental: false, allowDeprecated: false },
        overrides: { batchDeposits: false },
      });

      // Policy says beta=true but override says batchDeposits=false
      expect(svc.isEnabled('batchDeposits')).toBe(false);
    });

    it('should accept no config', () => {
      const svc = new FeatureFlagsService();
      expect(svc.getSummary().totalFlags).toBeGreaterThan(0);
    });
  });
});

// ─── Evaluation Utilities ──────────────────────────────────────────────

describe('evaluateFeature', () => {
  const policy: FeaturePolicy = {
    allowBeta: false,
    allowExperimental: false,
    allowDeprecated: false,
  };

  it('should enable stable features', () => {
    expect(evaluateFeature(makeFlag({ stability: FeatureStability.Stable }), policy)).toBe(true);
  });

  it('should disable experimental features under strict policy', () => {
    expect(evaluateFeature(makeFlag({ stability: FeatureStability.Experimental }), policy)).toBe(
      false
    );
  });

  it('should enable experimental features under permissive policy', () => {
    expect(
      evaluateFeature(makeFlag({ stability: FeatureStability.Experimental }), {
        ...policy,
        allowExperimental: true,
      })
    ).toBe(true);
  });

  it('should respect explicit override', () => {
    expect(
      evaluateFeature(makeFlag({ stability: FeatureStability.Experimental }), policy, true)
    ).toBe(true);
  });

  it('should respect explicit override even for stable', () => {
    expect(evaluateFeature(makeFlag({ stability: FeatureStability.Stable }), policy, false)).toBe(
      false
    );
  });
});

// ─── Stability Utilities ───────────────────────────────────────────────

describe('isProductionSafe', () => {
  it('should consider stable as production safe', () => {
    expect(isProductionSafe(FeatureStability.Stable)).toBe(true);
  });

  it('should consider beta as production safe', () => {
    expect(isProductionSafe(FeatureStability.Beta)).toBe(true);
  });

  it('should not consider experimental as production safe', () => {
    expect(isProductionSafe(FeatureStability.Experimental)).toBe(false);
  });

  it('should not consider deprecated as production safe', () => {
    expect(isProductionSafe(FeatureStability.Deprecated)).toBe(false);
  });
});

describe('getStabilityLabel', () => {
  it('should return human-readable labels', () => {
    expect(getStabilityLabel(FeatureStability.Stable)).toBe('Stable');
    expect(getStabilityLabel(FeatureStability.Beta)).toBe('Beta');
    expect(getStabilityLabel(FeatureStability.Experimental)).toBe('Experimental');
    expect(getStabilityLabel(FeatureStability.Deprecated)).toBe('Deprecated');
  });
});

describe('getDeprecationWarning', () => {
  it('should return null for non-deprecated features', () => {
    expect(getDeprecationWarning(makeFlag({ stability: FeatureStability.Stable }))).toBeNull();
  });

  it('should return warning for deprecated features', () => {
    const warning = getDeprecationWarning(
      makeFlag({
        stability: FeatureStability.Deprecated,
        deprecatedInVersion: '1.5.0',
      })
    );
    expect(warning).toContain('deprecated');
    expect(warning).toContain('v1.5.0');
  });

  it('should include scheduled removal version', () => {
    const warning = getDeprecationWarning(
      makeFlag({
        stability: FeatureStability.Deprecated,
        scheduledRemovalVersion: '2.0.0',
      })
    );
    expect(warning).toContain('v2.0.0');
  });

  it('should include migration note', () => {
    const warning = getDeprecationWarning(
      makeFlag({
        stability: FeatureStability.Deprecated,
        migrationNote: 'Use newFeature instead.',
      })
    );
    expect(warning).toContain('Use newFeature instead.');
  });
});

describe('filterByStability', () => {
  it('should filter flags by stability level', () => {
    const flags = [
      makeFlag({ key: 'a', stability: FeatureStability.Stable }),
      makeFlag({ key: 'b', stability: FeatureStability.Beta }),
      makeFlag({ key: 'c', stability: FeatureStability.Stable }),
    ];

    const stable = filterByStability(flags, FeatureStability.Stable);
    expect(stable).toHaveLength(2);
    expect(stable.map((f) => f.key)).toEqual(['a', 'c']);
  });

  it('should return empty array when no flags match', () => {
    const flags = [makeFlag({ key: 'a', stability: FeatureStability.Beta })];
    expect(filterByStability(flags, FeatureStability.Experimental)).toHaveLength(0);
  });
});

// ─── Policy Presets ────────────────────────────────────────────────────

describe('resolvePolicyFromEnvironment', () => {
  it('should return production policy by default when NODE_ENV is unset', () => {
    // The function uses process.env.NODE_ENV which Jest sets to 'test'.
    // Explicitly pass undefined to test the fallback path.
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(resolvePolicyFromEnvironment(undefined)).toEqual(PRODUCTION_POLICY);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should return production policy for "production"', () => {
    expect(resolvePolicyFromEnvironment('production')).toEqual(PRODUCTION_POLICY);
  });

  it('should return staging policy for "staging"', () => {
    expect(resolvePolicyFromEnvironment('staging')).toEqual(STAGING_POLICY);
  });

  it('should return development policy for "development"', () => {
    expect(resolvePolicyFromEnvironment('development')).toEqual(DEVELOPMENT_POLICY);
  });

  it('should return development policy for "test"', () => {
    expect(resolvePolicyFromEnvironment('test')).toEqual(DEVELOPMENT_POLICY);
  });

  it('should be case-insensitive', () => {
    expect(resolvePolicyFromEnvironment('PRODUCTION')).toEqual(PRODUCTION_POLICY);
    expect(resolvePolicyFromEnvironment('Staging')).toEqual(STAGING_POLICY);
  });
});

describe('mergePolicies', () => {
  it('should merge partial policies', () => {
    const result = mergePolicies({ allowBeta: true }, { allowExperimental: true });
    expect(result.allowBeta).toBe(true);
    expect(result.allowExperimental).toBe(true);
    expect(result.allowDeprecated).toBe(false);
  });

  it('should let later policies override earlier ones', () => {
    const result = mergePolicies({ allowBeta: true }, { allowBeta: false });
    expect(result.allowBeta).toBe(false);
  });

  it('should return defaults with no arguments', () => {
    const result = mergePolicies();
    expect(result.allowBeta).toBe(false);
    expect(result.allowExperimental).toBe(false);
    expect(result.allowDeprecated).toBe(false);
  });
});
