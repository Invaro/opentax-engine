# @invaro/opentax-corpus-us-federal

The OpenTax rule corpus: every federal and state rule and input, each with its citation. `getCorpus()` returns it validated and hashed; `extendCorpus()` adds your own rules; `getProjectedFederalCorpus()` projects a year the IRS has not published.

```js
import { extendCorpus, getCorpus } from "@invaro/opentax-corpus-us-federal";

const corpus = getCorpus();
corpus.version;    // the release
corpus.merkleRoot; // the fingerprint every proof names
```

- **API tier:** stable code API and ids; the law is updated every release, and the version is the release number.
- **Documentation and compatibility policy:** https://github.com/Invaro/opentax-engine/blob/main/docs/LIBRARY-API.md
- **Exact declarations:** https://github.com/Invaro/opentax-engine/blob/main/packages/library-api/report/corpus-us-federal.api.md
- **License:** Business Source License 1.1; see https://github.com/Invaro/opentax-engine/blob/main/LICENSE and COMMERCIAL-LICENSE.md.

ES modules only. No Node built-ins, no network, no telemetry.
