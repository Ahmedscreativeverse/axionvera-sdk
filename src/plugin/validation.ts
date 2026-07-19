import type {
  PluginConfig,
  PluginDependency,
  PluginValidationResult,
  SemVer,
} from './types';

// ─── SemVer Helpers ────────────────────────────────────────────────────

/**
 * Parse a semver string into its components.
 * Accepts a leading "v" (e.g. "v1.2.3").
 */
export function parseSemVer(version: string): SemVer | null {
  const cleaned = version.replace(/^v/, '');
  const semVerRegex =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
  const match = cleaned.match(semVerRegex);

  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    preRelease: match[4],
    buildMetadata: match[5],
  };
}

/**
 * Compare two SemVer objects.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Pre-release versions have lower precedence
  if (a.preRelease && !b.preRelease) return -1;
  if (!a.preRelease && b.preRelease) return 1;

  // Lexicographic comparison of pre-release identifiers
  if (a.preRelease && b.preRelease) {
    const aParts = a.preRelease.split('.');
    const bParts = b.preRelease.split('.');
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i++) {
      const aPart = aParts[i];
      const bPart = bParts[i];

      if (aPart === undefined) return -1;
      if (bPart === undefined) return 1;

      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
      } else {
        const cmp = aPart.localeCompare(bPart);
        if (cmp !== 0) return cmp;
      }
    }
  }

  return 0;
}

/**
 * Check if versionA satisfies a minimum version requirement.
 */
export function satisfiesMinVersion(versionA: string, minVersion: string): boolean {
  const a = parseSemVer(versionA);
  const min = parseSemVer(minVersion);

  if (!a || !min) return false;

  return compareSemVer(a, min) >= 0;
}

// ─── Plugin Validation ─────────────────────────────────────────────────

const PLUGIN_ID_REGEX = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/i;

/**
 * Validate a plugin configuration against the SDK's requirements.
 */
export function validatePlugin(
  config: PluginConfig,
  sdkVersion?: string,
): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── ID validation ──
  if (!config.id || typeof config.id !== 'string') {
    errors.push('Plugin must have a non-empty string "id".');
  } else if (!PLUGIN_ID_REGEX.test(config.id)) {
    errors.push(
      `Plugin id "${config.id}" is invalid. Use alphanumeric characters, dots, and hyphens.`,
    );
  }

  // ── Name validation ──
  if (!config.name || typeof config.name !== 'string') {
    errors.push('Plugin must have a non-empty string "name".');
  }

  // ── Version validation ──
  if (!config.version) {
    errors.push('Plugin must specify a "version" string (semver).');
  } else if (!parseSemVer(config.version)) {
    errors.push(
      `Plugin version "${config.version}" is not valid semver. Use format "X.Y.Z".`,
    );
  }

  // ── Compatibility validation ──
  if (config.compatibility) {
    if (
      config.compatibility.minSDKVersion &&
      !parseSemVer(config.compatibility.minSDKVersion)
    ) {
      errors.push(
        `minSDKVersion "${config.compatibility.minSDKVersion}" is not valid semver.`,
      );
    }

    if (
      config.compatibility.maxSDKVersion &&
      !parseSemVer(config.compatibility.maxSDKVersion)
    ) {
      errors.push(
        `maxSDKVersion "${config.compatibility.maxSDKVersion}" is not valid semver.`,
      );
    }

    // Check SDK version compatibility
    if (sdkVersion && parseSemVer(sdkVersion)) {
      const sdk = parseSemVer(sdkVersion)!;

      if (config.compatibility.minSDKVersion) {
        const min = parseSemVer(config.compatibility.minSDKVersion);
        if (min && compareSemVer(sdk, min) < 0) {
          errors.push(
            `Plugin requires SDK >= ${config.compatibility.minSDKVersion} but SDK is ${sdkVersion}.`,
          );
        }
      }

      if (config.compatibility.maxSDKVersion) {
        const max = parseSemVer(config.compatibility.maxSDKVersion);
        if (max && compareSemVer(sdk, max) > 0) {
          errors.push(
            `Plugin requires SDK <= ${config.compatibility.maxSDKVersion} but SDK is ${sdkVersion}.`,
          );
        }
      }
    } else if (sdkVersion) {
      warnings.push(`SDK version "${sdkVersion}" is not valid semver — skipping compatibility check.`);
    }
  }

  // ── Dependencies validation ──
  if (config.dependencies && config.dependencies.length > 0) {
    for (const dep of config.dependencies) {
      if (!dep.pluginId || typeof dep.pluginId !== 'string') {
        errors.push('Each dependency must have a non-empty "pluginId".');
      }

      if (dep.minVersion && !parseSemVer(dep.minVersion)) {
        errors.push(
          `Dependency "${dep.pluginId}" minVersion "${dep.minVersion}" is not valid semver.`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that all required dependencies are satisfied by installed plugins.
 */
export function validateDependencies(
  dependencies: PluginDependency[],
  installedPlugins: Map<string, { config: PluginConfig }>,
): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const dep of dependencies) {
    const installed = installedPlugins.get(dep.pluginId);

    if (!installed) {
      if (dep.optional) {
        warnings.push(`Optional dependency "${dep.pluginId}" is not installed.`);
      } else {
        errors.push(`Required dependency "${dep.pluginId}" is not installed.`);
      }
      continue;
    }

    if (dep.minVersion && !satisfiesMinVersion(installed.config.version, dep.minVersion)) {
      const msg = `Dependency "${dep.pluginId}" version ${installed.config.version} does not satisfy minimum ${dep.minVersion}.`;
      if (dep.optional) {
        warnings.push(msg);
      } else {
        errors.push(msg);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for circular dependencies among a set of plugins.
 * Returns an array of plugin IDs involved in cycles, or empty if acyclic.
 */
export function detectCircularDependencies(
  plugins: Map<string, PluginConfig>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(pluginId: string): void {
    visited.add(pluginId);
    recursionStack.add(pluginId);
    path.push(pluginId);

    const config = plugins.get(pluginId);
    if (config?.dependencies) {
      for (const dep of config.dependencies) {
        if (!visited.has(dep.pluginId)) {
          dfs(dep.pluginId);
        } else if (recursionStack.has(dep.pluginId)) {
          // Found a cycle — capture the cycle path
          const cycleStart = path.indexOf(dep.pluginId);
          cycles.push([...path.slice(cycleStart), dep.pluginId]);
        }
      }
    }

    path.pop();
    recursionStack.delete(pluginId);
  }

  for (const pluginId of plugins.keys()) {
    if (!visited.has(pluginId)) {
      dfs(pluginId);
    }
  }

  return cycles;
}

/**
 * Topologically sort plugins by their dependencies.
 * Returns the sorted plugin IDs, or throws if there's a cycle.
 */
export function topologicalSort(
  plugins: Map<string, PluginConfig>,
): string[] {
  const cycles = detectCircularDependencies(plugins);
  if (cycles.length > 0) {
    const cycleStr = cycles.map((c) => c.join(' → ')).join('; ');
    throw new Error(`Circular plugin dependencies detected: ${cycleStr}`);
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(pluginId: string): void {
    if (visited.has(pluginId)) return;
    if (visiting.has(pluginId)) return; // Already handled by cycle detection

    visiting.add(pluginId);

    const config = plugins.get(pluginId);
    if (config?.dependencies) {
      for (const dep of config.dependencies) {
        if (plugins.has(dep.pluginId)) {
          visit(dep.pluginId);
        }
      }
    }

    visiting.delete(pluginId);
    visited.add(pluginId);
    sorted.push(pluginId);
  }

  for (const pluginId of plugins.keys()) {
    visit(pluginId);
  }

  return sorted;
}
