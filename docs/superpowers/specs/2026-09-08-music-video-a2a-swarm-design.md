# Music-video A2A swarm design

Date: 2026-09-08

## Goal
v1 music-video production swarm on the existing TypeScript Creative Director: in-process Writer, DP, and Editor with A2A Agent Cards; Veo + Pixels + C2PA remain function tools on the coordinator.

## Decisions
- Vertical: music video only (film/sitcom later, same cards).
- End-to-end on current render stack.
- Hybrid A2A: local `AgentTool` specialists; `RemoteA2AAgent` when `*_A2A_CARD_URL` is set.

## Taken from recipes
- **genmedia-for-commerce**: do not hang image/video generation tools on the writer; a router delegates.
- **long-horizon-harness**: department cards, markdown skill packs, HITL before irreversible/expensive tools, never invent artifact URLs in planning.

## Agents
- `writer_agent` — treatment
- `dp_agent` — storyboard + `visual_prompt`
- `editor_agent` — assembly args only (no stitch)
- Director — `select_genre_pack`, research specialists, then existing generate/assemble/C2PA tools

## Skills
- `skills/craft/music-video.md`, `beat-sync.md`, `veo-prompting.md`
- `skills/genres/dark-pop.md`, `hip-hop.md`

## HITL
After Writer+DP, stop unless the user already approved rendering.

## Grafana Cloud MCP
Optional partner observability: set `GRAFANA_URL` (hosted OAuth MCP) or `GRAFANA_MCP_URL` + `GRAFANA_SERVICE_ACCOUNT_TOKEN` (self-hosted). Director gets filtered `grafana_*` tools for Loki/Tempo/Prometheus investigation of Veo/assembly failures. AI Observability alone does not satisfy the hackathon track — MCP connection does.

## Out of scope
Livepeer, remote Cloud Run per department, sitcom/feature pipelines.
