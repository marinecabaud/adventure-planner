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

## Routing integration V0.3 — direct API (no MCP)
- `integrations/routing-api.mjs` calls OSRM's public demo read-only driving route endpoint directly. No API credentials; intended for a low-volume, non-commercial development demonstration, not production. The CLI makes one request per run; do not automate repeated calls (public demo policy: max one request per second). A production integration needs an appropriate provider or hosted OSRM.
- The harness registers the optional `get_drive_estimate` tool, resolves known candidate IDs to representative area coordinates, validates duration/distance and compares duration against an explicit `maxTransferMinutes` preference. It reports `within_limit`, `exceeds_limit` or `unknown`; no route/provider failure never becomes a fabricated duration.
- Run `npm run routing:demo -- 60` for a North Tahoe → Sierra foothills comparison. This is **area-to-area**, not precise sports locations; no live traffic, weather, closures, or access validation. It does not constitute a verified itinerary or automatically enforce all transfer constraints across the final recommendations yet.
- Official API: https://project-osrm.org/docs/v5.24.0/api/ ; demo policy: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- The hosted UI is unchanged; this integration is server-side / CLI only.
