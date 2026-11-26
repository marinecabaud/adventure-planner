# Adventure Planner — Codex project instructions
California multi-sport travel planner for outdoor enthusiasts. Supported sports: ski/snowboard, kitesurf, hiking, mountain biking, surf, trail running, cycling.
Maintain the clean rose/coral UX. Conversation, three guided entry points, ranked candidate cards and map.
Do not claim fixtures are current or verified recommendations; actual model and external API integration are pending.
Keep execution harness independent of the model adapter. Allow only registered read-only tools; validate arguments and output provenance, bound calls/steps, handle failures and expose non-sensitive traces.
Preserve hard constraints, source provenance, uncertainty and skill level per sport; do not invent conditions, sources or travel times. Return fewer than three options when evidence supports fewer.
Run node --test tests/harness.test.mjs after changes.
