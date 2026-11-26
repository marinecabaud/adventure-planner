# Tool Selection — Baseline V1

Date: 2026-11-26. [GitHub Actions run](https://github.com/marinecabaud/adventure-planner/actions/runs/45912617162). Source commit: `8f9e86ed7c3f9a6a1fd354e614d14e043fedac84`.

- 15/15 scenarios completed; zero execution errors.
- 5/5 scorer unit tests passed.
- 91/103 deterministic checks passed (88.3%); 12 failed.
- 12/15 scenarios require missing data capabilities. These gaps are deliberately not counted as model selection failures.
- No LLM judge used. Accepted and rejected tool attempts, relevant scenario, required/forbidden tools and call order are recorded. External payloads are controlled unavailable fixtures, not live conditions.

| Case | Existing tool selection | Missing capabilities |
|---|---|---|
| TOOL-001 Tahoe ski Nov 27–28 | 6/7: weather omitted | Resort opening, snow conditions |
| TOOL-002 Sea Ranch next week | 4/7: irrelevant Tahoe fixture and evidence | Destination discovery, trail access |
| TOOL-003 California spring kitesurf | 7/7 | Seasonal wind, launch access |
| TOOL-004 Sea Ranch undated | 5/7: irrelevant Tahoe fixture | Destination discovery, trail access |
| TOOL-005 Tahoe ski + run, max 60 min | 6/7: weather omitted | Opening, trail access, exact activity routing |
| TOOL-006 Santa Cruz MTB tomorrow | 6/7: weather omitted | Trail access |
| TOOL-007 Santa Cruz surf next July | 7/7 | Seasonal swell, surf access |
| TOOL-008 Tahoe ski 2027 | 7/7 | Seasonal snow, resort openings |
| TOOL-009 Colorado snowboard | 7/7 | None |
| TOOL-010 Invalid date | 7/7 | None |
| TOOL-011 Hiking within 2h of SF | 3/5: wrong fixture and inter-candidate routing | Discovery, origin-to-destination routing, trail access |
| TOOL-012 California kite tomorrow | 6/7: weather omitted | Marine wind, launch access |
| TOOL-013 Santa Cruz hike/bike weekend | 6/7: weather omitted | Trail and cycling accessibility |
| TOOL-014 Ambiguous date | 7/7 | None |
| TOOL-015 Joshua Tree cycling | 7/7 existing-tool selection, no actual results | Discovery, cycling access |

## Next product improvement

Prioritize actual destination and activity discovery so an arbitrary supported California location is no longer forced into three fixtures. Add reliable source provenance (official park/land manager/resort/launch sources, and a geographical source), separate potential activity locations from verified live conditions, and enforce correct geographical matching in the harness. Add required weather selection for relevant resolved near-term dates and a seasonal evidence path for long-range requests. Re-run this baseline and the existing 20 intent evals after changes. Do not interpret weather as verified sport availability.

No production change or new data integration is included in this evaluation-only revision.
