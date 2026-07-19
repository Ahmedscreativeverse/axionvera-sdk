import { RpcEndpointManager } from '../../src/network/rpcEndpointManager';
import { RpcHealthMonitor } from '../../src/monitoring/rpcHealthMonitor';

const mockClient = () => ({ getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }) });
const failingClient = () => ({ getHealth: jest.fn().mockRejectedValue(new Error('down')) });

// Helpers that build a manager whose monitor state is fully controlled via spies.
function makeManager(
  overrides: Partial<ConstructorParameters<typeof RpcEndpointManager>[0]> = {},
  ids = ['a', 'b', 'c']
) {
  return new RpcEndpointManager({
    policy: 'round-robin',
    retryDelayMs: 0,
    endpoints: ids.map((id) => ({ id, url: `http://${id}`, rpcClient: mockClient() })),
    ...overrides,
  });
}

function spyHealth(
  manager: RpcEndpointManager,
  states: Record<string, { state: string; averageLatencyMs?: number }>
) {
  jest
    .spyOn((manager as any).monitor as RpcHealthMonitor, 'getEndpointStatus')
    .mockImplementation((id: string) => {
      const s = states[id];
      if (!s) return undefined;
      return {
        id,
        url: `http://${id}`,
        state: s.state as any,
        available: s.state !== 'unhealthy',
        metrics: {
          totalChecks: 1,
          successfulChecks: s.state !== 'unhealthy' ? 1 : 0,
          failedChecks: s.state === 'unhealthy' ? 1 : 0,
          consecutiveFailures: 0,
          averageLatencyMs: s.averageLatencyMs,
          availabilityPercentage: 100,
        },
      };
    });
}

describe('RpcEndpointManager', () => {
  it('round-robin cycles through healthy endpoints in order', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b', 'c']);

    expect(manager.getActiveEndpoint()?.id).toBe('a');
    expect(manager.getActiveEndpoint()?.id).toBe('b');
    expect(manager.getActiveEndpoint()?.id).toBe('c');
    expect(manager.getActiveEndpoint()?.id).toBe('a');
  });

  it('weighted policy skews selection toward higher-weight endpoints', () => {
    const manager = new RpcEndpointManager({
      policy: 'weighted',
      retryDelayMs: 0,
      endpoints: [
        { id: 'heavy', url: 'http://heavy', weight: 3, rpcClient: mockClient() },
        { id: 'light', url: 'http://light', weight: 1, rpcClient: mockClient() },
      ],
    });

    const counts: Record<string, number> = { heavy: 0, light: 0 };
    for (let i = 0; i < 100; i++) {
      const ep = manager.getActiveEndpoint();
      if (ep) counts[ep.id] = (counts[ep.id] ?? 0) + 1;
    }

    // Heavy should win ~75% of draws; accept anything above 55 to avoid flakiness.
    expect(counts.heavy).toBeGreaterThan(55);
    expect(counts.light).toBeGreaterThan(5);
  });

  it('least-latency picks the endpoint with lowest averageLatencyMs from health monitor', () => {
    const manager = makeManager({ policy: 'least-latency' }, ['a', 'b']);
    spyHealth(manager, {
      a: { state: 'healthy', averageLatencyMs: 300 },
      b: { state: 'healthy', averageLatencyMs: 50 },
    });

    expect(manager.getActiveEndpoint()?.id).toBe('b');
  });

  it('least-latency falls back to first available when no latency data exists', () => {
    const manager = makeManager({ policy: 'least-latency' }, ['x', 'y']);
    // No health checks run — averageLatencyMs is undefined for both.
    const ep = manager.getActiveEndpoint();
    expect(ep).not.toBeNull();
    expect(['x', 'y']).toContain(ep!.id);
  });

  it('primary-fallback picks lowest priority number first', () => {
    const manager = new RpcEndpointManager({
      policy: 'primary-fallback',
      retryDelayMs: 0,
      endpoints: [
        { id: 'secondary', url: 'http://secondary', priority: 2, rpcClient: mockClient() },
        { id: 'primary', url: 'http://primary', priority: 0, rpcClient: mockClient() },
        { id: 'tertiary', url: 'http://tertiary', priority: 5, rpcClient: mockClient() },
      ],
    });

    expect(manager.getActiveEndpoint()?.id).toBe('primary');
    expect(manager.getActiveEndpoint()?.id).toBe('primary');
  });

  it('unhealthy endpoints are excluded from selection', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b', 'c']);
    spyHealth(manager, {
      a: { state: 'unhealthy' },
      b: { state: 'healthy' },
      c: { state: 'degraded' },
    });

    for (let i = 0; i < 6; i++) {
      expect(manager.getActiveEndpoint()?.id).not.toBe('a');
    }
  });

  it('returns null when all endpoints are unhealthy', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b']);
    spyHealth(manager, {
      a: { state: 'unhealthy' },
      b: { state: 'unhealthy' },
    });

    expect(manager.getActiveEndpoint()).toBeNull();
  });

  it('execute() succeeds on first try', async () => {
    const manager = makeManager();
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await manager.execute(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('execute() retries on failure and succeeds on second endpoint', async () => {
    const manager = makeManager({ policy: 'round-robin', maxRetries: 2 }, ['a', 'b']);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('a is down'))
      .mockResolvedValueOnce('success');

    const result = await manager.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'http://a');
    expect(fn).toHaveBeenNthCalledWith(2, 'http://b');
  });

  it('execute() throws after maxRetries exhausted with all endpoints failing', async () => {
    const manager = makeManager({ maxRetries: 2 }, ['a', 'b', 'c']);
    const fn = jest.fn().mockRejectedValue(new Error('all down'));

    await expect(manager.execute(fn)).rejects.toThrow('all down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('disableEndpoint() removes endpoint from selection', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b', 'c']);
    manager.disableEndpoint('b');

    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) seen.add(manager.getActiveEndpoint()!.id);

    expect(seen.has('b')).toBe(false);
    expect(seen.has('a')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });

  it('enableEndpoint() restores a disabled endpoint to selection', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b']);
    manager.disableEndpoint('b');

    expect(manager.getActiveEndpoint()?.id).toBe('a');
    expect(manager.getActiveEndpoint()?.id).toBe('a');

    manager.enableEndpoint('b');
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) seen.add(manager.getActiveEndpoint()!.id);

    expect(seen.has('b')).toBe(true);
  });

  it('getStatus() returns merged health + policy info', () => {
    const manager = makeManager({ policy: 'weighted' }, ['a', 'b']);
    spyHealth(manager, {
      a: { state: 'healthy' },
      b: { state: 'degraded' },
    });

    const status = manager.getStatus();
    expect(status.policy).toBe('weighted');
    expect(status.endpoints).toHaveLength(2);
    expect(status.endpoints.find((e) => e.id === 'a')?.healthState).toBe('healthy');
    expect(status.endpoints.find((e) => e.id === 'b')?.healthState).toBe('degraded');
    expect(status.endpoints.every((e) => e.enabled)).toBe(true);
  });

  it('setPolicy() changes the active policy', () => {
    const manager = makeManager({ policy: 'round-robin' }, ['a', 'b', 'c']);
    manager.setPolicy('primary-fallback');
    // primary-fallback always returns the lowest priority (insertion order 0 = 'a')
    expect(manager.getActiveEndpoint()?.id).toBe('a');
    expect(manager.getActiveEndpoint()?.id).toBe('a');
  });

  it('start() and stop() delegate to the health monitor', () => {
    const manager = makeManager();
    const mon: RpcHealthMonitor = (manager as any).monitor;
    const startSpy = jest.spyOn(mon, 'start');
    const stopSpy = jest.spyOn(mon, 'stop');

    manager.start();
    manager.stop();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('healthCheck: false skips monitor creation and still routes requests', async () => {
    const manager = new RpcEndpointManager({
      healthCheck: false,
      retryDelayMs: 0,
      endpoints: [
        { id: 'a', url: 'http://a' },
        { id: 'b', url: 'http://b' },
      ],
    });

    manager.start(); // no-op
    manager.stop(); // no-op

    const ep = manager.getActiveEndpoint();
    expect(ep).not.toBeNull();

    const status = manager.getStatus();
    expect(status.endpoints[0].healthState).toBe('unknown');
    expect(status.endpoints[0].available).toBe(true);

    const fn = jest.fn().mockResolvedValue(42);
    await expect(manager.execute(fn)).resolves.toBe(42);
  });
});
