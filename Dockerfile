# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM node:24-alpine

WORKDIR /app

ENV GOOGLE_GENAI_USE_VERTEXAI=1
ENV GOOGLE_CLOUD_LOCATION=global
# So ADK temp-bundle createRequire can resolve optional peers (MCP SDK).
ENV NODE_PATH=/app/node_modules

# Agent Runtime telemetry (Cloud Trace + EVENT_ONLY prompt/response in logs)
ENV GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true
ENV OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
ENV OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=EVENT_ONLY

COPY package.json package-lock.json agent.ts tsconfig.json ./
COPY lib ./lib
COPY tools ./tools
COPY agents ./agents
COPY skills ./skills

RUN npm ci --omit=dev

RUN adduser --disabled-password --gecos "" myuser \
  && chown -R myuser:myuser /app

USER myuser

EXPOSE 8080

CMD ["npx", "adk", "api_server", "agent.ts", "--port", "8080", "--host", "0.0.0.0"]
