# SDK 0.6.0: candidate error-propagation patch

This is a narrow candidate patch for the published `@flop-labs/sdk` 0.6.0
`dist/quickstart.js`, not an upstream source PR or a replacement SDK release.
The source repository is inaccessible to this contributor. The npm tarball's
SHA-512 integrity is checked; package origin/version/license and JS SHA-256
are in `provenance.json`. Original code remains under the accompanying upstream
`LICENSE` (MIT OR Apache-2.0).

Problem: `inference()` catches a purchase failure and resolves with an empty
placeholder. Changing that to reject also requires `quickInference()` to clean
up after failure. The candidate rethrows the original purchase error, calls
shutdown once after a successfully created agent, and preserves both failures
with `AggregateError` if inference and shutdown both reject, including falsey
thrown values.

Run in this folder with Node.js 20+ (tested locally on Node 26.7.0):

```powershell
node --test regression.test.mjs
$env:SDK_FIXTURE = 'dist_quickstart.js'
node --test regression.test.mjs
Remove-Item Env:SDK_FIXTURE
```

The second command intentionally runs the same correctness tests against the
published baseline and is expected to fail. Tests extract the actual reviewed
class/wrapper code and replace dependencies with offline mocks; they do not
import the SDK or create a wallet, make RPC requests or pay for inference.
`quickstart-0.6.0.patch` is the reviewable diff; do not apply it to other versions.

Limitations: this does not fix missing output retrieval, cost accounting,
streaming, partial creation cleanup or a shutdown call that never settles.
It does not establish live resource-leak behavior or end-to-end correctness.
Maintainers must port it to their TypeScript source, review API compatibility,
run their full checks and publish a fixed package before adoption.

Credit: the original failure report is by smvlx in
https://github.com/flop-labs/network/issues/246 . The cleanup and dual-failure
boundary was independently documented there by almondous. This candidate
implements those reported criteria; it is not a new discovery of those bugs.
