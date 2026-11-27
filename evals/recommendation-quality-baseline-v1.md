# Recommendation Quality V1 — calibrated baseline

Run: [45916155342](https://github.com/marinecabaud/adventure-planner/actions/runs/45916155342)
Source commit: f83c57446ec96bb6b8111baf37ae58c302d8de6b
Reference date: 2026-11-26 (California local time). Live sources evaluated at runtime.

- 10/10 scenarios executed: eight supported discovery requests returned results, one out-of-scope request was rejected, one hard multi-sport transfer constraint returned insufficient evidence.
- Deterministic technical checks: **102/102 (100%)**.
- Quality: **32 pass, 12 partial, 0 fail, 1 unknown, 11 N/A**.
- Weighted quality score: **86.4%** on graded applicable criteria (partial = half credit); evidence coverage **97.8%**. Strict full passes: 32/45 applicable criteria. Zero judge execution errors.
- Workflow intentionally failed on the remaining unknown: the product is not fully quality-validated.

| Dimension | Pass | Partial | Fail | Unknown | N/A |
|---|---:|---:|---:|---:|---:|
| geography | 7 | 1 | 0 | 0 | 0 |
| activity | 7 | 1 | 0 | 0 | 0 |
| season | 2 | 1 | 0 | 0 | 5 |
| source_quality | 6 | 2 | 0 | 0 | 0 |
| condition_handling | 5 | 3 | 0 | 0 | 0 |
| ranking | 1 | 1 | 0 | 0 | 6 |
| skill_fit | 4 | 3 | 0 | 1 | 0 |

| Scenario | Outcome | Technical | Quality (P / partial / F / U / NA) |
|---|---|---:|---|
| QUAL-001 | results | 11/11 | 3 / 2 / 0 / 1 / 1 |
| QUAL-002 | results | 11/11 | 1 / 6 / 0 / 0 / 0 |
| QUAL-003 | results | 10/10 | 6 / 1 / 0 / 0 / 0 |
| QUAL-004 | results | 10/10 | 5 / 0 / 0 / 0 / 2 |
| QUAL-005 | results | 11/11 | 4 / 1 / 0 / 0 / 2 |
| QUAL-006 | results | 11/11 | 3 / 2 / 0 / 0 / 2 |
| QUAL-007 | results | 11/11 | 5 / 0 / 0 / 0 / 2 |
| QUAL-008 | results | 10/10 | 5 / 0 / 0 / 0 / 2 |
| QUAL-009 | unsupported | 8/8 | 0 / 0 / 0 / 0 / 0 |
| QUAL-010 | insufficient | 9/9 | 0 / 0 / 0 / 0 / 0 |

## Product backlog from findings
- P1: Resolve exact candidate coordinates via geocoding to unlock map and point weather; do not manufacture locations.
- P1: Distinguish public trail access from private/member-only trail systems (Sea Ranch).
- P1: Verify activity-specific difficulty, restrictions and current status; Tahoe skill suitability remains unknown.
- P2: Strengthen seasonal evidence, especially wind and launch rules, and rank distinct, well-supported options.
- P2: Add verified activity-to-activity coordinates and a suitable routing provider for hard multi-sport constraints.

The judge is automated, not a human ground truth; source matching and full coverage do not prove factual correctness. Mapping, live operational availability, and verified itinerary construction are not yet acceptance-tested. No production code was changed in this eval cycle.
