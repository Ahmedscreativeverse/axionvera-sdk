# `@axionvera/react`

React bindings for Axionvera's Stellar SDK.

## Installation

```bash
npm install @axionvera/react @axionvera/core react
```

If you want the built-in Freighter wallet support, also install:

```bash
npm install @stellar/freighter-api
```

## Usage

Wrap your app with `AxionveraProvider`, then use the hooks anywhere below it.

```tsx
import { AxionveraProvider } from '@axionvera/react';

export function AppRoot() {
  return (
    <AxionveraProvider
      clientOptions={{ network: 'testnet' }}
      vaultContractId="C...YOUR_VAULT_ID"
    >
      <App />
    </AxionveraProvider>
  );
}
```

```tsx
import {
  useStellarClient,
  useVaultContract,
  useWallet
} from '@axionvera/react';

export function Dashboard() {
  const client = useStellarClient();
  const vault = useVaultContract();
  const wallet = useWallet();

  const connect = async () => {
    await wallet.connect();
    const health = await client.getHealth();
    const balance = await vault.getBalance();

    console.log({ health, balance });
  };

  return (
    <button onClick={() => void connect()}>
      {wallet.isConnected ? wallet.publicKey : 'Connect Freighter'}
    </button>
  );
}
```

## API

- `AxionveraProvider`: Creates a shared `StellarClient`, exposes wallet state, and optionally configures a default vault contract ID.
- `useStellarClient()`: Returns the provider's shared `StellarClient`.
- `useVaultContract(contractId?)`: Returns a `VaultContract` bound to the provider client and wallet connector.
- `useWallet()`: Returns Freighter-aware wallet state plus `connect()` and `refresh()` helpers.

## Freighter behavior

`useWallet()` automatically:

- detects whether Freighter is available
- restores an allowed account when possible
- watches for account changes via Freighter's wallet watcher
- refreshes wallet state when the window regains focus
