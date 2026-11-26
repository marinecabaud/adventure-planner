# Adventure Planner — Codex project instructions
California multi-sport travel planner for outdoor enthusiasts. Supported sports: ski/snowboard, kitesurf, hiking, mountain biking, surf, trail running, cycling.
Maintain the clean rose/coral UX. Conversation, three guided entry points, ranked candidate cards and map.
Do not claim fixtures are current or verified recommendations; actual model integration and hosted live weather UI are pending. NWS integration is available through the server-side MCP demo.
Keep execution harness independent of the model adapter. Allow only registered read-only tools; validate arguments and output provenance, bound calls/steps, handle failures and expose non-sensitive traces.
Preserve hard constraints, source provenance, uncertainty and skill level per sport; do not invent conditions, sources or travel times. Return fewer than three options when evidence supports fewer.
Run npm test after changes (Node 24+ and npm ci). Keep NWS calls server-side, date-fenced and provenance-bearing; never treat point forecasts as activity availability or safety.
