import { Networks } from '@stellar/stellar-sdk';
import { EnvironmentManager } from '../src/network/environmentManager';
import {
  ENVIRONMENT_PRESETS,
  buildEnvironmentConfig,
  getPresetEnvironments,
  getPresetEnvironment,
} from '../src/network/environmentPresets';
import {
  getDefaultRpcUrl,
  getNetworkPassphrase,
  LOCAL_NETWORK_PASSPHRASE,
  resolveNetworkConfig,
} from '../src/utils/networkConfig';
import type {
  EnvironmentConfig,
  EnvironmentOptions,
  EnvironmentTier,
} from '../src/types/environment';

// ── Helpers ──────────────────────────────────────────────────────

function makeManager(loadPresets = true): EnvironmentManager {
  return new EnvironmentManager(loadPresets);
}

// ── Environment Presets ──────────────────────────────────────────

describe('Environment Presets', () => {
  test('all four canonical tiers are registered', () => {
    const presets = getPresetEnvironments();
    const tiers = presets.map((p) => p.tier).sort();
    expect(tiers).toEqual(['futurenet', 'local', 'mainnet', 'testnet']);
  });

  test('getPresetEnvironment returns correct config per tier', () => {
    const local = getPresetEnvironment('local');
    expect(local.network).toBe('local');
    expect(local.networkPassphrase).toBe(LOCAL_NETWORK_PASSPHRASE);
    expect(local.rpcUrl).toBe('http://localhost:8000/soroban/rpc');
    expect(local.allowHttp).toBe(true);

    const testnet = getPresetEnvironment('testnet');
    expect(testnet.network).toBe('testnet');
    expect(testnet.networkPassphrase).toBe(Networks.TESTNET);
    expect(testnet.rpcUrl).toBe('https://soroban-testnet.stellar.org');

    const mainnet = getPresetEnvironment('mainnet');
    expect(mainnet.network).toBe('mainnet');
    expect(mainnet.networkPassphrase).toBe(Networks.PUBLIC);
    expect(mainnet.rpcUrl).toBe('https://soroban-mainnet.stellar.org');

    const futurenet = getPresetEnvironment('futurenet');
    expect(futurenet.network).toBe('futurenet');
    expect(futurenet.networkPassphrase).toBe(Networks.FUTURENET);
    expect(futurenet.rpcUrl).toBe('https://rpc-futurenet.stellar.org');
  });

  test('buildEnvironmentConfig applies overrides', () => {
    const custom = buildEnvironmentConfig('testnet', {
      id: 'my-testnet',
      name: 'My Custom Testnet',
      rpcUrl: 'https://custom-rpc.example.com',
      networkPassphrase: 'Custom Passphrase',
      horizonUrl: 'https://custom-horizon.example.com',
      faucetUrl: 'https://custom-faucet.example.com',
      description: 'A custom test network',
    });

    expect(custom.id).toBe('my-testnet');
    expect(custom.name).toBe('My Custom Testnet');
    expect(custom.rpcUrl).toBe('https://custom-rpc.example.com');
    expect(custom.networkPassphrase).toBe('Custom Passphrase');
    expect(custom.horizonUrl).toBe('https://custom-horizon.example.com');
    expect(custom.faucetUrl).toBe('https://custom-faucet.example.com');
    expect(custom.description).toBe('A custom test network');
    expect(custom.network).toBe('testnet');
  });
});

// ── EnvironmentManager: Registration ─────────────────────────────

describe('EnvironmentManager: Registration', () => {
  test('constructor loads presets by default', () => {
    const manager = makeManager();
    expect(manager.size()).toBe(4);
    expect(manager.has('local')).toBe(true);
    expect(manager.has('testnet')).toBe(true);
    expect(manager.has('futurenet')).toBe(true);
    expect(manager.has('mainnet')).toBe(true);
  });

  test('constructor can skip presets', () => {
    const manager = makeManager(false);
    expect(manager.size()).toBe(0);
  });

  test('register adds a new environment', () => {
    const manager = makeManager(false);
    const config = manager.register({ tier: 'testnet' });
    expect(config.id).toBe('testnet');
    expect(manager.has('testnet')).toBe(true);
    expect(manager.size()).toBe(1);
  });

  test('register with custom id', () => {
    const manager = makeManager(false);
    const config = manager.register({ tier: 'testnet', id: 'staging' });
    expect(config.id).toBe('staging');
    expect(manager.has('staging')).toBe(true);
    expect(manager.has('testnet')).toBe(false);
  });

  test('register overrides existing environment', () => {
    const manager = makeManager();
    const config = manager.register({
      tier: 'testnet',
      rpcUrl: 'https://override.example.com',
    });
    expect(config.rpcUrl).toBe('https://override.example.com');
    expect(manager.get('testnet')?.rpcUrl).toBe('https://override.example.com');
  });

  test('unregister removes an environment', () => {
    const manager = makeManager();
    expect(manager.unregister('futurenet')).toBe(true);
    expect(manager.has('futurenet')).toBe(false);
    expect(manager.size()).toBe(3);
  });

  test('unregister throws when environment is active', () => {
    const manager = makeManager();
    manager.switch('testnet');
    expect(() => manager.unregister('testnet')).toThrow(
      /Cannot unregister the currently active environment/,
    );
  });

  test('unregister returns false for unknown id', () => {
    const manager = makeManager();
    expect(manager.unregister('nonexistent')).toBe(false);
  });
});

// ── EnvironmentManager: Switching ─────────────────────────────────

describe('EnvironmentManager: Switching', () => {
  test('switch activates an environment', () => {
    const manager = makeManager();
    const result = manager.switch('testnet');
    expect(result.current).toBe('testnet');
    expect(result.previous).toBeNull();
    expect(result.config.network).toBe('testnet');
    expect(manager.getActiveId()).toBe('testnet');
  });

  test('switch returns previous environment id', () => {
    const manager = makeManager();
    manager.switch('testnet');
    const result = manager.switch('mainnet');
    expect(result.previous).toBe('testnet');
    expect(result.current).toBe('mainnet');
  });

  test('switch throws for unregistered environment', () => {
    const manager = makeManager(false);
    expect(() => manager.switch('nonexistent')).toThrow(
      /is not registered/,
    );
  });

  test('switch throws for invalid configuration', () => {
    const manager = makeManager(false);
    manager.register({ tier: 'mainnet', rpcUrl: '', networkPassphrase: '' });
    expect(() => manager.switch('mainnet')).toThrow(/validation failed/);
  });

  test('switch notifies listeners', () => {
    const manager = makeManager();
    const listener = jest.fn();
    manager.onChange(listener);
    manager.switch('local');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: null,
        current: 'local',
      }),
    );
  });

  test('onChange returns unsubscribe function', () => {
    const manager = makeManager();
    const listener = jest.fn();
    const unsubscribe = manager.onChange(listener);
    unsubscribe();
    manager.switch('testnet');
    expect(listener).not.toHaveBeenCalled();
  });

  test('clearListeners removes all listeners', () => {
    const manager = makeManager();
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    manager.onChange(listener1);
    manager.onChange(listener2);
    manager.clearListeners();
    manager.switch('testnet');
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  test('listener errors do not prevent other listeners', () => {
    const manager = makeManager();
    const badListener = jest.fn(() => {
      throw new Error('boom');
    });
    const goodListener = jest.fn();
    manager.onChange(badListener);
    manager.onChange(goodListener);
    manager.switch('testnet');
    expect(goodListener).toHaveBeenCalledTimes(1);
  });
});

// ── EnvironmentManager: Querying ──────────────────────────────────

describe('EnvironmentManager: Querying', () => {
  test('getActive returns null when no environment is active', () => {
    const manager = makeManager();
    expect(manager.getActive()).toBeNull();
    expect(manager.getActiveId()).toBeNull();
  });

  test('getActive returns active config after switch', () => {
    const manager = makeManager();
    manager.switch('futurenet');
    const active = manager.getActive();
    expect(active).not.toBeNull();
    expect(active!.network).toBe('futurenet');
  });

  test('get returns config by id', () => {
    const manager = makeManager();
    const config = manager.get('mainnet');
    expect(config).toBeDefined();
    expect(config!.tier).toBe('mainnet');
  });

  test('get returns undefined for unknown id', () => {
    const manager = makeManager();
    expect(manager.get('unknown')).toBeUndefined();
  });

  test('list returns all configs', () => {
    const manager = makeManager();
    expect(manager.list()).toHaveLength(4);
  });

  test('listIds returns all ids', () => {
    const manager = makeManager();
    const ids = manager.listIds().sort();
    expect(ids).toEqual(['futurenet', 'local', 'mainnet', 'testnet']);
  });

  test('listByTier filters by tier', () => {
    const manager = makeManager();
    // Register a second testnet environment
    manager.register({ tier: 'testnet', id: 'testnet-custom', rpcUrl: 'https://custom.example.com' });

    const testnets = manager.listByTier('testnet');
    expect(testnets).toHaveLength(2);
    expect(testnets.every((e) => e.tier === 'testnet')).toBe(true);

    const locals = manager.listByTier('local');
    expect(locals).toHaveLength(1);
  });
});

// ── EnvironmentManager: Validation ────────────────────────────────

describe('EnvironmentManager: Validation', () => {
  test('validate returns valid for a preset', () => {
    const manager = makeManager();
    const result = manager.validate('testnet');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('validate returns invalid for missing RPC URL', () => {
    const manager = makeManager(false);
    manager.register({ tier: 'testnet', rpcUrl: '' });
    const result = manager.validate('testnet');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'rpcUrl')).toBe(true);
  });

  test('validate returns invalid for RPC URL without protocol', () => {
    const manager = makeManager(false);
    manager.register({ tier: 'testnet', rpcUrl: 'soroban-testnet.stellar.org' });
    const result = manager.validate('testnet');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'rpcUrl')).toBe(true);
  });

  test('validate returns invalid for missing passphrase', () => {
    const manager = makeManager(false);
    manager.register({ tier: 'testnet', networkPassphrase: '' });
    const result = manager.validate('testnet');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'networkPassphrase')).toBe(true);
  });

  test('validate rejects HTTP on mainnet', () => {
    const manager = makeManager(false);
    manager.register({
      tier: 'mainnet',
      rpcUrl: 'http://soroban-mainnet.stellar.org',
      networkPassphrase: Networks.PUBLIC,
      allowHttp: false,
    });
    const result = manager.validate('mainnet');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'rpcUrl' && i.message.includes('HTTPS'))).toBe(true);
  });

  test('validate allows HTTP on mainnet when explicitly allowed', () => {
    const manager = makeManager(false);
    manager.register({
      tier: 'mainnet',
      rpcUrl: 'http://soroban-mainnet.stellar.org',
      networkPassphrase: Networks.PUBLIC,
      allowHttp: true,
    });
    const result = manager.validate('mainnet');
    expect(result.valid).toBe(true);
  });

  test('validate rejects invalid tier', () => {
    const manager = makeManager(false);
    // Bypass type safety to inject an invalid tier
    manager.register({
      tier: 'invalid' as EnvironmentTier,
      rpcUrl: 'https://example.com',
      networkPassphrase: 'test',
    });
    const result = manager.validate('invalid');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'tier')).toBe(true);
  });

  test('validate returns invalid for unregistered id', () => {
    const manager = makeManager(false);
    const result = manager.validate('nonexistent');
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain('not registered');
  });

  test('validateAll returns results for all environments', () => {
    const manager = makeManager();
    const results = manager.validateAll();
    expect(results.size).toBe(4);
    for (const [, result] of results) {
      expect(result.valid).toBe(true);
    }
  });
});

// ── EnvironmentManager: Edge Cases ────────────────────────────────

describe('EnvironmentManager: Edge Cases', () => {
  test('switching to the same environment works', () => {
    const manager = makeManager();
    manager.switch('testnet');
    const result = manager.switch('testnet');
    expect(result.previous).toBe('testnet');
    expect(result.current).toBe('testnet');
  });

  test('multiple switches fire listeners each time', () => {
    const manager = makeManager();
    const listener = jest.fn();
    manager.onChange(listener);
    manager.switch('local');
    manager.switch('testnet');
    manager.switch('mainnet');
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[0][0].current).toBe('local');
    expect(listener.mock.calls[1][0].current).toBe('testnet');
    expect(listener.mock.calls[2][0].current).toBe('mainnet');
  });

  test('register with full metadata preserves all fields', () => {
    const manager = makeManager(false);
    const config = manager.register({
      tier: 'testnet',
      id: 'full-env',
      name: 'Full Environment',
      rpcUrl: 'https://rpc.example.com',
      networkPassphrase: 'Test SDF Network ; September 2015',
      horizonUrl: 'https://horizon.example.com',
      faucetUrl: 'https://faucet.example.com',
      allowHttp: false,
      description: 'A fully-configured test environment',
      metadata: { region: 'us-east-1', owner: 'platform-team' },
    });

    expect(config.metadata).toEqual({ region: 'us-east-1', owner: 'platform-team' });
    expect(config.description).toBe('A fully-configured test environment');
    expect(config.horizonUrl).toBe('https://horizon.example.com');
    expect(config.faucetUrl).toBe('https://faucet.example.com');
  });

  test('size tracks registration and unregistration', () => {
    const manager = makeManager(false);
    expect(manager.size()).toBe(0);

    manager.register({ tier: 'local' });
    expect(manager.size()).toBe(1);

    manager.register({ tier: 'testnet', id: 'staging' });
    expect(manager.size()).toBe(2);

    manager.unregister('local');
    expect(manager.size()).toBe(1);

    manager.unregister('staging');
    expect(manager.size()).toBe(0);
  });
});

// ── Network Config (extended) ─────────────────────────────────────

describe('networkConfig with local support', () => {
  test('getNetworkPassphrase returns local passphrase', () => {
    expect(getNetworkPassphrase('local')).toBe(LOCAL_NETWORK_PASSPHRASE);
  });

  test('getDefaultRpcUrl returns local RPC URL', () => {
    expect(getDefaultRpcUrl('local')).toBe('http://localhost:8000/soroban/rpc');
  });

  test('resolveNetworkConfig works with local', () => {
    expect(resolveNetworkConfig({ network: 'local' })).toEqual({
      network: 'local',
      rpcUrl: 'http://localhost:8000/soroban/rpc',
      networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
    });
  });

  test('resolveNetworkConfig still works with testnet', () => {
    expect(resolveNetworkConfig({ network: 'testnet' })).toEqual({
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
    });
  });

  test('resolveNetworkConfig still works with mainnet', () => {
    expect(resolveNetworkConfig({ network: 'mainnet' })).toEqual({
      network: 'mainnet',
      rpcUrl: 'https://soroban-mainnet.stellar.org',
      networkPassphrase: Networks.PUBLIC,
    });
  });

  test('resolveNetworkConfig still works with futurenet', () => {
    expect(resolveNetworkConfig({ network: 'futurenet' })).toEqual({
      network: 'futurenet',
      rpcUrl: 'https://rpc-futurenet.stellar.org',
      networkPassphrase: Networks.FUTURENET,
    });
  });

  test('resolveNetworkConfig defaults to testnet when no network specified', () => {
    expect(resolveNetworkConfig()).toEqual({
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
    });
  });

  test('resolveNetworkConfig with overrides for local', () => {
    expect(
      resolveNetworkConfig({
        network: 'local',
        rpcUrl: 'http://localhost:8001/soroban/rpc',
        networkPassphrase: 'My Local Network ; February 2017',
      }),
    ).toEqual({
      network: 'local',
      rpcUrl: 'http://localhost:8001/soroban/rpc',
      networkPassphrase: 'My Local Network ; February 2017',
    });
  });
});
