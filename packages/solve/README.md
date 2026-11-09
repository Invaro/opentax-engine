# @invaro/opentax-solve

The OpenTax solver layer: sweeps, marginal rates, cliffs located to the cent, inversion, comparisons across filing statuses, and search over the rules. Every data point is a real evaluation.

```js
import { findCliffs, marginal } from "@invaro/opentax-solve";
```

- **API tier:** stable; follows semantic versioning.
- **Documentation and compatibility policy:** https://github.com/Invaro/opentax-engine/blob/main/docs/LIBRARY-API.md
- **Exact declarations:** https://github.com/Invaro/opentax-engine/blob/main/packages/library-api/report/solve.api.md
- **License:** Business Source License 1.1; see https://github.com/Invaro/opentax-engine/blob/main/LICENSE and COMMERCIAL-LICENSE.md.

ES modules only. No Node built-ins, no network, no telemetry.
