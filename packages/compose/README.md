# @invaro/opentax-compose

OpenTax form composers: state return line sets, Form 2210 (the underpayment penalty with Schedule AI) and Form 4562 (depreciation).

```js
import { composeForm2210, composeForm4562, composeStateReturn } from "@invaro/opentax-compose";
```

- **API tier:** provisional: shapes follow each year's forms and can change in a minor release, with a note in the release's API changes.
- **Documentation and compatibility policy:** https://github.com/Invaro/opentax-engine/blob/main/docs/LIBRARY-API.md
- **Exact declarations:** https://github.com/Invaro/opentax-engine/blob/main/packages/library-api/report/compose.api.md
- **License:** Business Source License 1.1; see https://github.com/Invaro/opentax-engine/blob/main/LICENSE and COMMERCIAL-LICENSE.md.

ES modules only. No Node built-ins, no network, no telemetry.
