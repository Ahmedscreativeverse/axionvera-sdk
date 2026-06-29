# @axionvera/codegen

Soroban WASM spec parser and TypeScript contract-client code generator for the
Axionvera SDK. It reads the `contractspecv0` custom section from a compiled
Soroban `.wasm` file and emits a typed contract client class that extends
`BaseContract` from `@axionvera/core`.

## Installation

```bash
npm install @axionvera/codegen
```

## Usage

```ts
import { parseWasm, generateContractClass } from '@axionvera/codegen';

const spec = parseWasm('./target/wasm32-unknown-unknown/release/my_token.wasm');
const source = generateContractClass(spec, 'TokenContract');
// `source` is a TypeScript module that exports `class TokenContract extends BaseContract`.
```

The generated client imports `BaseContract` from `@axionvera/core` (the import
path is configurable via the third `coreImport` argument to
`generateContractClass`).

## Backward compatibility

For backward compatibility, `@axionvera/core` continues to re-export these
utilities (`parseWasm`, `generateContractClass`, and the `ContractSpec` /
`Spec*` types) through thin shims, so this extraction does not change any
existing import paths. New code should depend on `@axionvera/codegen` directly
to keep bundles lean.
