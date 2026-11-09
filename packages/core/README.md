# @invaro/opentax-core

The OpenTax evaluator: runs a rule corpus over typed facts and returns the answer with a proof. Also the proof verifier, the error classes and the types. It has no tax knowledge of its own.

```js
import { coerceFacts, evaluate, verifyProof } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const corpus = getCorpus();
const { value, proof } = evaluate(corpus, coerceFacts(corpus, { filingStatus: "single", wages: 85000 }), {
  asOf: "2025-12-31",
  target: "us.federal.net_tax",
});
```

- **API tier:** stable; follows semantic versioning.
- **Documentation and compatibility policy:** https://github.com/Invaro/opentax-engine/blob/main/docs/LIBRARY-API.md
- **Exact declarations:** https://github.com/Invaro/opentax-engine/blob/main/packages/library-api/report/core.api.md
- **License:** Business Source License 1.1; see https://github.com/Invaro/opentax-engine/blob/main/LICENSE and COMMERCIAL-LICENSE.md.

ES modules only. No Node built-ins, no network, no telemetry.
