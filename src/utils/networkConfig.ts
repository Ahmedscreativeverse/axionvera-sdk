import { Networks } from "@stellar/stellar-sdk";

/**
 * Supported Axionvera networks.
 */
export type AxionveraNetwork = "local" | "testnet" | "mainnet" | "futurenet";

/**
 * The Stellar standalone / local network passphrase.
 */
export const LOCAL_NETWORK_PASSPHRASE = "Standalone Network ; February 2017";

/**
 * Configuration for network connections.
 */
export type NetworkConfig = {
  /** The network identifier */
  network: AxionveraNetwork;
  /** The RPC URL for the network */
  rpcUrl: string;
  /** The network passphrase for transaction signing */
  networkPassphrase: string;
};

const DEFAULT_RPC_URLS: Record<AxionveraNetwork, string> = {
  local: "http://localhost:8000/soroban/rpc",
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://soroban-mainnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org"
};

/**
 * Gets the network passphrase for a given network.
 * @param network - The network identifier
 * @returns The network passphrase
 */
export function getNetworkPassphrase(network: AxionveraNetwork): string {
  switch (network) {
    case "local":
      return LOCAL_NETWORK_PASSPHRASE;
    case "testnet":
      return Networks.TESTNET;
    case "mainnet":
      return Networks.PUBLIC;
    case "futurenet":
      return Networks.FUTURENET;
  }
}

/**
 * Gets the default RPC URL for a given network.
 * @param network - The network identifier
 * @returns The default RPC URL
 */
export function getDefaultRpcUrl(network: AxionveraNetwork): string {
  return DEFAULT_RPC_URLS[network];
}

/**
 * Resolves network configuration from input options.
 * Fills in defaults for any missing values.
 * @param input - Optional network configuration overrides
 * @returns The resolved network configuration
 */
export function resolveNetworkConfig(input?: {
  network?: AxionveraNetwork;
  rpcUrl?: string;
  networkPassphrase?: string;
}): NetworkConfig {
  const network = input?.network ?? "testnet";
  const networkPassphrase =
    input?.networkPassphrase ?? getNetworkPassphrase(network);
  const rpcUrl = input?.rpcUrl ?? getDefaultRpcUrl(network);

  return { network, rpcUrl, networkPassphrase };
}
