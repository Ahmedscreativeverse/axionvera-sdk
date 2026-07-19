import { Keypair, StrKey } from "@stellar/stellar-sdk";

import { VaultContract, StellarClient, setupMswTest, overrideHandlers, rest } from "../src/index";

describe("VaultContract", () => {
  // Setup MSW to intercept network requests at the HTTP level
  setupMswTest();

  test("builds, simulates, prepares, signs, and submits a deposit transaction", async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();

    // Use a real client instance; MSW will catch the RPC calls
    const client = new StellarClient({ network: "testnet" });

    const wallet = {
      getPublicKey: jest.fn().mockResolvedValue(publicKey),
      signTransaction: jest.fn().mockImplementation(async (xdr: string) => xdr)
    };

    // Mock the submission response via MSW
    overrideHandlers(
      rest.post('https://soroban-testnet.stellar.org/transactions', (_req, res, ctx) => {
        return res(ctx.json({ hash: "abc", status: "PENDING" }));
      })
    );

    const vault = new VaultContract({
      client,
      contractId: StrKey.encodeContract(Buffer.alloc(32)),
      wallet: wallet as any
    });

    await expect(vault.deposit({ amount: 1_000n })).resolves.toEqual({
      hash: "abc",
      status: "PENDING",
      raw: expect.any(Object)
    });
  });

  test("simulates and decodes getBalance", async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();

    const client = new StellarClient({ network: "testnet" });

    // Mock the simulation result for getBalance
    overrideHandlers(
      rest.post('https://soroban-testnet.stellar.org/simulate_transaction', (_req, res, ctx) => {
        return res(ctx.json({ result: {} }));
      })
    );

    const vault = new VaultContract({
      client,
      contractId: StrKey.encodeContract(Buffer.alloc(32))
    });

    await expect(vault.getBalance({ account: publicKey })).resolves.toBeNull();
  });

  test("throws when wallet is missing for deposit", async () => {
    const client = new StellarClient({ network: "testnet" });

    const vault = new VaultContract({
      client,
      contractId: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef"
    });

    await expect(vault.deposit({ amount: 1000n })).rejects.toThrow(
      /wallet connector is required for signing transactions/
    );
  });

  test("throws when no account and no wallet on getBalance", async () => {
    const client = new StellarClient({ network: "testnet" });

    const vault = new VaultContract({
      client,
      contractId: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef"
    });

    await expect(vault.getBalance({} as any)).rejects.toThrow(
      /account is required when no wallet connector is provided/
    );
  });

  test("simulated contract call failure propagates in getBalance", async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();

    const client = new StellarClient({ network: "testnet" });

    overrideHandlers(
      rest.post('https://soroban-testnet.stellar.org/simulate_transaction', (_req, res, ctx) => {
        return res(ctx.json({ error: "Sim failed" }));
      })
    );

    const vault = new VaultContract({
      client,
      contractId: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef"
    });

    await expect(vault.getBalance({ account: publicKey })).rejects.toThrow(/Simulation failed/);
  });
});
