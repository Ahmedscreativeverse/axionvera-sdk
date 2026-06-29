/**
 * Tests for the Plugin Architecture
 *
 * Covers:
 *  - Plugin registration (valid and invalid)
 *  - Plugin lifecycle state transitions
 *  - Plugin validation (compatibility, semver, dependencies)
 *  - Plugin manager hooks and client integration
 *  - Plugin registry (dependency resolution, search)
 *  - Sample plugin integration
 */

import { PluginManager } from '../src/plugin/pluginManager';
import { PluginRegistry } from '../src/plugin/registry';
import {
  PluginLifecycleState,
  type PluginConfig,
  type PluginManifest,
} from '../src/plugin/types';
import {
  validatePlugin,
  parseSemVer,
  compareSemVer,
  satisfiesMinVersion,
  detectCircularDependencies,
  topologicalSort,
} from '../src/plugin/validation';
import {
  transitionState,
  isValidTransition,
  InvalidPluginTransitionError,
} from '../src/plugin/lifecycle';

// ─── Helpers ───────────────────────────────────────────────────────────

function makePlugin(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    id: 'com.test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    compatibility: {
      minSDKVersion: '1.0.0',
    },
    ...overrides,
  };
}

// ─── Validation Tests ──────────────────────────────────────────────────

describe('Plugin Validation', () => {
  describe('parseSemVer', () => {
    it('should parse a simple semver', () => {
      expect(parseSemVer('1.2.3')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        preRelease: undefined,
        buildMetadata: undefined,
      });
    });

    it('should parse semver with pre-release', () => {
      expect(parseSemVer('1.2.3-alpha.1')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        preRelease: 'alpha.1',
        buildMetadata: undefined,
      });
    });

    it('should parse semver with build metadata', () => {
      expect(parseSemVer('1.2.3+build.42')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        preRelease: undefined,
        buildMetadata: 'build.42',
      });
    });

    it('should parse semver with leading v', () => {
      expect(parseSemVer('v2.0.0')).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
        preRelease: undefined,
        buildMetadata: undefined,
      });
    });

    it('should return null for invalid semver', () => {
      expect(parseSemVer('not-a-version')).toBeNull();
      expect(parseSemVer('1.2')).toBeNull();
      expect(parseSemVer('')).toBeNull();
    });
  });

  describe('compareSemVer', () => {
    it('should compare major versions', () => {
      expect(compareSemVer(parseSemVer('2.0.0')!, parseSemVer('1.0.0')!)).toBeGreaterThan(0);
      expect(compareSemVer(parseSemVer('1.0.0')!, parseSemVer('2.0.0')!)).toBeLessThan(0);
    });

    it('should compare minor versions', () => {
      expect(compareSemVer(parseSemVer('1.2.0')!, parseSemVer('1.1.0')!)).toBeGreaterThan(0);
    });

    it('should compare patch versions', () => {
      expect(compareSemVer(parseSemVer('1.0.3')!, parseSemVer('1.0.2')!)).toBeGreaterThan(0);
    });

    it('should treat pre-release as lower than release', () => {
      expect(
        compareSemVer(parseSemVer('1.0.0-alpha')!, parseSemVer('1.0.0')!),
      ).toBeLessThan(0);
    });

    it('should return 0 for equal versions', () => {
      expect(compareSemVer(parseSemVer('1.2.3')!, parseSemVer('1.2.3')!)).toBe(0);
    });
  });

  describe('satisfiesMinVersion', () => {
    it('should return true when version meets minimum', () => {
      expect(satisfiesMinVersion('2.0.0', '1.0.0')).toBe(true);
      expect(satisfiesMinVersion('1.0.0', '1.0.0')).toBe(true);
    });

    it('should return false when version is below minimum', () => {
      expect(satisfiesMinVersion('0.9.0', '1.0.0')).toBe(false);
    });

    it('should return false for invalid versions', () => {
      expect(satisfiesMinVersion('bad', '1.0.0')).toBe(false);
      expect(satisfiesMinVersion('1.0.0', 'bad')).toBe(false);
    });
  });

  describe('validatePlugin', () => {
    it('should pass a valid plugin config', () => {
      const result = validatePlugin(makePlugin(), '2.0.0');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject a plugin with no ID', () => {
      const result = validatePlugin(makePlugin({ id: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('should reject a plugin with invalid ID format', () => {
      const result = validatePlugin(makePlugin({ id: 'Bad ID!' }));
      expect(result.valid).toBe(false);
    });

    it('should reject a plugin with no name', () => {
      const result = validatePlugin(makePlugin({ name: '' }));
      expect(result.valid).toBe(false);
    });

    it('should reject a plugin with invalid version', () => {
      const result = validatePlugin(makePlugin({ version: 'not-semver' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('should reject when SDK version is below minimum', () => {
      const plugin = makePlugin({
        compatibility: { minSDKVersion: '2.0.0' },
      });
      const result = validatePlugin(plugin, '1.0.0');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('SDK >='))).toBe(true);
    });

    it('should reject when SDK version is above maximum', () => {
      const plugin = makePlugin({
        compatibility: { maxSDKVersion: '1.0.0' },
      });
      const result = validatePlugin(plugin, '2.0.0');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('SDK <='))).toBe(true);
    });

    it('should accept IDs with dots and hyphens', () => {
      const result = validatePlugin(makePlugin({ id: 'com.my-org.plugin-v2' }));
      expect(result.valid).toBe(true);
    });

    it('should validate dependency minVersion format', () => {
      const plugin = makePlugin({
        dependencies: [{ pluginId: 'dep1', minVersion: 'not-semver' }],
      });
      const result = validatePlugin(plugin);
      expect(result.valid).toBe(false);
    });
  });

  describe('circular dependency detection', () => {
    it('should detect a simple cycle', () => {
      const plugins = new Map<string, PluginConfig>();
      plugins.set(
        'a',
        makePlugin({ id: 'a', dependencies: [{ pluginId: 'b' }] }),
      );
      plugins.set(
        'b',
        makePlugin({ id: 'b', dependencies: [{ pluginId: 'a' }] }),
      );

      const cycles = detectCircularDependencies(plugins);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty for acyclic dependencies', () => {
      const plugins = new Map<string, PluginConfig>();
      plugins.set(
        'a',
        makePlugin({ id: 'a', dependencies: [{ pluginId: 'b' }] }),
      );
      plugins.set('b', makePlugin({ id: 'b' }));

      const cycles = detectCircularDependencies(plugins);
      expect(cycles).toHaveLength(0);
    });

    it('should detect self-dependency', () => {
      const plugins = new Map<string, PluginConfig>();
      plugins.set(
        'a',
        makePlugin({ id: 'a', dependencies: [{ pluginId: 'a' }] }),
      );

      const cycles = detectCircularDependencies(plugins);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('topologicalSort', () => {
    it('should sort plugins in dependency order', () => {
      const plugins = new Map<string, PluginConfig>();
      plugins.set(
        'app',
        makePlugin({
          id: 'app',
          dependencies: [{ pluginId: 'lib' }, { pluginId: 'util' }],
        }),
      );
      plugins.set(
        'lib',
        makePlugin({ id: 'lib', dependencies: [{ pluginId: 'util' }] }),
      );
      plugins.set('util', makePlugin({ id: 'util' }));

      const sorted = topologicalSort(plugins);
      // util must come before lib, lib before app
      expect(sorted.indexOf('util')).toBeLessThan(sorted.indexOf('lib'));
      expect(sorted.indexOf('lib')).toBeLessThan(sorted.indexOf('app'));
    });

    it('should throw on circular dependencies', () => {
      const plugins = new Map<string, PluginConfig>();
      plugins.set(
        'a',
        makePlugin({ id: 'a', dependencies: [{ pluginId: 'b' }] }),
      );
      plugins.set(
        'b',
        makePlugin({ id: 'b', dependencies: [{ pluginId: 'a' }] }),
      );

      expect(() => topologicalSort(plugins)).toThrow('circular');
    });
  });
});

// ─── Lifecycle Tests ──────────────────────────────────────────────────

describe('Plugin Lifecycle', () => {
  describe('transitionState', () => {
    it('should transition from Unregistered to Registered', () => {
      const state = transitionState(
        'test',
        PluginLifecycleState.Unregistered,
        PluginLifecycleState.Registered,
      );
      expect(state).toBe(PluginLifecycleState.Registered);
    });

    it('should transition from Registered to Installed', () => {
      const state = transitionState(
        'test',
        PluginLifecycleState.Registered,
        PluginLifecycleState.Installed,
      );
      expect(state).toBe(PluginLifecycleState.Installed);
    });

    it('should transition from Installed to Active', () => {
      const state = transitionState(
        'test',
        PluginLifecycleState.Installed,
        PluginLifecycleState.Active,
      );
      expect(state).toBe(PluginLifecycleState.Active);
    });

    it('should transition from Active to Disabled', () => {
      const state = transitionState(
        'test',
        PluginLifecycleState.Active,
        PluginLifecycleState.Disabled,
      );
      expect(state).toBe(PluginLifecycleState.Disabled);
    });

    it('should throw on invalid transition', () => {
      expect(() =>
        transitionState(
          'test',
          PluginLifecycleState.Unregistered,
          PluginLifecycleState.Active, // skipping Registered + Installed
        ),
      ).toThrow(InvalidPluginTransitionError);
    });

    it('should NOT allow Uninstalled → anything', () => {
      expect(() =>
        transitionState(
          'test',
          PluginLifecycleState.Uninstalled,
          PluginLifecycleState.Registered,
        ),
      ).toThrow(InvalidPluginTransitionError);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(
        isValidTransition(
          PluginLifecycleState.Registered,
          PluginLifecycleState.Installed,
        ),
      ).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(
        isValidTransition(
          PluginLifecycleState.Unregistered,
          PluginLifecycleState.Active,
        ),
      ).toBe(false);
    });
  });
});

// ─── Plugin Manager Tests ─────────────────────────────────────────────

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager({
      sdkVersion: '2.0.0',
      autoInstall: false,
      autoEnable: false,
    });
  });

  describe('registration', () => {
    it('should register a valid plugin', () => {
      const plugin = makePlugin();
      manager.register(plugin);
      expect(manager.has(plugin.id)).toBe(true);
      expect(manager.size).toBe(1);
    });

    it('should set state to Registered after registration', () => {
      const plugin = makePlugin();
      manager.register(plugin);
      const instance = manager.get(plugin.id);
      expect(instance?.state).toBe(PluginLifecycleState.Registered);
    });

    it('should set registeredAt timestamp', () => {
      const plugin = makePlugin();
      manager.register(plugin);
      const instance = manager.get(plugin.id);
      expect(instance?.registeredAt).toBeInstanceOf(Date);
    });

    it('should throw when registering a duplicate plugin', () => {
      const plugin = makePlugin();
      manager.register(plugin);
      expect(() => manager.register(plugin)).toThrow('already registered');
    });

    it('should reject plugin with invalid SDK compatibility', () => {
      const plugin = makePlugin({
        compatibility: { minSDKVersion: '3.0.0' },
      });
      expect(() => manager.register(plugin)).toThrow('validation failed');
    });

    it('should store validation result on the instance', () => {
      const plugin = makePlugin();
      manager.register(plugin);
      const instance = manager.get(plugin.id);
      expect(instance?.lastValidation).toBeDefined();
      expect(instance?.lastValidation?.valid).toBe(true);
    });
  });

  describe('lifecycle operations', () => {
    it('should install a registered plugin', async () => {
      const plugin = makePlugin();
      manager.register(plugin);
      await manager.install(plugin.id);

      const instance = manager.get(plugin.id);
      expect(instance?.state).toBe(PluginLifecycleState.Active); // autoEnable is true by default
    });

    it('should fire onInstall hook', async () => {
      const onInstall = jest.fn();
      const plugin = makePlugin({ hooks: { onInstall } });
      manager.register(plugin);
      await manager.install(plugin.id);
      expect(onInstall).toHaveBeenCalledTimes(1);
    });

    it('should fire onEnable hook', async () => {
      const onEnable = jest.fn();
      const plugin = makePlugin({ hooks: { onEnable } });
      manager.register(plugin);
      await manager.install(plugin.id);
      // autoEnable defaults to true
      expect(onEnable).toHaveBeenCalledTimes(1);
    });

    it('should not fire onEnable when autoEnable is false', async () => {
      const mgr = new PluginManager({ autoEnable: false, sdkVersion: '2.0.0' });
      const onEnable = jest.fn();
      mgr.register(makePlugin({ id: 'p1', hooks: { onEnable } }));
      await mgr.install('p1');
      expect(onEnable).not.toHaveBeenCalled();
    });

    it('should disable an active plugin', async () => {
      const onDisable = jest.fn();
      const plugin = makePlugin({ hooks: { onDisable } });
      manager.register(plugin);
      await manager.install(plugin.id);
      await manager.disable(plugin.id);

      const instance = manager.get(plugin.id);
      expect(instance?.state).toBe(PluginLifecycleState.Disabled);
      expect(onDisable).toHaveBeenCalledTimes(1);
    });

    it('should re-enable a disabled plugin', async () => {
      const plugin = makePlugin();
      manager.register(plugin);
      await manager.install(plugin.id);
      await manager.disable(plugin.id);
      await manager.enable(plugin.id);

      expect(manager.get(plugin.id)?.state).toBe(PluginLifecycleState.Active);
    });

    it('should uninstall a plugin', async () => {
      const onUninstall = jest.fn();
      const plugin = makePlugin({ hooks: { onUninstall } });
      manager.register(plugin);
      await manager.install(plugin.id);
      await manager.uninstall(plugin.id);

      const instance = manager.get(plugin.id);
      expect(instance?.state).toBe(PluginLifecycleState.Uninstalled);
      expect(onUninstall).toHaveBeenCalledTimes(1);
    });

    it('should throw when unregistering a plugin that is a dependency', async () => {
      const dep = makePlugin({ id: 'dep' });
      const parent = makePlugin({
        id: 'parent',
        dependencies: [{ pluginId: 'dep' }],
      });

      manager.register(dep);
      await manager.install('dep');
      manager.register(parent);
      await manager.install('parent');

      await expect(manager.unregister('dep')).rejects.toThrow(
        'dependency of: parent',
      );
    });
  });

  describe('auto-install', () => {
    it('should auto-install when autoInstall is true', () => {
      const mgr = new PluginManager({ autoInstall: true, sdkVersion: '2.0.0' });
      const plugin = makePlugin();
      mgr.register(plugin);

      // After registration, the plugin should be in the process of
      // installation. Since install is async, the state may still be
      // Registered synchronously. Wait a tick.
      // We test that it was *called* by checking installedAt
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const instance = mgr.get(plugin.id);
          expect(instance?.state).toBe(PluginLifecycleState.Active);
          resolve();
        }, 100);
      });
    });
  });

  describe('queries', () => {
    it('should return installed plugins', async () => {
      const p1 = makePlugin({ id: 'p1' });
      const p2 = makePlugin({ id: 'p2' });
      manager.register(p1);
      manager.register(p2);
      await manager.install('p1');

      const installed = manager.getInstalled();
      expect(installed).toHaveLength(1);
      expect(installed[0].config.id).toBe('p1');
    });

    it('should return active plugins', async () => {
      manager.register(makePlugin({ id: 'p1' }));
      manager.register(makePlugin({ id: 'p2' }));
      await manager.install('p1');
      await manager.install('p2');
      await manager.disable('p2');

      const active = manager.getActive();
      expect(active).toHaveLength(1);
      expect(active[0].config.id).toBe('p1');
    });

    it('should return plugins by state', async () => {
      manager.register(makePlugin({ id: 'p1' }));
      await manager.install('p1');
      await manager.disable('p1');

      const disabled = manager.getByState(PluginLifecycleState.Disabled);
      expect(disabled).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should transition to Error state when install hook throws', async () => {
      const plugin = makePlugin({
        hooks: { onInstall: () => Promise.reject(new Error('install failed')) },
      });
      manager.register(plugin);

      await expect(manager.install(plugin.id)).rejects.toThrow('install failed');

      const instance = manager.get(plugin.id);
      expect(instance?.state).toBe(PluginLifecycleState.Error);
      expect(instance?.lastError?.message).toBe('install failed');
    });
  });

  describe('installAll', () => {
    it('should install all registered plugins in dependency order', async () => {
      const mgr = new PluginManager({
        autoInstall: false,
        autoEnable: false,
        sdkVersion: '2.0.0',
      });

      mgr.register(makePlugin({ id: 'util' }));
      mgr.register(
        makePlugin({
          id: 'lib',
          dependencies: [{ pluginId: 'util' }],
        }),
      );
      mgr.register(
        makePlugin({
          id: 'app',
          dependencies: [{ pluginId: 'lib' }],
        }),
      );

      await mgr.installAll();

      expect(mgr.get('util')?.state).toBe(PluginLifecycleState.Installed);
      expect(mgr.get('lib')?.state).toBe(PluginLifecycleState.Installed);
      expect(mgr.get('app')?.state).toBe(PluginLifecycleState.Installed);
    });
  });
});

// ─── Plugin Registry Tests ────────────────────────────────────────────

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
    return {
      id: 'com.test.plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      compatibility: { minSDKVersion: '1.0.0' },
      ...overrides,
    };
  }

  it('should register a manifest', () => {
    const manifest = makeManifest();
    registry.register(manifest, './plugins/test.ts');
    expect(registry.has(manifest.id)).toBe(true);
  });

  it('should throw on duplicate registration', () => {
    const manifest = makeManifest();
    registry.register(manifest, './plugins/test.ts');
    expect(() => registry.register(manifest, './plugins/test2.ts')).toThrow(
      'already registered',
    );
  });

  it('should unregister a manifest', () => {
    const manifest = makeManifest();
    registry.register(manifest, './plugins/test.ts');
    registry.unregister(manifest.id);
    expect(registry.has(manifest.id)).toBe(false);
  });

  it('should not unregister a manifest that is a dependency', () => {
    const dep = makeManifest({ id: 'dep' });
    const parent = makeManifest({
      id: 'parent',
      dependencies: [{ pluginId: 'dep' }],
    });

    registry.register(dep, './dep.ts');
    registry.register(parent, './parent.ts');

    expect(() => registry.unregister('dep')).toThrow('dependency of');
  });

  it('should resolve dependencies recursively', () => {
    const util = makeManifest({ id: 'util' });
    const lib = makeManifest({
      id: 'lib',
      dependencies: [{ pluginId: 'util' }],
    });
    const app = makeManifest({
      id: 'app',
      dependencies: [{ pluginId: 'lib' }],
    });

    registry.register(util, './util.ts');
    registry.register(lib, './lib.ts');
    registry.register(app, './app.ts');

    const resolved = registry.resolveDependencies('app');
    const ids = resolved.map((m) => m.id);

    // util before lib before app
    expect(ids.indexOf('util')).toBeLessThan(ids.indexOf('lib'));
    expect(ids.indexOf('lib')).toBeLessThan(ids.indexOf('app'));
    expect(ids).toContain('app');
  });

  it('should search by keyword', () => {
    registry.register(
      makeManifest({
        id: 'analytics',
        name: 'Analytics Plugin',
        keywords: ['analytics', 'telemetry'],
      }),
      './analytics.ts',
    );
    registry.register(
      makeManifest({
        id: 'auth',
        name: 'Auth Plugin',
        keywords: ['authentication', 'oauth'],
      }),
      './auth.ts',
    );

    const results = registry.search('telemetry');
    expect(results).toHaveLength(1);
    expect(results[0].manifest.id).toBe('analytics');
  });

  it('should search by name substring', () => {
    registry.register(
      makeManifest({ id: 'p1', name: 'Super Logger' }),
      './logger.ts',
    );
    registry.register(
      makeManifest({ id: 'p2', name: 'Auth Helper' }),
      './auth.ts',
    );

    expect(registry.search('log')).toHaveLength(1);
    expect(registry.search('super')).toHaveLength(1);
  });

  it('should mark plugins as loaded/unloaded', () => {
    const manifest = makeManifest();
    registry.register(manifest, './test.ts');

    registry.markLoaded(manifest.id);
    expect(registry.get(manifest.id)?.loaded).toBe(true);

    registry.markUnloaded(manifest.id);
    expect(registry.get(manifest.id)?.loaded).toBe(false);
  });
});
