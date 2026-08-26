# Creative Director AI (Google ADK TypeScript)

Autonomous AI Music Video Director built with the **Agent Development Kit (ADK)** on TypeScript, using `gemini-3.5-flash` via Agent Platform / Vertex AI.

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

3. Authenticate and enable Vertex AI:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
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

## Evaluation

`agents-cli eval run` does **not** load TypeScript agents in-process. Point it at a local ADK API server, and use the camelCase proxy (agents-cli sends snake_case; TS ADK expects camelCase):

```bash
# terminal 1
npm run adk:api

# terminal 2
npm run adk:proxy

# terminal 3
npm run eval
```

Metrics live in [`tests/eval/eval_config.yaml`](tests/eval/eval_config.yaml). Results land under `artifacts/`.

## Deploy to Agent Runtime (Agent Engine)

TypeScript ADK deploys with the CLI (equivalent to the Python `AdkApp` + `client.agent_engines.create` flow):

1. Create an Artifact Registry Docker repo and note its name.
2. Optionally create a GCS staging bucket (`gs://...`) for artifacts.
3. Deploy:

```bash
npm run adk:deploy -- \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --repository YOUR_AR_REPO
```

- `--region` is the **Agent Engine** region (e.g. `us-central1`).
- Model calls always use Gemini `location: "global"` in code (required for gemini-3.x). Do not point the model at the Agent Engine region.
- Managed sessions are created automatically on deploy (same as the ADK Agent Runtime quickstart).

After deploy, query the remote agent from the Cloud console or the Agent Engine client APIs.

## Clean up

Delete the Reasoning Engine / Agent Engine resource in Cloud Console, or use the Agent Platform SDK `delete(force=True)` equivalent for your deployment ID, to avoid ongoing charges.
