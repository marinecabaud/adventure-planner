# Adventure Planner
UX-first California travel agent prototype. Open the hosted site and select a sample prompt; expand Agent execution trace beneath the results.
## Harness V0
`dist/harness.mjs`: model adapter contract, instructions, tool registry, bounded loop, argument and provenance validation, errors and traces.
`dist/fixtures.mjs`: illustrative candidate fixtures, not live data.
`tests/harness.test.mjs`: deterministic execution and negative-path tests.
Run `node --test tests/harness.test.mjs`.
Current adapter is deliberately deterministic, not an LLM. No real-world suitability, travel time, forecast, skill matching or autonomy has been validated. The browser holds transient state only. Next: server-side LLM adapter, typed intent and persistent turn context, real data tools, scope/constraint validators, and full product evals.
