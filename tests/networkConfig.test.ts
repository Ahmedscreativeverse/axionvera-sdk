import { Networks } from "@stellar/stellar-sdk";
import {
  getDefaultRpcUrl,
  getNetworkPassphrase,
  resolveNetworkConfig
} from "../src/utils/networkConfig";

describe("networkConfig", () => {
  test("getNetworkPassphrase returns correct passphrases", () => {
    expect(getNetworkPassphrase("testnet")).toBe(Networks.TESTNET);
    expect(getNetworkPassphrase("mainnet")).toBe(Networks.PUBLIC);
  });

  test("getDefaultRpcUrl returns known RPC endpoints", () => {
    expect(getDefaultRpcUrl("testnet")).toBe("https://soroban-testnet.stellar.org");
    expect(getDefaultRpcUrl("mainnet")).toBe("https://soroban-mainnet.stellar.org");
  });

  test("resolveNetworkConfig uses defaults and overrides", () => {
    expect(resolveNetworkConfig()).toEqual({
      network: "testnet",
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET
    });

    expect(resolveNetworkConfig({ network: "mainnet" })).toEqual({
      network: "mainnet",
      rpcUrl: "https://soroban-mainnet.stellar.org",
      networkPassphrase: Networks.PUBLIC
    });

    expect(
      resolveNetworkConfig({ network: "testnet", rpcUrl: "http://localhost:3000" })
    ).toEqual({
      network: "testnet",
      rpcUrl: "http://localhost:3000",
      networkPassphrase: Networks.TESTNET
    });

    expect(
      resolveNetworkConfig({ network: "mainnet", networkPassphrase: "my-custom-passphrase" })
    ).toEqual({
      network: "mainnet",
      rpcUrl: "https://soroban-mainnet.stellar.org",
      networkPassphrase: "my-custom-passphrase"
    });
  });
});
