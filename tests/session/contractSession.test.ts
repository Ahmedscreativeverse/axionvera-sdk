import type { StellarClient } from "../../src/client/stellarClient";
import { ContractSession } from "../../src/session/contractSession";
import { ValidationError } from "../../src/errors/axionveraError";

const CONTRACT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CONTRACT_B = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

// The session classes only read `client.network` and hold the reference, so a
// lightweight stub keeps these unit tests hermetic (no RPC/logger dependencies).
const makeClient = () => ({ network: "testnet" } as unknown as StellarClient);

describe("ContractSession", () => {
  describe("construction", () => {
    test("requires a StellarClient", () => {
      expect(() => new ContractSession({} as any)).toThrow(ValidationError);
    });

    test("generates a unique id when none is provided", () => {
      const a = new ContractSession({ client: makeClient() });
      const b = new ContractSession({ client: makeClient() });
      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
      expect(a.id).not.toEqual(b.id);
    });

    test("accepts a custom id and starts active", () => {
      const session = new ContractSession({ client: makeClient(), id: "checkout" });
      expect(session.id).toBe("checkout");
      expect(session.status).toBe("active");
      expect(session.isActive).toBe(true);
      expect(session.network).toBe("testnet");
    });

    test("registers contracts supplied up-front", () => {
      const session = new ContractSession({
        client: makeClient(),
        contracts: [
          { name: "vault", contractId: CONTRACT_A },
          { name: "rewards", contractId: CONTRACT_B },
        ],
      });
      expect(session.size).toBe(2);
      expect(session.hasContract("vault")).toBe(true);
      expect(session.hasContract("rewards")).toBe(true);
    });
  });

  describe("contract registry", () => {
    let session: ContractSession;
    beforeEach(() => {
      session = new ContractSession({ client: makeClient() });
    });

    test("registers and retrieves a contract", () => {
      const ctx = session.registerContract({ name: "vault", contractId: CONTRACT_A });
      expect(ctx.name).toBe("vault");
      expect(ctx.contractId).toBe(CONTRACT_A);
      expect(session.getContract("vault").contractId).toBe(CONTRACT_A);
    });

    test("trims whitespace on name and id", () => {
      const ctx = session.registerContract({ name: "  vault  ", contractId: `  ${CONTRACT_A}  ` });
      expect(ctx.name).toBe("vault");
      expect(ctx.contractId).toBe(CONTRACT_A);
    });

    test("rejects empty name and empty id", () => {
      expect(() => session.registerContract({ name: "", contractId: CONTRACT_A })).toThrow(ValidationError);
      expect(() => session.registerContract({ name: "vault", contractId: "  " })).toThrow(ValidationError);
    });

    test("rejects duplicate names", () => {
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      expect(() => session.registerContract({ name: "vault", contractId: CONTRACT_B })).toThrow(
        /already registered/
      );
    });

    test("getContract throws for unknown name", () => {
      expect(() => session.getContract("missing")).toThrow(/No contract named/);
    });

    test("unregisterContract removes a contract and reports result", () => {
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      expect(session.unregisterContract("vault")).toBe(true);
      expect(session.unregisterContract("vault")).toBe(false);
      expect(session.hasContract("vault")).toBe(false);
    });

    test("attaches and retrieves a live contract instance", () => {
      const instance = { deposit: jest.fn() };
      session.registerContract({ name: "vault", contractId: CONTRACT_A, instance });
      expect(session.getContractInstance<typeof instance>("vault")).toBe(instance);
    });

    test("getContractInstance throws when no instance is attached", () => {
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      expect(() => session.getContractInstance("vault")).toThrow(/no instance attached/);
    });

    test("listContracts returns all registered contracts", () => {
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      session.registerContract({ name: "rewards", contractId: CONTRACT_B });
      const names = session.listContracts().map((c) => c.name).sort();
      expect(names).toEqual(["rewards", "vault"]);
    });
  });

  describe("lifecycle", () => {
    test("suspend blocks run() until resume", async () => {
      const session = new ContractSession({ client: makeClient() });
      session.suspend();
      expect(session.status).toBe("suspended");
      await expect(session.run(async () => "ok")).rejects.toThrow(/suspended/);

      session.resume();
      expect(session.status).toBe("active");
      await expect(session.run(async () => "ok")).resolves.toBe("ok");
    });

    test("run executes the callback with the session when active", async () => {
      const session = new ContractSession({ client: makeClient() });
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      const result = await session.run((s) => s.getContract("vault").contractId);
      expect(result).toBe(CONTRACT_A);
    });

    test("close is idempotent and clears contracts", () => {
      const session = new ContractSession({ client: makeClient() });
      session.registerContract({ name: "vault", contractId: CONTRACT_A });
      session.close();
      session.close();
      expect(session.status).toBe("closed");
      expect(session.isClosed).toBe(true);
      expect(session.size).toBe(0);
    });

    test("mutations and run throw after close", async () => {
      const session = new ContractSession({ client: makeClient() });
      session.close();
      expect(() => session.registerContract({ name: "vault", contractId: CONTRACT_A })).toThrow(/closed/);
      expect(() => session.suspend()).toThrow(/closed/);
      await expect(session.run(async () => "ok")).rejects.toThrow(/closed/);
    });

    test("validate throws only when closed", () => {
      const session = new ContractSession({ client: makeClient() });
      expect(() => session.validate()).not.toThrow();
      session.close();
      expect(() => session.validate()).toThrow(ValidationError);
    });
  });

  describe("toJSON", () => {
    test("produces a serializable snapshot without live resources", () => {
      const session = new ContractSession({
        client: makeClient(),
        id: "snap",
        metadata: { purpose: "test" },
        contracts: [{ name: "vault", contractId: CONTRACT_A, metadata: { tag: "primary" } }],
      });

      const snapshot = session.toJSON();
      expect(snapshot.id).toBe("snap");
      expect(snapshot.status).toBe("active");
      expect(snapshot.network).toBe("testnet");
      expect(snapshot.hasWallet).toBe(false);
      expect(snapshot.metadata).toEqual({ purpose: "test" });
      expect(snapshot.contracts).toEqual([
        expect.objectContaining({ name: "vault", contractId: CONTRACT_A, metadata: { tag: "primary" } }),
      ]);
      // Snapshot must be JSON-serializable (no client/wallet references).
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    });
  });
});
