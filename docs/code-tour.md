# Code walkthrough

This guide is for product managers and developers who want to understand the actual agent before reading every line of code. Follow the order below. All links point to the implemented modules in this repository.

## 1. Start from the user experience

- [dist/index.html](../dist/index.html#L31): the browser collects the request and preferences, sends a POST to the hosted API, then displays outcome, map and execution evidence.
- [worker/index.mjs](../worker/index.mjs#L17-L39): the backend checks authentication and validates the request. The API key is read server-side, never from the browser.

## 2. Find the model and system instructions

- [models/openai-model.mjs](../models/openai-model.mjs#L31-L69): the OpenAI Responses adapter extracts intent, sends registered function schemas and returns decisions to the harness.
- [dist/intent.mjs](../dist/intent.mjs#L17-L55): the intent schema and normalization logic translate user text into structured dates, sports, geography, skill and transfer limits.
- [dist/harness.mjs](../dist/harness.mjs#L3-L14): the agent's core instructions and base tool definitions.

## 3. Understand the agent loop

Read [dist/harness.mjs](../dist/harness.mjs#L31-L76), then its [final validation logic](../dist/harness.mjs#L111-L132).

The harness determines which tools are available, asks the model for its next action, validates the action, calls the tool and feeds observations back. The hosted Worker configures a seven-step, six-tool budget. The model does not directly execute arbitrary functions.

A final result is subject to validation: a required transfer limit without adequate routing evidence can produce an insufficient-evidence outcome and separate exploratory leads.

## 4. Explore tool integrations

| Tool or service | Source | Why it is used |
| --- | --- | --- |
| Real activity discovery | [activity-search.mjs](../integrations/activity-search.mjs#L26) | Search for sourced candidates matching the requested sport and place |
| Geocoding | [geocoding-api.mjs](../integrations/geocoding-api.mjs#L33) | Attempt to resolve candidate coordinates without inventing them |
| Weather | [weather-api.mjs](../integrations/weather-api.mjs) | Retrieve available NOAA/NWS forecasts |
| Weather MCP | [weather-mcp-server.mjs](../integrations/weather-mcp-server.mjs), [weather-mcp-client.mjs](../integrations/weather-mcp-client.mjs) | Demonstrate a standardized tool interface in the Node CLI |
| Routing | [routing-api.mjs](../integrations/routing-api.mjs#L13) | Estimate drive time between known candidate locations |
| Telemetry | [langfuse-telemetry.mjs](../integrations/langfuse-telemetry.mjs#L13) | Trace execution and measure model usage and tool outcomes |

The hosted Worker uses direct HTTP for weather; the CLI uses the MCP transport. The hosted path additionally enables live discovery and geocoding.

## 5. Follow a request end to end without spending API credits

Open [examples/quickstart.mjs](../examples/quickstart.mjs), then run:

```bash
node examples/quickstart.mjs "I want to ski and trail run in Tahoe."
```

Inspect the resulting JSON fields: `status`, `message`, `candidates`, `trace`, and `metrics`. The [demo adapter](../dist/harness.mjs#L135-L150) uses a deterministic model and the [fixture inventory](../dist/fixtures.mjs). Its output is illustrative, not live or evidence of LLM performance. It does not verify routes or safety.

For the live CLI entry point, see [integrations/agent-demo.mjs](../integrations/agent-demo.mjs). The [README](../README.md#get-started) explains prerequisites.

## 6. Understand how quality is evaluated

- [tests/harness.test.mjs](../tests/harness.test.mjs): deterministic harness tests.
- [evals/intent-v2.json](../evals/intent-v2.json): intent and context scenarios.
- [evals/tool-selection-v1.json](../evals/tool-selection-v1.json): tool-selection scenarios.
- [evals/recommendation-quality-v1.json](../evals/recommendation-quality-v1.json): recommendation-quality scenarios.
- [evals/README.md](../evals/README.md): method, runners, scoring protocol and limitations.

Read the [historical quality report](../evals/recommendation-quality-baseline-v1.md) to see how measured failures and unknowns translate into product priorities.

## Further reading

- [Technical architecture](architecture.md)
- [Product requirements and roadmap](../PRD.md)
- [Development history](../CHANGELOG.md)

The documentation structure was inspired by the clear feature list and step-by-step setup of [Shubham Saboo's AI Travel Agent](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/starter_ai_agents/ai_travel_agent). Adventure Planner uses its own implementation and architecture.
