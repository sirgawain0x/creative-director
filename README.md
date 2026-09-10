# Creative Director AI (Google ADK TypeScript)

Autonomous AI Music Video Director built with the **Agent Development Kit (ADK)** on TypeScript, using `gemini-3.5-flash` via Agent Platform / Vertex AI.

<img width="1706" height="391" alt="Screenshot 2026-08-31 at 8 43 47 PM" src="https://github.com/user-attachments/assets/8c6f4f6f-8734-4857-8031-3e1a5c2940ae" />

<img width="1444" height="788" alt="Screenshot 2026-08-31 at 8 44 14 PM" src="https://github.com/user-attachments/assets/de51e304-fb80-46da-95c1-b23a95ddc672" />



## Prerequisites

- Node.js `>= 24.13.0`
- npm `>= 11.8.0`
- Google Cloud CLI (`gcloud`) with Application Default Credentials
- IAM on your project ([Agent Runtime docs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime/quickstart-adk)):
  - Agent Platform User (`roles/aiplatform.user`)
  - Storage Admin (`roles/storage.admin`) — for deploy staging / artifacts
  - Permission to enable APIs (`serviceusage.services.enable`) or ask an admin

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set a real `GOOGLE_CLOUD_PROJECT`. Use:

```bash
GOOGLE_GENAI_USE_ENTERPRISE=1
GOOGLE_CLOUD_LOCATION=global
```

(`GOOGLE_GENAI_USE_VERTEXAI` still works but is **deprecated** in ADK 2.x.)

3. Authenticate and enable required APIs:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable \
  aiplatform.googleapis.com \
  cloudtrace.googleapis.com \
  logging.googleapis.com \
  telemetry.googleapis.com \
  --project=YOUR_PROJECT_ID
```

4. Typecheck:

```bash
npm run typecheck
```

## Agent modes

| Mode | Env | Behavior |
|------|-----|----------|
| **Planning** (default) | unset or `CREATIVE_DIRECTOR_MODE=planning` | Research + storyboard only |
| **Production** | `CREATIVE_DIRECTOR_MODE=production` | Full tool loop; video/C2PA tools are **mocks** |

## Grafana Cloud MCP (optional)

Wire Grafana into the director for render-pipeline observability (hackathon partner track–compatible). Tools are prefixed `grafana_`.

**Activate (local):**

1. In Grafana Cloud (`https://thecreative.grafana.net`), accept **Grafana Assistant** terms (admin). Editor+ has MCP access by default.
2. Ensure `.env` has `GRAFANA_URL=https://thecreative.grafana.net` (no `GRAFANA_MCP_URL` for Cloud OAuth).
3. Run `npm run adk:web` — complete browser OAuth on first MCP connect (deny write if query-only).
4. Ask the director to list datasources or query Loki; expect `grafana_*` tools.

| Env | Purpose |
|-----|---------|
| `GRAFANA_URL` | Your stack, e.g. `https://thecreative.grafana.net` — uses hosted `https://mcp.grafana.com/mcp` (OAuth on first connect) |
| `GRAFANA_MCP_URL` | Self-hosted / open-source Grafana MCP endpoint (preferred for unattended Agent Runtime) |
| `GRAFANA_SERVICE_ACCOUNT_TOKEN` | Bearer token for self-hosted MCP |
| `GRAFANA_CLOUD_MCP_URL` | Override hosted MCP URL (default `https://mcp.grafana.com/mcp`) |

```bash
# Confirm Cloud MCP env (no secrets printed)
npm run grafana:verify

# Local demo (browser OAuth once on first grafana_* tool use)
npm run adk:web
```

Open http://localhost:8000/dev-ui/ — select **agent**, then ask to list Grafana datasources. Complete OAuth in the browser when prompted.

### Agent Runtime Grafana

1. Create a Grafana service account + token (`glsa_…`) with Viewer/Editor as needed.
2. Run open-source Grafana MCP against `https://thecreative.grafana.net` (token auth).
3. Update runtime env (requires deploy approval):

```bash
# Dry-run the update-env-vars command (token redacted in output):
# export GRAFANA_MCP_URL='https://YOUR_MCP_HOST/mcp'
# export GRAFANA_SERVICE_ACCOUNT_TOKEN='glsa_...'
# ./scripts/grafana-runtime-env.example.sh

agents-cli deploy --update-env-vars "GRAFANA_MCP_URL=https://YOUR_MCP_HOST/mcp,GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_..."
```

`GRAFANA_MCP_URL` takes precedence over `GRAFANA_URL` in [`lib/grafana-mcp.ts`](lib/grafana-mcp.ts).

## Run locally

```bash
npm run adk:run
# or
npm run adk:web
```

Mock production pipeline:

```bash
CREATIVE_DIRECTOR_MODE=production npm run adk:run
```

## Reproducible Testing

Anyone with GCP ADC and this repo can reproduce the same checks below.

### Prerequisites (one-time)

1. Complete [Setup](#setup) (deps, `.env`, `gcloud auth application-default login`).
2. Install the Agents CLI:

```bash
uv tool install google-agents-cli
```

3. Leave `CREATIVE_DIRECTOR_MODE` unset (or `planning`) so evals exercise research/storyboard behavior, not the mock production tools.

### Static check

```bash
npm run typecheck
```

### Agent evaluation

`agents-cli eval run` does **not** load TypeScript agents in-process. Point it at a local ADK API server, and use the camelCase proxy (agents-cli sends snake_case; TS ADK expects camelCase).

Run these in three terminals from the repo root:

```bash
# terminal 1 — ADK API on :8765
npm run adk:api

# terminal 2 — snake_case → camelCase proxy on :8766
npm run adk:proxy

# terminal 3 — grade against the basic dataset
npm run eval
```

| Piece | Path / port |
|-------|-------------|
| Dataset | [`tests/eval/datasets/basic-dataset.json`](tests/eval/datasets/basic-dataset.json) (2 planning cases) |
| Metrics | [`tests/eval/eval_config.yaml`](tests/eval/eval_config.yaml) (`multi_turn_task_success`, `no_fake_asset_urls`) |
| API | `http://127.0.0.1:8765` |
| Eval URL | `http://127.0.0.1:8766` (via proxy) |
| Results | `artifacts/grade_results/results_<timestamp>.{json,html}` |

Expected: both cases pass; planning replies must not invent GCS/`mock_cut` download URLs or claim C2PA signing.

Optional follow-ups after a baseline:

```bash
agents-cli eval compare artifacts/grade_results/results_OLD.json artifacts/grade_results/results_NEW.json
agents-cli eval analyze --results artifacts/grade_results/results_<timestamp>.json
```

## Deploy to Agent Runtime

**Pixels / production wiring:** see [DEPLOY-PLAYBOOK.md](./DEPLOY-PLAYBOOK.md) for architecture (Pixels → Vercel `api/director` → Vertex Engine), ship checklist, smoke tests, and risks. Do not confuse Agent Engine deploy with Pixels headless Cloud Run.

Deploy with `agents-cli` (Agent Runtime / Agent Engine):

1. Provision infrastructure (service account, IAM, telemetry bucket — first time only):

```bash
agents-cli infra single-project --project YOUR_PROJECT_ID
```

2. Deploy:

```bash
npm run deploy
# or
agents-cli deploy --project YOUR_PROJECT_ID --region us-east1
```

- `--region` is the **Agent Runtime** region (e.g. `us-east1` in `deployment/terraform/single-project/vars/env.tfvars`).
- Model calls always use Gemini `location: "global"` in code (required for gemini-3.x). Do not point the model at the Agent Runtime region.
- Managed sessions are created automatically on deploy.

After deploy, query the remote agent from the Cloud console or the Agent Engine client APIs.

## Observability

Agent traces use **standard OpenTelemetry OTLP exporters** (not the deprecated
`@google-cloud/opentelemetry-cloud-*-exporter` packages).

**Local / Grafana:** set `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`
(and Agent Observability `AGENTO11Y_*` vars). ADK enables OTLP automatically when those
env vars are present — scripts no longer pass `--otel_to_cloud`.

**Optional Cloud Trace via OTLP:** set `GOOGLE_CLOUD_OTLP_TELEMETRY=1` to also export
to `https://telemetry.googleapis.com` with Application Default Credentials (see
[Google’s OTLP migration guide](https://github.com/GoogleCloudPlatform/opentelemetry-operations-js/blob/main/MIGRATION.md)).

The deployed container sets:

| Variable | Value |
|----------|-------|
| `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY` | `true` |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `gen_ai_latest_experimental` |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `EVENT_ONLY` |

Copy the telemetry vars from [`.env.example`](.env.example) into your `.env` for full parity.

**View traces (deployed agent):**

1. [Agent Platform Deployments](https://console.cloud.google.com/vertex-ai/agents/agent-engines) → select your instance → **Traces** tab (Session view or Span view).
2. Fallback: [Cloud Console → Trace → Trace explorer](https://console.cloud.google.com/traces).
3. Local Grafana Agent Observability: your stack’s Agent Observability app + Tempo.

Prompt and response content appears in **Cloud Logging** events (`EVENT_ONLY`), not in trace span attributes. Ensure you have end-user consent and data handling policies in place before collecting this data in production.

## Genre catalog

Briefs resolve through a hybrid catalog: deep markdown packs, family templates, or a generic craft fallback (`select_genre_pack` / `resolveGenrePack`).

Data lives in [`data/genres/catalog.json`](data/genres/catalog.json) and [`data/genres/families.json`](data/genres/families.json). Deep packs live under [`skills/genres/`](skills/genres/).

### Extend the catalog

1. **Add aliases** — edit `data/genres/catalog.json`. Add strings to `appleAliases` and/or `spotifyAliases` on an existing entry (or add a new entry with `id`, `label`, aliases, and `family`). Matching uses `normalizeGenreKey` (`&` → `and`, hyphens/underscores → spaces).
2. **Template-only genres** — set `family` to one of: `urban`, `electronic`, `pop`, `rock`, `acoustic`, `global`, `metal`, `dance`, `jazz-soul`, `experimental`. Omit `deepPack` so resolution expands that family template at runtime.
3. **Promote to deep** — add `skills/genres/<id>.md` with these four headers, then set `"deepPack": "<id>"` on the catalog entry:

```markdown
# [Genre Label] Visual Bible

## Visual Palette
...

## Core Motifs
...

## Camera & Pacing
...

## Narrative & Stylistic Directives
...
```

Catalog updates are PR-based JSON/markdown edits (no live Spotify/Apple sync in v1).

## Clean up

Delete the Reasoning Engine / Agent Engine resource in Cloud Console, or use the Agent Platform SDK `delete(force=True)` equivalent for your deployment ID, to avoid ongoing charges.
