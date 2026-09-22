# Chainlink VRF v2.5 client interfaces

This directory contains the three unmodified MIT-licensed Solidity client files
needed by the Manekineko VRF integration. They were extracted from the official
`@chainlink/contracts` npm package, pinned to **1.5.0**, on 2026-09-10. Their
original package paths and relative imports are preserved. No coordinator,
subscription implementation, consumer base, mocks, or unrelated Chainlink code
is vendored here.

## Provenance and verification

- Package: [`@chainlink/contracts@1.5.0`](https://www.npmjs.com/package/@chainlink/contracts/v/1.5.0).
- Tarball: [official npm archive](https://registry.npmjs.org/@chainlink/contracts/-/contracts-1.5.0.tgz).
- Upstream tag: [`contracts-v1.5.0`](https://github.com/smartcontractkit/chainlink-evm/tree/contracts-v1.5.0/contracts/src/v0.8/vrf/dev).
- npm archive SHA-1: `ae9a5a20da1169e7b0dd2a625856c4aa3e2a58bc`.
- npm archive integrity: `sha512-1fGJwjvivqAxvVOTqZUEXGR54CATtg0vjcXgSIk4Cfoad2nUhSG/qaWHXjLg1CkNTeOoteoxGQcpP/HiA5HsUA==`.
- `SHA256SUMS` records the digest of every vendored Solidity file.

The archive was downloaded using `npm pack @chainlink/contracts@1.5.0
--ignore-scripts` and its SHA-512 independently checked against the npm registry
integrity before extracting the three files. The extraction copied file bytes
without formatting or changing import paths. The monorepo dependency manifest
and lockfile do not depend on the full Chainlink package.

To verify the source files locally, run `shasum -a 256 -c SHA256SUMS` from this
directory. An upgrade requires a new pinned package, archive integrity check,
reviewed source diff, refreshed per-file digests, and integration tests.

## License

All three vendored files declare `SPDX-License-Identifier: MIT`. `LICENSE`
reproduces the copyright notice and applicable MIT portion of the [upstream
repository license at the pinned tag](https://github.com/smartcontractkit/chainlink-evm/blob/contracts-v1.5.0/LICENSE).
The package contains other components under other licenses and its package-wide
metadata reports `BUSL-1.1`; those components are not included here. The upstream
license also contains an LGPL section for Go bindings, which are not included.

## Consumer authentication

Manekineko authenticates callbacks against an immutable coordinator address and
uses these official request types. It deliberately does not inherit
`VRFConsumerBaseV2Plus`: the pinned base includes an owner/coordinator callable
`setCoordinator` function that can replace the trusted verifier. A collection
must not permit verifier substitution after tickets are sold. This choice also
means an existing collection does not support Chainlink coordinator migration;
new deployments must be reviewed against the current official coordinator.

The coordinator still verifies the actual VRF proof. These interfaces do not
generate randomness, verify a proof by themselves, or remove the external VRF
provider dependency. The immutable callback authentication and lifecycle need
independent security review before Mainnet deployment.
