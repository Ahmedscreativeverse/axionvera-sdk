import { VaultContract } from '../../packages/core/src/client/VaultContract';
import { StellarClient } from '../../packages/core/src/client/stellarClient';
import { WalletConnector } from '../../packages/core/src/wallet/walletConnector';

// Mock dependencies
jest.mock('../../packages/core/src/client/stellarClient');
jest.mock('@stellar/stellar-sdk', () => ({
  Address: jest.fn().mockImplementation((address) => ({
    toScVal: jest.fn().mockReturnValue({ type: 'address', value: address })
  })),
  scValToNative: jest.fn().mockImplementation((val) => {
    if (typeof val === 'object' && val.type === 'bigint') {
      return BigInt(val.value);
    }
    return val;
  })
}));

describe('VaultContract', () => {
  let mockClient: jest.Mocked<StellarClient>;
  let mockWallet: jest.Mocked<WalletConnector>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new StellarClient({ network: 'testnet' }) as jest.Mocked<StellarClient>;
    mockWallet = {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn()
    } as any;
  });

  describe('constructor', () => {
    it('should create an instance with default method names', () => {
      const vault = new VaultContract({
        client: mockClient,
        contractId: 'test-contract-id'
      });

      expect(vault.contractId).toBe('test-contract-id');
    });

    it('should use custom method names if provided', () => {
      const vault = new VaultContract({
        client: mockClient,
        contractId: 'test-contract-id',
        methodNames: {
          getVaultShares: 'custom_get_shares',
          getExchangeRate: 'custom_get_rate'
        }
      });

      expect(vault.contractId).toBe('test-contract-id');
    });
  });

  describe('getVaultShares', () => {
    it('should query shares using provided account address', async () => {
      const mockShares = 1000n;
      (mockClient.simulateRead as jest.Mock).mockResolvedValueOnce({
        type: 'bigint',
        value: mockShares
      });

      const vault = new VaultContract({
        client: mockClient,
        contractId: 'test-contract-id'
      });

      const result = await vault.getVaultShares({ account: 'GABC123' });

      expect(mockClient.simulateRead).toHaveBeenCalledWith(
        'test-contract-id',
        'get_shares',
        expect.any(Array)
      );
      expect(result).toBe(mockShares.toString());
    });

    it('should query shares using wallet public key if no account provided', async () => {
      const mockPublicKey = 'GDEF456';
      const mockShares = 500n;
      (mockWallet.getPublicKey as jest.Mock).mockResolvedValueOnce(mockPublicKey);
      (mockClient.simulateRead as jest.Mock).mockResolvedValueOnce({
        type: 'bigint',
        value: mockShares
      });

      const vault = new VaultContract({
        client: mockClient,
        contractId: 'test-contract-id',
        wallet: mockWallet
      });

      const result = await vault.getVaultShares();

      expect(mockWallet.getPublicKey).toHaveBeenCalled();
      expect(mockClient.simulateRead).toHaveBeenCalledWith(
        'test-contract-id',
        'get_shares',
        expect.any(Array)
      );
      expect(result).toBe(mockShares.toString());
    });
  });

  describe('getExchangeRate', () => {
    it('should query the exchange rate', async () => {
      const mockRate = 150n;
      (mockClient.simulateRead as jest.Mock).mockResolvedValueOnce({
        type: 'bigint',
        value: mockRate
      });

      const vault = new VaultContract({
        client: mockClient,
        contractId: 'test-contract-id'
      });

      const result = await vault.getExchangeRate();

      expect(mockClient.simulateRead).toHaveBeenCalledWith(
        'test-contract-id',
        'get_exchange_rate',
        []
      );
      expect(result).toBe(mockRate.toString());
    });
  });
});
