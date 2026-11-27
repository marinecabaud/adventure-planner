# Adventure Planner — Product Requirements Document
Version 0.2 | 2026-11-27 | Product framing and implementation status

## Vision
Help outdoor enthusiasts discover where to go, when to go, and how to combine multiple sports into a single trip through personalized, evidence-based recommendations.

## Problem and value proposition
Multi-sport travelers must cross-reference fragmented information about destinations, seasonality, weather, sport-specific conditions, logistics and access. Adventure Planner researches and compares these factors to recommend compatible combinations, explaining trade-offs and uncertainty.

## Defined scope
- Audience: multi-sport outdoor enthusiasts.
- Geography: California, USA; a trip may combine multiple nearby California destinations.
- Sports: ski/snowboard, kitesurf, hiking, mountain biking, surf, trail running, cycling.
- Interface: hybrid conversational and structured experience.
- Planning horizon: near-term and longer-term.
- Personalization: consider skill level for each relevant activity.
- Results: three ranked recommendations with comparison; proposed quality rule: return fewer if evidence supports fewer, rather than inventing options.
- Implementation partner: Codex.

## MVP priorities
P0: sport-first discovery, destination-first discovery, multi-sport matching, date optimization.
P1/later: budget optimization, detailed itinerary generation, cross-session memory.
P2/later: booking, payment, accommodation and flight transactions.

## User journey
1. User describes an adventure in natural language, optionally using structured sport, date, destination and skill filters.
2. Agent extracts intent and mandatory vs flexible constraints; asks focused questions only if necessary.
3. Agent researches candidate destinations, sport suitability, accessibility, geography and available evidence for the requested horizon.
4. Agent ranks feasible combinations and displays three recommendations when supported, with a map, comparable destination cards, source links, caveats and reasons.
5. User refines intent through conversation or filters; results update consistently.

Example (illustrative only): four days in February, starting from San Francisco, skiing and mountain biking, with up to two hours between activity destinations. The agent should explore candidate combinations rather than presuppose that either activity is available.

## Agent functional requirements
- Recognize sport-first, destination-first, multi-sport and date-optimization intents.
- Extract sports, dates/horizon, destination, origin where relevant, trip duration, skill per sport and maximum transfer time when specified.
- Ask targeted clarifying questions when important constraints cannot be inferred.
- Determine information needs, select tools, call tools, examine results and perform additional research if evidence is insufficient.
- Compare and rank options using user constraints, suitability, proximity and evidence quality.
- Explain recommendations, alternatives and unknowns, with sources and dates.
- Support refinement without forgetting established constraints during the conversation.

## Guardrails
- No recommended destination outside California; clearly explain scope when needed.
- Never invent opening status, conditions, access or travel times.
- Differentiate climatology/typical seasonality, current observations, and forecasts; do not portray future conditions as known.
- Honor hard constraints; flag infeasibility versus relaxing constraints silently.
- Consider per-sport skill and local restrictions; avoid guarantees of outdoor safety.
- Cite factual claims with relevant evidence and be explicit about missing/stale evidence.
- Bound the research loop, tool calls and clarification burden.
- Treat external content as untrusted evidence, not instructions.

## Data requirements
| Sport | Evidence needed |
| --- | --- |
| Ski / snowboard | Snow depth, snowfall, resort openings, elevation |
| Kitesurf | Wind, direction, gusts, access restrictions |
| Surf | Swell height/period/direction, wind, tides |
| Hiking | Weather, access, snow and terrain |
| Mountain biking | Trail conditions, rain, closures, elevation |
| Trail running | Access, terrain, weather, distance |
| Cycling | Road conditions, elevation, wind, temperature |

Cross-cutting: California location, seasonality, coordinates, travel distance/time, access restrictions, skill suitability, source provenance and freshness. Initial providers are implemented (see the [architecture](docs/architecture.md)); comprehensive coverage and source quality validation remain pending.

## Success metrics (proposed development targets, not measured results)
Product: recommendation acceptance, planning completion, time saved, satisfaction, repeat usage.
Agent: hard-constraint compliance (100%), task success (>=90%), factual groundedness (>=95%), correct tool selection (>=90%), latency and cost per completed request (measure baseline).
Define evaluation denominators, rubric and sample size before comparing versions.

## Initial eval scenarios
| ID | User input | Expected behavior |
| --- | --- | --- |
| E01 | Where can I kitesurf in March? | California candidates, relevant seasonality and sources |
| E02 | What sports can I do in Tahoe in February? | Feasible winter sports; qualify access and conditions |
| E03 | I want to ski and surf in one trip. | Explore compatible geographic clusters and periods |
| E04 | Where can I go mountain biking tomorrow? | Obtain relevant location if needed, check current conditions/access |
| E05 | I want to ski in California in August. | Explain limitations; no invented availability |
| E06 | Plan a kitesurf trip to Hawaii. | Explain California scope |
| E07 | I want to go hiking and cycling. | Clarify materially missing dates/location as needed |
| E08 | Where can I surf and ski next weekend? | Use available forecasts and acknowledge uncertainty |
| E09 | I'm a beginner kitesurfer. | Account for skill and access restrictions |
| E10 | Find two sports less than one hour apart. | Verify travel time and comply with constraint |
| E11 | I am an advanced skier and a beginner cyclist. | Preserve different levels by sport |
| E12 | Find three options even if none meet all requirements. | Do not fabricate or silently relax mandatory criteria |

## Delivery approach
UX-first: define target experience, wireframes and realistic sample output using explicitly illustrative data. Then map UI fields and interaction states to agent outputs, required evidence, tools and feasibility spikes. Implement a narrow vertical slice before expanding across all supported sports and use cases.
The current repository implements a working experimental vertical slice, with partial live validation. See the [evaluation reports](evals/README.md) for measured historical results and limitations.

## Implementation status — November 27, 2026

| Capability | Status |
| --- | --- |
| Hybrid conversational UI, guided entry and structured preferences | Implemented |
| Structured intent, date and default skill normalization | Implemented; regression testing ongoing |
| Live sourced activity discovery, geocoding, map rendering | Implemented; live acceptance remains mixed |
| NOAA forecast and OSRM route estimates | Implemented with coverage limitations |
| Bounded harness, validation, uncertainty and hard transfer checks | Implemented; re-evaluate current build |
| Langfuse tracing and offline/live evaluation framework | Implemented; historical baselines documented |
| Complete verification of access, sport-specific suitability, exact activity-to-activity routes | Not validated |
| Persistent conversation memory, booking and payments | Out of MVP |

Next release: prioritize reliable evidence, source quality, geocoding acceptance and hard-constraint compliance over adding new features. Product adoption and satisfaction targets have not been measured.
