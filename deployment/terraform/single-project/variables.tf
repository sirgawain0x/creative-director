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

variable "project_name" {
  type        = string
  description = "Project name used as a base for resource naming"
  default     = "creative-director-ai"
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID for resource deployment."
}

variable "region" {
  type        = string
  description = "Google Cloud region for resource deployment."
  default     = "us-east1"
}

variable "telemetry_logs_filter" {
  type        = string
  description = "Log Sink filter for capturing telemetry data. Captures logs with the `traceloop.association.properties.log_type` attribute set to `tracing`."
  default     = "labels.service_name=\"creative-director-ai\" labels.type=\"agent_telemetry\""
}

variable "app_sa_roles" {
  description = "List of roles to assign to the application service account"
  type        = list(string)
  default = [

    "roles/aiplatform.user",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
    "roles/storage.admin",
    "roles/serviceusage.serviceUsageConsumer",
  ]
}

variable "creative_director_mode" {
  type        = string
  description = "Agent mode: planning (research/storyboard) or production (real generate_video_cut via Vertex + GCS)."
  default     = "planning"

  validation {
    condition     = contains(["planning", "production"], var.creative_director_mode)
    error_message = "creative_director_mode must be planning or production."
  }
}

variable "vertex_location" {
  type        = string
  description = "Vertex AI region for Gemini image + Veo video LRO (must match a Veo-supported location)."
  default     = "us-central1"
}

variable "renders_gcs_bucket_name" {
  type        = string
  description = "GCS bucket for rendered video clips. When null, defaults to {project_id}-creative-pixels-renders."
  default     = null
}

variable "veo_tier" {
  type        = string
  description = "Optional Veo tier override (standard, fast, lite). Leave empty for tool default (standard)."
  default     = ""
}

variable "veo_quality" {
  type        = string
  description = "Optional Veo output quality (720p, 1080p, 4K). Leave empty for tool default (720p)."
  default     = ""
}

variable "pixels_headless_url" {
  type        = string
  description = "Pixels headless Cloud Run base URL for assemble_and_sync_timeline (Phase 2)."
  default     = ""
}

variable "pixels_headless_api_key" {
  type        = string
  description = "Bearer token for Pixels headless API (PIXELS_API_KEY on the Cloud Run service)."
  default     = ""
  sensitive   = true
}
