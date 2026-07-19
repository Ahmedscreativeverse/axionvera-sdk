import type { StellarClient } from "../../src/client/stellarClient";
import type { WalletConnector } from "../../src/wallet/walletConnector";
import { SessionManager } from "../../src/session/sessionManager";
import { ContractSession } from "../../src/session/contractSession";
import { ValidationError } from "../../src/errors/axionveraError";

const CONTRACT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CONTRACT_B = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

// The session classes only read `client.network` and hold the reference, so a
// lightweight stub keeps these unit tests hermetic (no RPC/logger dependencies).
const makeClient = () => ({ network: "testnet" } as unknown as StellarClient);

describe("SessionManager", () => {
  describe("construction", () => {
    test("rejects a non-positive maxSessions", () => {
      expect(() => new SessionManager({ maxSessions: 0 })).toThrow(ValidationError);
    });
  });

  describe("createSession", () => {
    test("creates a session using the manager's default client", () => {
      const manager = new SessionManager({ client: makeClient() });
      const session = manager.createSession();
      expect(session).toBeInstanceOf(ContractSession);
      expect(manager.size).toBe(1);
      expect(manager.hasSession(session.id)).toBe(true);
    });

    test("throws when no client is available", () => {
      const manager = new SessionManager();
      expect(() => manager.createSession()).toThrow(/No StellarClient provided/);
    });

    test("a per-session client overrides the default", () => {
      const manager = new SessionManager({ client: makeClient() });
      const ownClient = makeClient();
      const session = manager.createSession({ client: ownClient });
      expect(session.client).toBe(ownClient);
    });

    test("shares a single default client across sessions", () => {
      const shared = makeClient();
      const manager = new SessionManager({ client: shared });
      const a = manager.createSession();
      const b = manager.createSession();
      expect(a.client).toBe(shared);
      expect(b.client).toBe(shared);
    });

    test("registers up-front contracts via config", () => {
      const manager = new SessionManager({ client: makeClient() });
      const session = manager.createSession({
        contracts: [
          { name: "vault", contractId: CONTRACT_A },
          { name: "rewards", contractId: CONTRACT_B },
        ],
      });
      expect(session.size).toBe(2);
    });

    test("rejects a duplicate explicit id", () => {
      const manager = new SessionManager({ client: makeClient() });
      manager.createSession({ id: "dup" });
      expect(() => manager.createSession({ id: "dup" })).toThrow(/already exists/);
    });

    test("enforces maxSessions", () => {
      const manager = new SessionManager({ client: makeClient(), maxSessions: 1 });
      manager.createSession();
      expect(() => manager.createSession()).toThrow(/maximum of 1/);
    });
  });

  describe("lookup", () => {
    test("getSession throws for an unknown id; tryGetSession returns undefined", () => {
      const manager = new SessionManager({ client: makeClient() });
      expect(() => manager.getSession("nope")).toThrow(/No session found/);
      expect(manager.tryGetSession("nope")).toBeUndefined();
    });

    test("listSessions returns all open sessions", () => {
      const manager = new SessionManager({ client: makeClient() });
      manager.createSession({ id: "a" });
      manager.createSession({ id: "b" });
      expect(manager.listSessions().map((s) => s.id).sort()).toEqual(["a", "b"]);
    });

    test("findByContract returns sessions referencing a contract id", () => {
      const manager = new SessionManager({ client: makeClient() });
      const a = manager.createSession({ id: "a", contracts: [{ name: "vault", contractId: CONTRACT_A }] });
      manager.createSession({ id: "b", contracts: [{ name: "vault", contractId: CONTRACT_B }] });

      const matches = manager.findByContract(CONTRACT_A);
      expect(matches.map((s) => s.id)).toEqual([a.id]);
    });
  });

  describe("lifecycle", () => {
    test("closeSession closes and removes the session", () => {
      const manager = new SessionManager({ client: makeClient() });
      const session = manager.createSession();
      expect(manager.closeSession(session.id)).toBe(true);
      expect(session.status).toBe("closed");
      expect(manager.hasSession(session.id)).toBe(false);
      expect(manager.closeSession(session.id)).toBe(false);
    });

    test("closeAll closes and removes every session", () => {
      const manager = new SessionManager({ client: makeClient() });
      const a = manager.createSession();
      const b = manager.createSession();
      manager.closeAll();
      expect(manager.size).toBe(0);
      expect(a.status).toBe("closed");
      expect(b.status).toBe("closed");
    });

    test("closing one session frees a slot under maxSessions", () => {
      const manager = new SessionManager({ client: makeClient(), maxSessions: 1 });
      const first = manager.createSession();
      manager.closeSession(first.id);
      expect(() => manager.createSession()).not.toThrow();
    });
  });

  describe("default wallet", () => {
    test("sessions inherit the manager's default wallet", () => {
      const wallet: WalletConnector = {
        getPublicKey: jest.fn(),
        signTransaction: jest.fn(),
      };
      const manager = new SessionManager({ client: makeClient(), wallet });
      const session = manager.createSession();
      expect(session.wallet).toBe(wallet);
    });
  });
});
