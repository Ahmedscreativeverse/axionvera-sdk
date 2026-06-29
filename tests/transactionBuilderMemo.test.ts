import { Account, Keypair, Networks } from '@stellar/stellar-sdk';
import {
  buildContractCallTransaction,
  ContractCallBuilder,
  toMemo,
  type TransactionMemo,
} from '../src/utils/transactionBuilder';

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const HASH_HEX = 'a'.repeat(64); // 32 bytes

describe('transaction memo support', () => {
  const account = () => new Account(Keypair.random().publicKey(), '1');

  test('toMemo maps each typed memo to the right Memo kind', () => {
    expect(toMemo({ type: 'text', value: 'order-42' }).type).toBe('text');
    expect(toMemo({ type: 'id', value: '12345' }).type).toBe('id');
    expect(toMemo({ type: 'hash', value: HASH_HEX }).type).toBe('hash');
    expect(toMemo({ type: 'return', value: HASH_HEX }).type).toBe('return');
  });

  test('buildContractCallTransaction attaches a text memo', () => {
    const tx = buildContractCallTransaction({
      sourceAccount: account(),
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ID,
      method: 'deposit',
      args: [1000n],
      memo: { type: 'text', value: 'order-42' },
    });
    expect(tx.memo.type).toBe('text');
    expect(tx.memo.value?.toString()).toBe('order-42');
  });

  test('buildContractCallTransaction attaches an id memo', () => {
    const tx = buildContractCallTransaction({
      sourceAccount: account(),
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ID,
      method: 'deposit',
      memo: { type: 'id', value: '99' },
    });
    expect(tx.memo.type).toBe('id');
  });

  test('omitting memo yields a none memo (unchanged default behaviour)', () => {
    const tx = buildContractCallTransaction({
      sourceAccount: account(),
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ID,
      method: 'deposit',
    });
    expect(tx.memo.type).toBe('none');
  });

  test('ContractCallBuilder.setMemo chains and applies the memo', () => {
    const memo: TransactionMemo = { type: 'text', value: 'hello' };
    const tx = new ContractCallBuilder()
      .setContract(CONTRACT_ID)
      .setMethod('deposit')
      .setArgs([1n])
      .setMemo(memo)
      .build(account(), Networks.TESTNET);
    expect(tx.memo.type).toBe('text');
    expect(tx.memo.value?.toString()).toBe('hello');
  });
});
