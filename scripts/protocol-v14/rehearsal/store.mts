// Preserve the reviewed encrypted vault format and its V13 AAD. Fresh V14 state
// and bundle approval bind these wallets to V14; historical state is never rewritten.
export { createVault, readVault, privateRead, durable, exclusive } from '../../protocol-v13/rehearsal/store.mts';
