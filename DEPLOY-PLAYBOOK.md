# Creative Director AI — Deploy & Wiring Playbook

**Purpose:** Ship `g2-1/creative-director` updates to the live Vertex Agent Engine used by **Creative Pixels** (`create.creativeplatform.xyz`).  
**Scope:** Planning and verification only — do **not** run deploy commands from this doc without explicit human approval.

---

## Architecture (what talks to what)

```
Creative Pixels UI (create.creativeplatform.xyz)
        │
        │  HTTPS + SSE (browser)
        ▼
Vercel serverless  api/director.ts   (repo: g2-1/edit-pixels)
        │
        │  OIDC / Workload Identity Federation (no SA JSON keys)
        │  Vertex Agent Engine streaming API
        ▼
Vertex AI Reasoning Engine / Agent Runtime   (THIS repo)
  projects/creative-ai-491118/locations/us-east1/reasoningEngines/7129954674127405056
        │
        ├─► Gemini 3.5 Flash  (GOOGLE_CLOUD_LOCATION=global — not us-east1)
        ├─► Veo video LRO     (VERTEX_LOCATION=us-central1)
        ├─► GCS renders       (RENDERS_GCS_BUCKET=creative-ai-491118-creative-pixels-renders)
        └─► Pixels headless   (PIXELS_HEADLESS_URL → Cloud Run, separate from Agent Engine)
```

**Not the same thing:**

| Component | Repo / path | Role |
|-----------|-------------|------|
| **Creative Director agent** | `g2-1/creative-director` (this repo) | ADK TypeScript swarm; deployed via `agents-cli` to **Vertex Agent Engine** |
| **Pixels `/api/director` proxy** | `g2-1/edit-pixels` → `api/director.ts` | Vercel SSE proxy + WIF auth to Agent Engine |
| **Pixels headless render** | `g2-1/edit-pixels` → `headless/deploy-cloudrun.sh` | Cloud Run video assembly/C2PA — called **by the agent** in production mode |
| **Firestore `creative-director-1`** | Pixels / edit-pixels | Sessions, storyboards, billing audit — **not** the agent runtime |

Redeploying **headless Cloud Run** does **not** update the Creative Director brain. Redeploying **this repo** does **not** update the Pixels UI or Firestore.

---

## What this repo is

| Piece | Location | Notes |
|-------|----------|-------|
| Agent entrypoint | `agent.ts` | Planning vs production via `CREATIVE_DIRECTOR_MODE` |
| Swarm specialists | `agents/writer.ts`, `agents/dp.ts`, `agents/editor.ts` | In-process `AgentTool`; A2A cards in `agents/cards/` |
| Genre catalog | `data/genres/*.json`, `skills/genres/*.md` | Hybrid resolver in `lib/genre.ts` |
| Production tools | `tools/generate-video-cut.ts`, `assemble-timeline.ts`, `sign-c2pa-manifest.ts` | Veo + Pixels headless + GCS |
| Container | `Dockerfile` | `adk api_server` on port 8080 |
| Deploy manifest | `agents-cli-manifest.yaml` | `deployment_target: agent_runtime`, `region: us-east1` |
| Infra (first-time) | `deployment/terraform/single-project/` | Creates Reasoning Engine shell + SA + buckets; **Terraform ignores live agent code** after first deploy |
| Deploy command | `npm run deploy` | Wraps `agents-cli deploy` with production env vars |

**Publish path:** `agents-cli deploy` builds the Docker image, uploads source, and **updates the existing** Reasoning Engine resource in `us-east1`. It does **not** create a new engine ID unless you provision a second resource via Terraform or Console.

---

## How engine ID `7129954674127405056` is updated

1. Terraform (`google_vertex_ai_reasoning_engine.app`) created the resource once with a placeholder bundle.
2. Every `agents-cli deploy` overwrites `spec.source_code_spec` on **that same** resource (`lifecycle.ignore_changes` in `service.tf` prevents Terraform from reverting it).
3. The numeric suffix (`7129954674127405056`) is stable across code deploys.
4. **New ID only if:** someone deletes the engine and re-runs `agents-cli infra single-project`, or creates a second engine manually.

**After deploy, confirm the ID:**

```bash
# Terraform output (if infra was applied from this repo)
cd deployment/terraform/single-project && terraform output agent_runtime_resource_name

# Or gcloud
gcloud ai reasoning-engines list \
  --project=creative-ai-491118 \
  --region=us-east1

# Or Console
# https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=creative-ai-491118
```

Expected full name:

`projects/creative-ai-491118/locations/us-east1/reasoningEngines/7129954674127405056`

---

## What changed recently (likely needs redeploy)

Recent `main` history (merged **PR #7** and earlier production work):

| Area | Commits / PR | Runtime impact |
|------|----------------|----------------|
| **A2A swarm** | PR #7 `music-video-a2a-swarm` | Writer / DP / Editor delegation; new tool flow |
| **Hybrid genre catalog** | ~25 deep packs + family templates | `select_genre_pack`, `data/genres/*` |
| **Production pipeline** | PR #6 `production-render-pipeline` | Real Veo, headless assembly, GCS provenance |
| **Grafana MCP** | Grafana + Agent Observability | Optional `grafana_*` tools; OTLP to Grafana Cloud |
| **Deploy fix** | MCP SDK peer + `NODE_PATH` in Dockerfile | Agent Engine boot / MCP loading |

If production still runs a build **before** these merges, Pixels users will not see swarm behavior, expanded genres, or live render tools until this repo is redeployed.

---

## Pre-deploy blockers (fix before ship)

### 1. Dockerfile missing `data/genres/`

`lib/genre.ts` reads `data/genres/catalog.json` and `families.json` at runtime. The current `Dockerfile` copies `skills/` but **not** `data/`. Without a fix, deployed `select_genre_pack` will fall back or error.

**Action:** Add to `Dockerfile` before ship:

```dockerfile
COPY data ./data
```

Verify locally: `docker build -t cd-test . && docker run --rm cd-test ls -la data/genres/`

### 2. `PIXELS_HEADLESS_API_KEY` not in `npm run deploy`

`package.json` deploy script sets `PIXELS_HEADLESS_URL` but not the bearer token. Production assembly calls headless with `Authorization: Bearer …` when the key is set.

**Action:** If headless requires auth, add to deploy (do not commit the secret):

```bash
agents-cli deploy --project creative-ai-491118 --region us-east1 \
  --update-env-vars "...,PIXELS_HEADLESS_API_KEY=<from Cloud Run PIXELS_API_KEY>"
```

### 3. Optional Grafana runtime env

Hosted Grafana MCP needs self-hosted MCP + token on Agent Runtime (see `scripts/grafana-runtime-env.example.sh`). Not required for Pixels chat; required for `grafana_*` tools in production.

---

## Ship updates live — checklist

### Phase A — Preflight (this repo)

- [ ] On `main` with intended release commit (synced Origin clone).
- [ ] **Human approval** to deploy (per `AGENTS.md`).
- [ ] Fix Dockerfile `data/` copy if not already merged.
- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] (Recommended) Local eval: `npm run adk:api` + `npm run adk:proxy` + `npm run eval`
- [ ] `gcloud auth application-default login` (deployer account)
- [ ] `gcloud config set project creative-ai-491118`
- [ ] `uv tool install google-agents-cli` (or upgrade to match `agents-cli-manifest.yaml` `acli_version`)

### Phase B — Deploy Agent Engine

```bash
cd creative-director
npm run deploy
```

Equivalent explicit command:

```bash
agents-cli deploy \
  --project creative-ai-491118 \
  --region us-east1 \
  --update-env-vars "CREATIVE_DIRECTOR_MODE=production,RENDERS_GCS_BUCKET=creative-ai-491118-creative-pixels-renders,VERTEX_LOCATION=us-central1,PIXELS_HEADLESS_URL=https://pixels-headless-3ortoh2aiq-uc.a.run.app"
```

Add secrets via extra `--update-env-vars` keys as needed (`PIXELS_HEADLESS_API_KEY`, `GRAFANA_MCP_URL`, etc.).

**Wait** for deploy to finish (image build + Agent Engine update). Check Console → Agent Engines → **creative-director-ai** → deployment status.

### Phase C — Verify engine ID (unchanged)

- [ ] Resource name still ends with `7129954674127405056` (or note new ID if infra was recreated).
- [ ] Region `us-east1`.
- [ ] Service account: `creative-director-ai-app@creative-ai-491118.iam.gserviceaccount.com` (from Terraform).

### Phase D — Confirm Pixels wiring (edit-pixels / Vercel)

**If engine ID unchanged → usually no Pixels code deploy.** Only verify env:

| Vercel env (`create.creativeplatform.xyz`) | Expected |
|--------------------------------------------|----------|
| `VERTEX_REASONING_ENGINE_ID` | `7129954674127405056` (or full resource name — match what `api/director.ts` expects) |
| `VERTEX_LOCATION` | `us-east1` |
| `GOOGLE_CLOUD_PROJECT` / project id vars | `creative-ai-491118` |
| WIF / OIDC vars | Pool + provider allowing Vercel → `roles/aiplatform.user` (or custom invoker) |

**If engine ID changed → required Pixels change:**

- [ ] Update `VERTEX_REASONING_ENGINE_ID` in Vercel Production.
- [ ] Redeploy Vercel (or wait for env-only propagation).
- [ ] No Firestore migration needed for engine swap; existing session docs remain but **new** Agent Engine sessions won't map to old engine session IDs.

**Pixels-side code changes:** Not required for this repo's recent features (swarm, genres, render tools are server-side). Only if `api/director.ts` changes SSE contract, auth headers, or engine API version.

### Phase E — Smoke tests

**1. Console / API (no Pixels)**

- Agent Platform → select engine → send a planning brief (“30s dark pop storyboard at 120 BPM”).
- Expect: `select_genre_pack` → writer/dp style reply, **no** fake GCS URLs.

**2. Pixels UI**

- Open `https://create.creativeplatform.xyz` → Creative Director chat.
- Planning: same brief; confirm streaming SSE and genre-aware storyboard.
- (Optional, billing) Production: explicit “approved, render” after HITL; confirm Veo/GCS only if intended.

**3. Traces**

- [Agent Engine Traces](https://console.cloud.google.com/vertex-ai/agents/agent-engines) or Cloud Trace.
- Confirm `OTEL_SERVICE_NAME=creative-director-ai` spans after a request.

**4. Headless (only if testing assembly)**

- Agent logs / tool errors for `assemble_and_sync_timeline`.
- Headless URL reachable from Agent Engine SA (not from browser).

---

## What G2 must click (when CLI isn’t enough)

### Google Cloud Console

1. **Agent Engines** — confirm deploy succeeded, note engine ID and region.
2. **IAM** — deployer has `roles/aiplatform.user`, `roles/storage.admin` (or CI SA with same).
3. **Workload Identity Federation** — pool/provider trusted by Vercel; grant invoker access to Reasoning Engine for the WIF principal used by `api/director.ts`.
4. **APIs enabled** — `aiplatform.googleapis.com`, `logging.googleapis.com`, `cloudtrace.googleapis.com`.
5. **Billing** — project `creative-ai-491118` active; understand Veo + `min_instances: 1` cost.

### Vercel (create.creativeplatform.xyz)

1. **Settings → Environment Variables** — verify `VERTEX_REASONING_ENGINE_ID`, `VERTEX_LOCATION`, project ID, WIF credentials.
2. **Redeploy** only if env vars changed.
3. **Functions logs** — tail `api/director` during smoke test.

### Cloud Run (headless only — separate ship)

- `g2-1/edit-pixels` → `headless/deploy-cloudrun.sh`
- Only needed for assembly/C2PA API changes, **not** for Creative Director agent logic.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Billing** | Production mode + `min_instances: 1` keeps a warm Agent Engine instance; Veo calls bill per generation. Use planning mode in staging engine if you create one. |
| **Auth / WIF** | Deploy does not touch Vercel WIF. If smoke fails with 403, fix IAM/WIF before re-deploying agent code. |
| **Session IDs** | Pixels Firestore sessions ≠ Agent Engine session IDs unless explicitly correlated. Redeploy **in-place** preserves engine resource; existing AE sessions may reset on new revision — treat as soft break for in-flight chats. |
| **Staging vs prod engines** | Today one prod engine ID. For staging, provision a **second** Reasoning Engine (separate Terraform apply or Console) and point a Vercel preview env at it. |
| **Region confusion** | Agent Engine: `us-east1`. Gemini model: `global`. Veo: `us-central1`. Do not set `GOOGLE_CLOUD_LOCATION=us-east1` for the model. |
| **Missing `data/` in image** | Genre catalog broken in prod until Dockerfile fixed. |
| **Headless auth** | Missing `PIXELS_HEADLESS_API_KEY` → assembly tools fail at runtime. |
| **Terraform drift** | Do not `terraform apply` expecting to push code — use `agents-cli deploy`. Terraform manages shell + IAM; deploy pushes code. |

---

## Open questions

1. **Is `7129954674127405056` still the active prod engine?** Confirm in Console; update this doc if superseded.
2. **Does `api/director.ts` expect numeric ID or full `projects/.../reasoningEngines/...` string?** Align Vercel `VERTEX_REASONING_ENGINE_ID` format.
3. **Is `PIXELS_HEADLESS_API_KEY` already set on the live Agent Engine env?** Not in committed `npm run deploy`; verify in Console → engine → Environment variables.
4. **Dockerfile `data/` fix** — ship as a separate PR before or with the first post-catalog deploy?
5. **Staging engine** — do we want a second Reasoning Engine + Vercel preview env before prod deploy?
6. **Grafana / Agento11y tokens** — should prod Agent Engine export OTLP to Grafana (`AGENTO11Y_*`, `OTEL_EXPORTER_OTLP_*`)? Optional for Pixels UX.
7. **Remote A2A** — `WRITER_A2A_CARD_URL` / `DP_A2A_CARD_URL` / `EDITOR_A2A_CARD_URL` unset = in-process specialists (current default). Confirm we are not pointing at external card URLs in prod.

---

## Quick reference

```bash
# Install CLI (once)
uv tool install google-agents-cli

# Preflight
npm run typecheck && npm run test:unit

# Deploy (after approval)
npm run deploy

# Verify engine
gcloud ai reasoning-engines list --project=creative-ai-491118 --region=us-east1
```

**Related docs:** [README.md](./README.md) (local dev, eval, observability), [AGENTS.md](./AGENTS.md) (agent workflow), [deployment/terraform/single-project/vars/env.tfvars](./deployment/terraform/single-project/vars/env.tfvars) (infra defaults).
