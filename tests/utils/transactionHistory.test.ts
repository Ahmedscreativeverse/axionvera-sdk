import {
  parseTransaction,
  filterByActionType,
  sortByTimestamp,
  TransactionHistoryEntry,
  TransactionActionType,
} from '../../src/utils/transactionHistory';

describe('transactionHistory', () => {
  describe('parseTransaction', () => {
    it('should parse a transaction with deposit operation', () => {
      const tx = {
        hash: 'tx123',
        created_at: '2024-01-01T00:00:00Z',
        successful: true,
        operations: [
          {
            name: 'deposit',
            args: [BigInt(1000)],
            contract_id: 'contract123',
          },
        ],
      };

      const result = parseTransaction(tx);

      expect(result.hash).toBe('tx123');
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
      expect(result.status).toBe('success');
      expect(result.action).toBe('vault_deposit');
      expect(result.amount).toBe(BigInt(1000));
      expect(result.contractId).toBe('contract123');
      expect(result.raw).toEqual(tx);
    });

    it('should parse a transaction with withdraw operation', () => {
      const tx = {
        hash: 'tx456',
        created_at: '2024-01-02T00:00:00Z',
        successful: false,
        operations: [
          {
            name: 'withdraw',
            args: [500],
            contractId: 'contract456',
          },
        ],
      };

      const result = parseTransaction(tx);

      expect(result.action).toBe('vault_withdraw');
      expect(result.amount).toBe(BigInt(500));
      expect(result.contractId).toBe('contract456');
      expect(result.status).toBe('failed');
    });

    it('should parse a transaction with claim rewards operation', () => {
      const tx = {
        hash: 'tx789',
        status: 'NOT_FOUND',
        operations: [
          {
            name: 'claim_rewards',
          },
        ],
      };

      const result = parseTransaction(tx);

      expect(result.action).toBe('claim_rewards');
      expect(result.status).toBe('pending');
    });

    it('should handle unknown action types', () => {
      const tx = {
        hash: 'tx000',
        operations: [
          {
            name: 'random_action',
          },
        ],
      };

      const result = parseTransaction(tx);

      expect(result.action).toBe('unknown');
    });

    it('should handle transactions without operations', () => {
      const tx = {
        hash: 'tx111',
      };

      const result = parseTransaction(tx);

      expect(result.action).toBe('unknown');
    });
  });

  describe('filterByActionType', () => {
    const transactions: TransactionHistoryEntry[] = [
      { hash: '1', action: 'vault_deposit', timestamp: '', status: 'success', raw: {} },
      { hash: '2', action: 'vault_withdraw', timestamp: '', status: 'success', raw: {} },
      { hash: '3', action: 'claim_rewards', timestamp: '', status: 'success', raw: {} },
      { hash: '4', action: 'unknown', timestamp: '', status: 'success', raw: {} },
    ];

    it('should filter by vault_deposit', () => {
      const result = filterByActionType(transactions, 'vault_deposit');
      expect(result).toEqual([transactions[0]]);
    });

    it('should return all transactions when filtering by unknown', () => {
      const result = filterByActionType(transactions, 'unknown');
      expect(result).toEqual(transactions);
    });
  });

  describe('sortByTimestamp', () => {
    it('should sort transactions in reverse chronological order', () => {
      const transactions: TransactionHistoryEntry[] = [
        { hash: '1', timestamp: '2024-01-01T00:00:00Z', action: 'unknown', status: 'success', raw: {} },
        { hash: '3', timestamp: '2024-01-03T00:00:00Z', action: 'unknown', status: 'success', raw: {} },
        { hash: '2', timestamp: '2024-01-02T00:00:00Z', action: 'unknown', status: 'success', raw: {} },
      ];

      const sorted = sortByTimestamp(transactions);

      expect(sorted.map(tx => tx.hash)).toEqual(['3', '2', '1']);
    });
  });
});
