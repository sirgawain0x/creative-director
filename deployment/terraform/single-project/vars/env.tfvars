# Project name used for resource naming
project_name = "creative-director-ai"

# Your Google Cloud project id
project_id = "creative-ai-491118"

# The Google Cloud region you will use to deploy the infrastructure
region = "us-east1"

# Production render pipeline (Phase 1): real generate_video_cut via Vertex + GCS
creative_director_mode = "production"
vertex_location        = "us-central1"
pixels_headless_url    = "https://pixels-headless-3ortoh2aiq-uc.a.run.app"
# pixels_headless_api_key — set via `agents-cli deploy --update-env-vars` (do not commit)
# renders_gcs_bucket_name = "creative-ai-491118-creative-pixels-renders"  # optional override
# veo_tier    = "standard"
# veo_quality = "720p"
