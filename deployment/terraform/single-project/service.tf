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

locals {
  dummy_source_b64 = trimspace(file("${path.module}/../shared/dummy_source.b64"))

  renders_bucket_name = coalesce(
    var.renders_gcs_bucket_name,
    "${var.project_id}-creative-pixels-renders",
  )

  production_render_env = var.creative_director_mode == "production" ? {
    CREATIVE_DIRECTOR_MODE = "production"
    RENDERS_GCS_BUCKET     = local.renders_bucket_name
    VERTEX_LOCATION        = var.vertex_location
  } : {
    CREATIVE_DIRECTOR_MODE = "planning"
  }

  optional_veo_env = merge(
    var.veo_tier != "" ? { VEO_TIER = var.veo_tier } : {},
    var.veo_quality != "" ? { VEO_QUALITY = var.veo_quality } : {},
  )

  optional_headless_env = merge(
    var.pixels_headless_url != "" ? { PIXELS_HEADLESS_URL = var.pixels_headless_url } : {},
    var.pixels_headless_api_key != "" ? { PIXELS_HEADLESS_API_KEY = var.pixels_headless_api_key } : {},
  )

  agent_env = merge(local.production_render_env, local.optional_veo_env, local.optional_headless_env)
}

resource "google_vertex_ai_reasoning_engine" "app" {
  display_name = var.project_name
  description  = "Agent deployed via Terraform"
  region       = var.region
  project      = var.project_id

  spec {
    agent_framework = "google-adk"
    service_account = google_service_account.app_sa.email

    deployment_spec {
      min_instances         = 1
      max_instances         = 10
      container_concurrency = 9

      resource_limits = {
        cpu    = "4"
        memory = "8Gi"
      }

      env {
        name  = "LOGS_BUCKET_NAME"
        value = google_storage_bucket.logs_data_bucket.name
      }

      # GOOGLE_CLOUD_PROJECT is reserved by Agent Runtime (the platform injects
      # it) and rejected in deployment_spec.env; GOOGLE_CLOUD_LOCATION is allowed.
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = "global"
      }

      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "True"
      }

      env {
        name  = "OTEL_SERVICE_NAME"
        value = "creative-director-ai"
      }

      env {
        name  = "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT"
        value = "EVENT_ONLY"
      }

      env {
        name  = "ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS"
        value = "false"
      }

      env {
        name  = "OTEL_SEMCONV_STABILITY_OPT_IN"
        value = "gen_ai_latest_experimental"
      }

      env {
        name  = "OTEL_INSTRUMENTATION_GENAI_UPLOAD_FORMAT"
        value = "jsonl"
      }

      env {
        name  = "OTEL_INSTRUMENTATION_GENAI_COMPLETION_HOOK"
        value = "upload"
      }

      env {
        name  = "OTEL_INSTRUMENTATION_GENAI_UPLOAD_BASE_PATH"
        value = "gs://${google_storage_bucket.logs_data_bucket.name}/completions"
      }

      env {
        name  = "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY"
        value = "true"
      }

      # Production render pipeline (Phase 1). Redeploy via agents-cli after
      # changing creative_director_mode / vertex_location / bucket settings —
      # deployment_spec is ignored by lifecycle below once the agent exists.
      dynamic "env" {
        for_each = local.agent_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }

    source_code_spec {
      inline_source {
        source_archive = local.dummy_source_b64
      }
      image_spec {}
    }
  }

  # Terraform creates the resource with a placeholder source build; CI/CD
  # overwrites the same source_code_spec with the real code. The deploy writes
  # source_code_spec, so the placeholder must use it too — a container_spec
  # placeholder would be left alongside it and Agent Engine rejects the update.
  # Ignore the spec and deployment_spec so Terraform never reverts the deployed agent.
  lifecycle {
    ignore_changes = [
      spec[0].container_spec,
      spec[0].source_code_spec,
      spec[0].deployment_spec,
    ]
  }

  # Make dependencies conditional to avoid errors.
  depends_on = [google_project_service.services]
}
