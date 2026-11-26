# Adventure Planner — Baseline V1

Date: 2026-11-26. [GitHub Actions run #1](https://github.com/marinecabaud/adventure-planner/actions/runs/45909513051), source commit `3253f9e1fa6d7fb061c3e5d89585961ff6a707d4`. Dataset: `intent-v2.json`. 20/20 executed, zero execution errors. All 5 runner unit tests passed.

## Raw judge results (provisional, not a production quality score)

| Category | Cases | Pass | Fail | Not observed | Pass / observed | Coverage |
|---|---:|---:|---:|---:|---:|---:|
| Context assumptions | 10 | 54 | 2 | 15 | 96.4% | 78.9% |
| Intent understanding | 10 | 45 | 2 | 11 | 95.7% | 81.0% |
| Total | 20 | 99 | 4 | 26 | 96.1% | 79.8% |

Strict demonstrated success over *all* behavioral checks: 99/129 (76.7%). This is not a corrected score; the judge has known false positives. Structured deterministic checks: 0 pass, 0 fail, 66 not observed. Agent usage: 42,083 input and 2,552 output tokens; judge usage: 10,062 input and 4,446 output tokens.

## Manual review findings

- INT-001 (Tahoe Nov 27–28): agent did not expose an intermediate skill assumption and conditionally requested explicit dates despite dates being supplied. Date-related passes from the judge are too generous; the tool arguments and normalized dates cannot be verified. 
- INT-003: explicitly asks for skill instead of applying/disclosing the intermediate default.
- INT-005 and INT-006: Sea Ranch treated as unsupported because the demo candidate fixture set is limited. This is a retrieval/inventory limitation, not proof of a language comprehension failure.
- INT-014: asks for startDate/endDate and transfer limit instead of asking the useful question (road cycling vs mountain biking) or presenting both. Judge marks the meaningful-clarification criterion as fail but misses some redundant requests.
- INT-020: empty preference skill not visibly defaulted.

## Method and limitations

The same real LLM and harness were invoked with controlled unavailable weather/routing fixtures; the run does not evaluate the accuracy of live weather, resort status, routing, or recommendations. The grader has a fixed reference date but the harness does not. Same-model LLM judge is provisional and cannot replace deterministic assertions. The present harness exposes no normalized intent contract, leaving all 66 structured checks unverifiable. Langfuse site traces are separate from this CLI evaluation; this run does not export its scores to Langfuse.

## Next iteration

1. Add an observable normalized intent contract, including dates, sports, destination/scope, skill and its source, and trip constraints; inject reference clock (America/Los_Angeles).
2. Apply intermediate as disclosed default when unspecified, preserve explicit levels, and normalize unambiguous dates without asking for format or year.
3. Use deterministic checks for structured values and sharpen the judge for conditional redundant questions and user experience.
4. Re-run the identical dataset, compare scores and coverage, then separately expand the destination candidate discovery beyond the demo inventory.
