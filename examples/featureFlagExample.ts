/**
 * Example: Feature Flag System
 *
 * This example demonstrates how to use the SDK's feature flag system
 * to conditionally enable experimental functionality.
 */

import { FeatureFlagsService, FeatureStability } from '../src/features';
import type { FeatureFlagDefinition } from '../src/features';

// ─── Example 1: Basic Usage ────────────────────────────────────────────

function basicUsage(): void {
  console.log('=== Example 1: Basic Usage ===\n');

  // Create a feature flags service with default (production) settings
  const flags = new FeatureFlagsService();

  // Check if stable features are enabled
  console.log('contractReflection enabled:', flags.isEnabled('contractReflection')); // true
  console.log('xdrValidation enabled:', flags.isEnabled('xdrValidation')); // true

  // Experimental features are disabled by default
  console.log('offlineSigning enabled:', flags.isEnabled('offlineSigning')); // false
  console.log('batchDeposits enabled:', flags.isEnabled('batchDeposits')); // false

  // Enable a specific feature
  flags.enable('batchDeposits');
  console.log('batchDeposits enabled (after enable):', flags.isEnabled('batchDeposits')); // true

  // Reset it back to policy default
  flags.reset('batchDeposits');
  console.log('batchDeposits enabled (after reset):', flags.isEnabled('batchDeposits')); // false
}

// ─── Example 2: Policy-Based Configuration ─────────────────────────────

function policyBasedConfig(): void {
  console.log('\n=== Example 2: Policy-Based Configuration ===\n');

  // Development policy: enable beta features
  const devFlags = new FeatureFlagsService({
    policy: { allowBeta: true, allowExperimental: false, allowDeprecated: false },
  });

  console.log('With development policy (beta=true):');
  console.log('  batchDeposits:', devFlags.isEnabled('batchDeposits')); // true
  console.log('  offlineSigning:', devFlags.isEnabled('offlineSigning')); // false

  // Permissive policy: enable everything
  const permissiveFlags = new FeatureFlagsService({
    policy: { allowBeta: true, allowExperimental: true, allowDeprecated: true },
  });

  console.log('\nWith permissive policy:');
  console.log('  batchDeposits:', permissiveFlags.isEnabled('batchDeposits')); // true
  console.log('  offlineSigning:', permissiveFlags.isEnabled('offlineSigning')); // true
  console.log('  contractMigration:', permissiveFlags.isEnabled('contractMigration')); // true
}

// ─── Example 3: Custom Feature Flags ───────────────────────────────────

function customFeatureFlags(): void {
  console.log('\n=== Example 3: Custom Feature Flags ===\n');

  const flags = new FeatureFlagsService();

  // Register a custom experimental feature
  const myFeature: FeatureFlagDefinition = {
    key: 'myCustomFeature',
    name: 'My Custom Feature',
    description: 'An experimental feature under development',
    defaultValue: false,
    stability: FeatureStability.Experimental,
    sinceVersion: '1.5.0',
  };

  flags.register(myFeature);
  console.log('Registered custom flag:', flags.has('myCustomFeature')); // true

  // It's disabled under production policy
  console.log('myCustomFeature enabled:', flags.isEnabled('myCustomFeature')); // false

  // Enable it explicitly
  flags.enable('myCustomFeature');
  console.log('myCustomFeature enabled (override):', flags.isEnabled('myCustomFeature')); // true

  // Unregister when done
  flags.unregister('myCustomFeature');
  console.log('After unregister:', flags.has('myCustomFeature')); // false
}

// ─── Example 4: Using in Application Logic ─────────────────────────────

function applicationIntegration(): void {
  console.log('\n=== Example 4: Application Integration ===\n');

  const flags = new FeatureFlagsService();

  // Conditionally execute code based on feature flags
  async function performDeposit(amount: number): Promise<void> {
    if (flags.isEnabled('batchDeposits')) {
      console.log(`Using batch deposit for ${amount} (experimental)`);
      // Use batch deposit logic...
    } else {
      console.log(`Using standard deposit for ${amount} (stable)`);
      // Use standard deposit logic...
    }
  }

  void performDeposit(1000);

  // Enable batch deposits and try again
  flags.enable('batchDeposits');
  void performDeposit(1000);
}

// ─── Example 5: Diagnostic Summary ─────────────────────────────────────

function diagnosticSummary(): void {
  console.log('\n=== Example 5: Diagnostic Summary ===\n');

  const flags = new FeatureFlagsService({
    policy: { allowBeta: true, allowExperimental: false, allowDeprecated: false },
  });
  flags.enable('contractMigration');

  const summary = flags.getSummary();
  console.log(`Total flags: ${summary.totalFlags}`);
  console.log(`Enabled flags: ${summary.enabledFlags}`);
  console.log(`Overrides: ${summary.overrideCount}`);
  console.log(`Policy:`, summary.policy);

  console.log('\nFlag breakdown:');
  for (const flag of summary.flags) {
    const marker = flag.enabled ? '✓' : '✗';
    const stability = flag.definition.stability;
    const overridden = flag.isOverridden ? ' [overridden]' : '';
    console.log(`  ${marker} ${flag.definition.key} (${stability})${overridden}`);
  }
}

// ─── Example 6: Environment-Based Policy ───────────────────────────────

function environmentBasedPolicy(): void {
  console.log('\n=== Example 6: Environment-Based Policy ===\n');

  // In tests, you might want to enable beta features
  const testFlags = new FeatureFlagsService({
    policy: { allowBeta: true, allowExperimental: true, allowDeprecated: false },
  });

  console.log('Test environment policy:');
  console.log('  batchDeposits:', testFlags.isEnabled('batchDeposits')); // true
  console.log('  offlineSigning:', testFlags.isEnabled('offlineSigning')); // true
  console.log('  contractReflection:', testFlags.isEnabled('contractReflection')); // true

  // Get all enabled feature keys
  const enabled = testFlags.getEnabledKeys();
  console.log(`\nEnabled features (${enabled.length}):`, enabled);
}

// ─── Run All Examples ──────────────────────────────────────────────────

function runAllExamples(): void {
  basicUsage();
  policyBasedConfig();
  customFeatureFlags();
  applicationIntegration();
  diagnosticSummary();
  environmentBasedPolicy();
}

export {
  basicUsage,
  policyBasedConfig,
  customFeatureFlags,
  applicationIntegration,
  diagnosticSummary,
  environmentBasedPolicy,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}
