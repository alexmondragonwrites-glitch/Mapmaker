// Lightweight smoke test for the asset classifier selfTest().
// Run via `npm run test`. Intended to be fast and dependency-free
// so it can also run in CI before deploys.
//
// We use Node's built-in --experimental-strip-types to consume the
// TypeScript sources directly without pulling in ts-node.

import { selfTest } from '../src/engine/assets-runtime/classifier.ts';

const ok = selfTest();
if (!ok) {
    console.error('❌ classifier self-test FAILED');
    process.exit(1);
}
console.log('✅ classifier self-test passed');
