# Adventure Planner
UX-first California travel agent prototype. Open the hosted site and select a sample prompt; expand Agent execution trace beneath the results.
## Harness V0
`dist/harness.mjs`: model adapter contract, instructions, tool registry, bounded loop, argument and provenance validation, errors and traces.
`dist/fixtures.mjs`: illustrative candidate fixtures, not live data.
`tests/harness.test.mjs`: deterministic execution and negative-path tests.
Run `node --test tests/harness.test.mjs`.
Current adapter is deliberately deterministic, not an LLM. No real-world suitability, travel time, forecast, skill matching or autonomy has been validated. The browser holds transient state only. Next: server-side LLM adapter, typed intent and persistent turn context, real data tools, scope/constraint validators, and full product evals.

## Weather integration V0.2 — API + MCP
- Weather provider: NOAA / National Weather Service. Public point lookup → trusted forecast endpoint, filtered to explicit travel dates; returns source URL, issue/retrieval time, periods and limitations.
- `integrations/weather-api.mjs` holds the HTTP adapter; `weather-mcp-server.mjs` exposes the read-only tool through the official MCP SDK over stdio. `weather-mcp-client.mjs` discovers and calls it.
- The harness can register an optional weather tool. It supplies only known candidate coordinates and explicit travel dates; tool calls count toward its existing budget. The demo model still makes deterministic decisions; geography is still fixture-based, not verified by an authoritative boundary.
- Node 24+, run `npm ci` then `npm test`. Run `npm run weather:mcp -- YYYY-MM-DD YYYY-MM-DD` with dates within the next seven local calendar days to launch the live research demo. Longer-range requests return a horizon limitation; no forecast is fabricated.
- No API credentials needed for NWS. Network access is needed for live calls. This is a server-side / CLI integration; the hosted UI still runs the previous browser demo and is not connected to the live weather data. Weather is not resort availability, route access, marine conditions or an activity safety assessment.
- Official API: https://www.weather.gov/documentation/services-web-api ; MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
