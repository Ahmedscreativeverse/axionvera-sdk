import { CapabilityDetector, capabilityDetector } from '../../src/capabilities';
import { VaultABI } from '../../src/contracts/abis/VaultABI';
import { VaultContractDescriptor } from '../../src/discovery/defaultContracts';
import { ValidationError } from '../../src/errors/axionveraError';
import type { ContractDescriptor } from '../../src/discovery/types';

/**
 * A synthetic descriptor whose declared method names all exist in `VaultABI`,
 * used to exercise the fully-supported ("complete") path. The real
 * `VaultContractDescriptor` intentionally declares `getBalance`/`getAssetsBalance`,
 * which the ABI does not expose, so detection reports a genuine mismatch.
 */
const matchingDescriptor: ContractDescriptor = {
  type: 'vault-matching',
  displayName: 'Matching Vault',
  version: '1.0.0',
  capabilities: ['shares:convert', 'assets:deposit', 'assets:withdraw', 'rewards:claim'],
  methods: [
    {
      name: 'convertToAssets',
      capability: 'shares:convert',
      mutability: 'view',
      description: 'Convert shares to assets.',
    },
    {
      name: 'convertToShares',
      capability: 'shares:convert',
      mutability: 'view',
      description: 'Convert assets to shares.',
    },
    {
      name: 'deposit',
      capability: 'assets:deposit',
      mutability: 'payable',
      description: 'Deposit assets.',
    },
    {
      name: 'withdraw',
      capability: 'assets:withdraw',
      mutability: 'nonpayable',
      description: 'Withdraw assets.',
    },
    {
      name: 'claimRewards',
      capability: 'rewards:claim',
      mutability: 'nonpayable',
      description: 'Claim rewards.',
    },
  ],
};

describe('CapabilityDetector', () => {
  let detector: CapabilityDetector;

  beforeEach(() => {
    detector = new CapabilityDetector();
  });

  describe('detection from a full ABI', () => {
    it('reports the genuine descriptor/ABI mismatch for the real Vault', () => {
      const result = detector.detect(VaultContractDescriptor, VaultABI);

      // ABI-backed capabilities are supported...
      expect(result.supported).toEqual(
        expect.arrayContaining([
          'shares:convert',
          'assets:deposit',
          'assets:withdraw',
          'rewards:read',
          'rewards:claim',
        ])
      );
      // ...while descriptor methods absent from the ABI surface as missing.
      expect(result.missing).toEqual(expect.arrayContaining(['balance:read', 'assets:read']));
      expect(result.supported).not.toContain('balance:read');
      expect(result.supported).not.toContain('assets:read');
      expect(result.complete).toBe(false);
    });

    it('flags the specific declared methods absent from the ABI', () => {
      const result = detector.detect(VaultContractDescriptor, VaultABI);

      const absent = result.methods.filter((method) => !method.present).map((m) => m.name);
      expect(absent).toEqual(expect.arrayContaining(['getBalance', 'getAssetsBalance']));

      const present = result.methods.filter((method) => method.present).map((m) => m.name);
      expect(present).toEqual(
        expect.arrayContaining(['deposit', 'withdraw', 'convertToAssets', 'claimRewards'])
      );
    });

    it('reports ABI methods the descriptor never declared as undeclared', () => {
      const result = detector.detect(VaultContractDescriptor, VaultABI);

      expect(result.undeclaredMethods).toEqual(
        expect.arrayContaining(['totalAssets', 'totalSupply', 'balanceOf', 'apy', 'lockPeriod'])
      );
      // Declared-and-present methods are not reported as undeclared.
      expect(result.undeclaredMethods).not.toContain('deposit');
    });
  });

  describe('fully matching descriptor', () => {
    it('marks every declared capability supported and the result complete', () => {
      const result = detector.detect(matchingDescriptor, VaultABI);

      expect(result.complete).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.supported).toEqual(
        expect.arrayContaining([
          'shares:convert',
          'assets:deposit',
          'assets:withdraw',
          'rewards:claim',
        ])
      );
      expect(result.methods.every((method) => method.present)).toBe(true);
    });

    it('requires ALL defining methods of a capability to be present', () => {
      // Drop one of the two methods backing shares:convert from the ABI.
      const partialAbi = VaultABI.filter((entry) => entry.name !== 'convertToShares');

      const result = detector.detect(matchingDescriptor, partialAbi, { cacheKey: 'partial' });

      expect(result.supported).not.toContain('shares:convert');
      expect(result.missing).toContain('shares:convert');
      // The other defining method is still present in the matrix.
      const convertToAssets = result.methods.find((m) => m.name === 'convertToAssets');
      expect(convertToAssets?.present).toBe(true);
    });
  });

  describe('supports() adaptation gate', () => {
    it('returns true only for capabilities backed by the ABI', () => {
      expect(detector.supports(VaultContractDescriptor, VaultABI, 'assets:deposit')).toBe(true);
      expect(detector.supports(VaultContractDescriptor, VaultABI, 'balance:read')).toBe(false);
    });

    it('lets a caller adapt behaviour to detected capabilities', () => {
      const guarded = (capability: Parameters<typeof detector.supports>[2]): string =>
        detector.supports(VaultContractDescriptor, VaultABI, capability) ? 'call' : 'skip';

      expect(guarded('assets:deposit')).toBe('call');
      expect(guarded('balance:read')).toBe('skip');
    });
  });

  describe('caching', () => {
    it('clones results so callers cannot mutate the cache', () => {
      const first = detector.detect(VaultContractDescriptor, VaultABI);
      first.supported.push('rewards:read');
      first.methods[0].present = !first.methods[0].present;

      const second = detector.detect(VaultContractDescriptor, VaultABI);
      expect(second.supported.filter((c) => c === 'rewards:read')).toHaveLength(1);
    });

    it('reuses the cached result for identical inputs', () => {
      const reflection = {
        getMethods: jest.fn(() => [{ name: 'deposit' }]),
      } as unknown as import('../../src/reflection').ContractReflectionService;
      const cachedDetector = new CapabilityDetector(reflection);

      cachedDetector.detect(matchingDescriptor, VaultABI, { cacheKey: 'k' });
      cachedDetector.detect(matchingDescriptor, VaultABI, { cacheKey: 'k' });

      expect(reflection.getMethods).toHaveBeenCalledTimes(1);
    });

    it('rebuilds after clearCache()', () => {
      const reflection = {
        getMethods: jest.fn(() => [{ name: 'deposit' }]),
      } as unknown as import('../../src/reflection').ContractReflectionService;
      const cachedDetector = new CapabilityDetector(reflection);

      cachedDetector.detect(matchingDescriptor, VaultABI, { cacheKey: 'k' });
      cachedDetector.clearCache();
      cachedDetector.detect(matchingDescriptor, VaultABI, { cacheKey: 'k' });

      expect(reflection.getMethods).toHaveBeenCalledTimes(2);
    });
  });

  describe('validation', () => {
    it('throws a ValidationError for an invalid descriptor', () => {
      const invalid = { ...VaultContractDescriptor, capabilities: [], methods: [] };

      expect(() => detector.detect(invalid as ContractDescriptor, VaultABI)).toThrow(
        ValidationError
      );
    });

    it('skips validation when validate is false', () => {
      const invalid = { ...matchingDescriptor, version: '' };

      expect(() =>
        detector.detect(invalid as ContractDescriptor, VaultABI, { validate: false })
      ).not.toThrow();
    });

    it('throws a ValidationError for an unparseable ABI', () => {
      expect(() => detector.detect(matchingDescriptor, 'not a valid abi' as never)).toThrow(
        ValidationError
      );
    });
  });

  describe('shared singleton', () => {
    it('exposes a ready-to-use capabilityDetector instance', () => {
      expect(capabilityDetector).toBeInstanceOf(CapabilityDetector);
      expect(capabilityDetector.supports(VaultContractDescriptor, VaultABI, 'assets:deposit')).toBe(
        true
      );
    });
  });
});
