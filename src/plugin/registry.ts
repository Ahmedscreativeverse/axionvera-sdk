import type { PluginManifest, PluginRegistryEntry } from './types';

/**
 * A lightweight registry that holds plugin manifests for discovery
 * and dependency resolution, separate from the runtime PluginManager.
 *
 * This allows plugins to be declared (e.g. from package.json, remote
 * manifests) without being loaded into the runtime — enabling
 * dependency resolution before installation.
 */
export class PluginRegistry {
  private entries: Map<string, PluginRegistryEntry> = new Map();

  /**
   * Register a plugin manifest in the registry.
   */
  register(manifest: PluginManifest, source: string): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(
        `Plugin "${manifest.id}" is already registered in the registry.`,
      );
    }

    this.entries.set(manifest.id, {
      manifest,
      source,
      loaded: false,
    });
  }

  /**
   * Remove a plugin from the registry.
   */
  unregister(pluginId: string): void {
    if (!this.entries.has(pluginId)) {
      throw new Error(`Plugin "${pluginId}" not found in registry.`);
    }

    // Prevent removing a plugin that others depend on
    const dependents = this.getDependents(pluginId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister "${pluginId}" — it is a dependency of: ${dependents.join(', ')}`,
      );
    }

    this.entries.delete(pluginId);
  }

  /**
   * Get a plugin entry by ID.
   */
  get(pluginId: string): PluginRegistryEntry | undefined {
    return this.entries.get(pluginId);
  }

  /**
   * Check if a plugin exists in the registry.
   */
  has(pluginId: string): boolean {
    return this.entries.has(pluginId);
  }

  /**
   * Get all registry entries.
   */
  getAll(): PluginRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Mark a plugin as loaded (installed in the runtime).
   */
  markLoaded(pluginId: string): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin "${pluginId}" not found in registry.`);
    }
    entry.loaded = true;
  }

  /**
   * Mark a plugin as unloaded.
   */
  markUnloaded(pluginId: string): void {
    const entry = this.entries.get(pluginId);
    if (entry) {
      entry.loaded = false;
    }
  }

  /**
   * Get plugins that depend on the given plugin ID.
   */
  getDependents(pluginId: string): string[] {
    const dependents: string[] = [];

    for (const [, entry] of this.entries) {
      const deps = entry.manifest.dependencies ?? [];
      if (deps.some((d) => d.pluginId === pluginId)) {
        dependents.push(entry.manifest.id);
      }
    }

    return dependents;
  }

  /**
   * Resolve all dependencies for a plugin (recursively).
   * Returns the ordered list of plugin manifests that should be installed,
   * including the target plugin itself.
   */
  resolveDependencies(pluginId: string): PluginManifest[] {
    const resolved: PluginManifest[] = [];
    const seen = new Set<string>();

    const resolve = (id: string): void => {
      if (seen.has(id)) return;
      seen.add(id);

      const entry = this.entries.get(id);
      if (!entry) {
        // Optional: could throw or just warn for missing deps
        return;
      }

      const deps = entry.manifest.dependencies ?? [];
      for (const dep of deps) {
        if (!dep.optional) {
          resolve(dep.pluginId);
        } else if (this.entries.has(dep.pluginId)) {
          // Resolve optional deps if available
          resolve(dep.pluginId);
        }
      }

      resolved.push(entry.manifest);
    };

    resolve(pluginId);
    return resolved;
  }

  /**
   * Search plugins by keyword or name (case-insensitive substring match).
   */
  search(query: string): PluginRegistryEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: PluginRegistryEntry[] = [];

    for (const [, entry] of this.entries) {
      const m = entry.manifest;
      const nameMatch = m.name.toLowerCase().includes(lowerQuery);
      const descMatch = m.description?.toLowerCase().includes(lowerQuery);
      const keywordMatch = m.keywords?.some((k) =>
        k.toLowerCase().includes(lowerQuery),
      );

      if (nameMatch || descMatch || keywordMatch) {
        results.push(entry);
      }
    }

    return results;
  }
}
