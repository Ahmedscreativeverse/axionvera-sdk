import { createStellarRpcClient, getDefaultClient } from '../../packages/core/src/client/stellarClientFactory';
import { StellarClient } from '../../packages/core/src/client/stellarClient';

// Mock StellarClient
jest.mock('../../packages/core/src/client/stellarClient');

describe('stellarClientFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStellarRpcClient', () => {
    it('should create and cache a new client', () => {
      const options = { network: 'testnet', rpcUrl: 'https://testnet.sorobanrpc.com' };
      
      const client1 = createStellarRpcClient(options);
      const client2 = createStellarRpcClient(options);
      
      expect(StellarClient).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });

    it('should create different clients for different options', () => {
      const options1 = { network: 'testnet', rpcUrl: 'https://testnet.sorobanrpc.com' };
      const options2 = { network: 'public', rpcUrl: 'https://sorobanrpc.com' };
      
      const client1 = createStellarRpcClient(options1);
      const client2 = createStellarRpcClient(options2);
      
      expect(StellarClient).toHaveBeenCalledTimes(2);
      expect(client1).not.toBe(client2);
    });
  });

  describe('getDefaultClient', () => {
    it('should return a client configured for testnet', () => {
      const client = getDefaultClient();
      
      expect(StellarClient).toHaveBeenCalledWith({ network: 'testnet' });
    });
  });
});
