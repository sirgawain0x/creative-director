import {AgentTool, App, FunctionTool, LlmAgent} from '@google/adk';
import {z} from 'zod';
import {dpAgent} from './agents/dp.js';
import {
  planningSwarmInstruction,
  productionSwarmWorkflow,
} from './agents/director-instructions.js';
import {editorAgent} from './agents/editor.js';
import {searchSpecialist, urlSpecialist} from './agents/research.js';
import {specialistAgentTool} from './agents/specialist-tool.js';
import {writerAgent} from './agents/writer.js';
import {
  createAgento11yBootstrap,
  setupGcpOtlpProvidersOnly,
} from './lib/agento11y.js';
import {isGcpOtlpTelemetryEnabled} from './lib/otel-gcp-otlp.js';
import {
  createGrafanaMcpToolset,
  isGrafanaMcpConfigured,
} from './lib/grafana-mcp.js';
import {resolveGenrePack} from './lib/genre.js';
import {creativeDirectorModel} from './lib/model.js';
import {
  isC2paEmbedConfigured,
  isHeadlessAssemblyConfigured,
  isLegacyVertexRenderConfigured,
  isPixelsGenerateConfigured,
  isProductionRenderConfigured,
  isProvenanceConfigured,
} from './lib/render-config.js';
import {assembleAndSyncTimeline} from './tools/assemble-timeline.js';
import {confirmBatchRender} from './tools/confirm-batch-render.js';
import {generateVideoCut} from './tools/generate-video-cut.js';
import {quoteBatchRender} from './tools/quote-batch-render.js';
import {signC2paManifest} from './tools/sign-c2pa-manifest.js';

/** `planning` (default) = research + storyboard only. `production` = also call mock render tools. */
const agentMode =
  process.env.CREATIVE_DIRECTOR_MODE?.toLowerCase() === 'production'
    ? 'production'
    : 'planning';

const MOCK_NOTICE =
  'MOCK ONLY — no real video, GCS object, or C2PA signature was created. Do not present this URL as a downloadable asset.';

const pixelsGenerateEnabled = isPixelsGenerateConfigured();
const legacyVertexRenderEnabled = isLegacyVertexRenderConfigured();
const productionRenderEnabled = isProductionRenderConfigured();
const headlessAssemblyEnabled =
  productionRenderEnabled && isHeadlessAssemblyConfigured();
const provenanceEnabled =
  productionRenderEnabled && isProvenanceConfigured();
const c2paEmbedEnabled =
  productionRenderEnabled && isC2paEmbedConfigured();
const grafanaMcpEnabled = isGrafanaMcpConfigured();
const grafanaMcpToolset = createGrafanaMcpToolset();
const grafanaTools = grafanaMcpToolset ? [grafanaMcpToolset] : [];

const selectGenrePackTool = new FunctionTool({
  name: 'select_genre_pack',
  description:
    'Resolve a hybrid catalog genre pack from the user brief: deep skill packs when available, otherwise style-family templates, with generic fallback and optional warning. Call before writer_agent or dp_agent; pass pack text verbatim into those tools.',
  parameters: z.object({
    brief: z
      .string()
      .describe('User brief including genre, mood, and musical style'),
  }),
  execute: async ({brief}) => resolveGenrePack(brief),
});

const writerTool = specialistAgentTool(
  writerAgent,
  'WRITER_A2A_CARD_URL',
  'Writes music-video treatments: narrative arc, lyric-theme mapping, and what not to show.',
);
const dpTool = specialistAgentTool(
  dpAgent,
  'DP_A2A_CARD_URL',
  'Director of photography: beat-synced shot list, camera, lighting, and Veo-ready visual prompts.',
);
const editorTool = specialistAgentTool(
  editorAgent,
  'EDITOR_A2A_CARD_URL',
  'Picture editor: clip order, BPM/transition notes, and assemble_and_sync_timeline arguments.',
);

const researchTools = [
  selectGenrePackTool,
  writerTool,
  dpTool,
  new AgentTool({agent: searchSpecialist}),
  new AgentTool({agent: urlSpecialist}),
  ...grafanaTools,
];

// ----------------------------------------------------------------------
// Production render tools — Pixels Generate quote/confirm (Phase 2) or legacy Vertex
// ----------------------------------------------------------------------
const quoteBatchRenderTool = new FunctionTool({
  name: 'quote_batch_render',
  description:
    'After storyboard approval, price all shots via Pixels Generate (Veo or Seedance per shot). Returns batch_quote_id and per-shot CRTVAI estimates. Does NOT spend or render.',
  parameters: z.object({
    shots: z
      .array(
        z.object({
          scene_index: z.number(),
          timestamp_start: z.string(),
          timestamp_end: z.string(),
          duration_seconds: z.number().optional(),
          visual_prompt: z.string(),
          camera_movement: z.string(),
          lighting: z.string().optional(),
          consistent_character: z.boolean().optional(),
        }),
      )
      .min(1),
    preferred_provider: z
      .enum(['veo', 'seedance'])
      .optional()
      .describe('User provider preference when set'),
    consistent_character: z
      .boolean()
      .optional()
      .describe('When true, default provider is Seedance for character consistency'),
    aspect_ratio: z
      .enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])
      .optional(),
    resolution: z.enum(['480p', '720p']).optional(),
    wallet_address: z.string().optional(),
    access_token: z.string().optional(),
  }),
  execute: async (params) => quoteBatchRender(params),
});

const confirmBatchRenderTool = new FunctionTool({
  name: 'confirm_batch_render',
  description:
    'After explicit user confirmation of a batch quote, start Pixels Generate jobs (Veo or Seedance). Returns job request_ids — never fake clip URLs.',
  parameters: z.object({
    batch_quote_id: z.string(),
    user_confirmed: z
      .boolean()
      .describe('Must be true — explicit human approval to spend CRTVAI'),
    access_token: z.string().optional(),
    wallet_address: z.string().optional(),
    payment_tx_hash: z.string().optional(),
  }),
  execute: async (params) => confirmBatchRender(params),
});

const generateVideoCutTool = new FunctionTool({
  name: 'generate_video_cut',
  description: pixelsGenerateEnabled
    ? 'DEPRECATED in production — use quote_batch_render then confirm_batch_render. Does not render.'
    : legacyVertexRenderEnabled
      ? 'Renders a cinematic video cut via Gemini (start frame) + Veo 3.1 i2v, uploads MP4 to GCS, and returns the clip URL.'
      : agentMode === 'production'
        ? 'DISABLED — use quote_batch_render and confirm_batch_render. Never returns fake URLs.'
        : 'Planning mode only — do not call in planning.',
  parameters: z.object({
    scene_index: z.number().describe('The sequence number of the scene (1, 2, 3...)'),
    timestamp_start: z.string().describe('Start timestamp (e.g. 00:00)'),
    timestamp_end: z.string().describe('End timestamp (e.g. 00:15)'),
    duration_seconds: z.number().describe('Duration of the shot in seconds'),
    visual_prompt: z
      .string()
      .describe(
        'Detailed visual prompt with lighting, camera movement, and subject action',
      ),
    camera_movement: z
      .string()
      .describe('e.g. slow drone aerial, dolly tracking in, handheld orbit'),
  }),
  execute: async (params) => {
    if (pixelsGenerateEnabled || agentMode === 'production') {
      return {
        mock: false,
        status: 'use_batch_quote_flow',
        notice:
          'Call quote_batch_render after storyboard approval, then confirm_batch_render after the user confirms the batch quote. Do not invent clip URLs.',
      };
    }
    if (legacyVertexRenderEnabled) {
      return generateVideoCut(params);
    }
    return {
      mock: false,
      status: 'render_unavailable',
      notice:
        'No render backend configured. Set PIXELS_API_BASE_URL or RENDERS_GCS_BUCKET + Vertex.',
    };
  },
});

const assembleTimelineTool = new FunctionTool({
  name: 'assemble_and_sync_timeline',
  description: headlessAssemblyEnabled
    ? 'Stitches rendered clip URLs and master audio on Pixels headless, renders an MP4 master, and uploads to GCS.'
    : 'MOCK STUB: Simulates stitching cuts to a master timeline. Returns a fake master URL — does not assemble real video.',
  parameters: z.object({
    project_title: z.string().describe('The title of the video project'),
    clip_urls: z
      .array(z.string())
      .describe('List of rendered video clip URLs in sequential order'),
    audio_uri: z.string().describe('URI of the master audio file'),
    target_bpm: z.number().optional().describe('Detected BPM for transition cuts'),
  }),
  execute: async (params) => {
    if (headlessAssemblyEnabled) {
      return assembleAndSyncTimeline(params);
    }

    if (agentMode === 'production') {
      return {
        mock: false,
        status: 'assembly_unavailable',
        notice:
          'PIXELS_HEADLESS_URL not configured. Cannot assemble timeline — do not invent master URLs.',
        project: params.project_title,
        total_cuts: params.clip_urls.length,
      };
    }

    const {project_title, clip_urls} = params;
    const slug = project_title.toLowerCase().replace(/\s+/g, '_');
    return {
      mock: true,
      status: 'mock_assembled',
      notice: MOCK_NOTICE,
      project: project_title,
      total_cuts: clip_urls.length,
      master_timeline_url: `https://storage.googleapis.com/creative-pixels-renders/MOCK_${slug}_master.mp4`,
    };
  },
});

const signC2paTool = new FunctionTool({
  name: 'sign_c2pa_manifest',
  description: provenanceEnabled
    ? c2paEmbedEnabled
      ? 'Records C2PA provenance in GCS and cryptographically signs the master via Pixels headless (C2PA_HEADLESS_EMBED).'
      : 'Records C2PA provenance metadata in GCS (unsigned). Does not cryptographically sign — use Creative Pixels to complete signing.'
    : 'MOCK STUB: Simulates C2PA provenance signing. Returns fake metadata — does not sign a real file.',
  parameters: z.object({
    master_video_url: z.string().describe('URL of the compiled master video file'),
    creator_did: z.string().describe('Creator DID or wallet address for attribution'),
    ai_models_used: z
      .string()
      .describe(
        'List of generative AI models used (e.g. Gemini 3.5 Flash, Google Veo)',
      ),
    clip_urls: z
      .array(z.string())
      .optional()
      .describe('Source clip URLs used in the master (for C2PA ingredients)'),
    project_title: z
      .string()
      .optional()
      .describe('Project title for provenance metadata'),
  }),
  execute: async (params) => {
    if (provenanceEnabled) {
      return signC2paManifest(params);
    }

    if (agentMode === 'production') {
      return {
        mock: false,
        status: 'c2pa_unavailable',
        notice:
          'Provenance pipeline not configured. Cannot sign C2PA — do not claim signing occurred.',
        authenticated_file: params.master_video_url,
        issuer: params.creator_did,
      };
    }

    const {master_video_url, creator_did, ai_models_used} = params;
    return {
      mock: true,
      c2pa_status: 'mock_signed',
      notice: MOCK_NOTICE,
      authenticated_file: master_video_url,
      issuer: creator_did,
      manifest_summary: {
        engine: ai_models_used,
        provenance_standard: 'C2PA v2.1 (mock)',
        timestamp: new Date().toISOString(),
      },
    };
  },
});

const productionTools = [
  ...researchTools,
  editorTool,
  quoteBatchRenderTool,
  confirmBatchRenderTool,
  generateVideoCutTool,
  assembleTimelineTool,
  signC2paTool,
];

const planningAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description:
    'Planning-mode Creative Director: swarm research and beat-synced storyboards only (no video render).',
  model: creativeDirectorModel,
  instruction: planningSwarmInstruction(),
  tools: researchTools,
});

const PROVENANCE_RULES = c2paEmbedEnabled
  ? `- 'sign_c2pa_manifest' writes provenance sidecars and returns cryptographically_signed: true with signed_master_url when C2PA_HEADLESS_EMBED is enabled.
- Share signed_master_url, provenance_manifest_url, and ingredients_url when sign_c2pa_manifest returns mock: false.
- Pass clip_urls from generate_video_cut results into sign_c2pa_manifest for ingredient metadata.`
  : `- 'sign_c2pa_manifest' writes provenance sidecars to GCS but does NOT cryptographically sign (cryptographically_signed: false).
- Say explicitly the master is UNSIGNED until the user completes C2PA in Creative Pixels.
- Share provenance_manifest_url and unsigned_master_url when sign_c2pa_manifest returns mock: false.
- Pass clip_urls from generate_video_cut results into sign_c2pa_manifest for ingredient metadata.`;

const MOCK_PIPELINE_RULES = `- Every tool result with mock: true is a SIMULATION. Say so explicitly in your reply.
- Prefix any URL from tools with "MOCK (not downloadable):".
- Never tell the user a real file exists in GCS or that C2PA was cryptographically signed.
- Include a short "Mock pipeline" section summarizing stub outputs.`;

function batchQuoteNote(): string {
  if (pixelsGenerateEnabled) {
    return `'quote_batch_render' prices all storyboard shots (Veo or Seedance) and returns batch_quote_id — no CRTVAI spend.
'confirm_batch_render' starts real Pixels Generate jobs only after explicit user_confirmed: true.
Never invent clip URLs; only share output_video_url from confirm_batch_render jobs when present.`;
  }
  if (legacyVertexRenderEnabled) {
    return `'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.`;
  }
  return `'quote_batch_render' returns priced batch quotes. Configure PIXELS_API_BASE_URL for real renders via confirm_batch_render.`;
}

const productionAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description: productionRenderEnabled
    ? pixelsGenerateEnabled
      ? 'Production-mode Creative Director: swarm + Pixels Generate batch quote/confirm (Veo or Seedance).'
      : headlessAssemblyEnabled
        ? provenanceEnabled
          ? c2paEmbedEnabled
            ? 'Production-mode Creative Director: swarm + legacy Veo cuts, headless assembly, GCS provenance, and headless C2PA embed.'
            : 'Production-mode Creative Director: swarm + legacy Veo cuts, headless assembly, and GCS provenance (C2PA signing in Pixels UI).'
          : 'Production-mode Creative Director: swarm + legacy Veo cuts + headless timeline assembly.'
        : provenanceEnabled
          ? 'Production-mode Creative Director: swarm + legacy Veo cuts and GCS provenance metadata.'
          : 'Production-mode Creative Director: swarm + legacy Veo cuts to GCS.'
    : 'Production-mode Creative Director: swarm storyboard + batch quote flow (configure PIXELS_API_BASE_URL for renders).',
  model: creativeDirectorModel,
  instruction: productionRenderEnabled
    ? pixelsGenerateEnabled
      ? `You are Creative Director AI in PRODUCTION MODE (PIXELS GENERATE BATCH QUOTE).
${batchQuoteNote()}
After storyboard approval call quote_batch_render — present total CRTVAI and per-shot provider/cost.
Wait for explicit user confirmation before confirm_batch_render with user_confirmed: true.
Never auto-spend CRTVAI. Never invent GCS or mock_cut clip URLs.

${productionSwarmWorkflow(`STRICT RULES:
- Use quote_batch_render then confirm_batch_render — not generate_video_cut.
- Only share clip URLs from confirm_batch_render jobs[].output_video_url when returned by the API.
- Do not claim renders completed until jobs report completed status.
${headlessAssemblyEnabled ? "- After all clips complete, delegate assembly to editor_agent and call assemble_and_sync_timeline." : ''}
${provenanceEnabled ? PROVENANCE_RULES : ''}`)}`
      : headlessAssemblyEnabled
        ? provenanceEnabled
          ? c2paEmbedEnabled
            ? `You are Creative Director AI in PRODUCTION MODE (LEGACY VEO + ASSEMBLY + PROVENANCE + C2PA EMBED).
${batchQuoteNote()}
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' writes provenance sidecars and cryptographically signs the master via Pixels headless (cryptographically_signed: true, signed_master_url).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`)}`
            : `You are Creative Director AI in PRODUCTION MODE (LEGACY VEO + ASSEMBLY + PROVENANCE).
${batchQuoteNote()}
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' records C2PA provenance metadata in GCS (unsigned / pending_user_sign).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`)}`
          : `You are Creative Director AI in PRODUCTION MODE (LEGACY VEO + ASSEMBLY).
${batchQuoteNote()}
'assemble_and_sync_timeline' stitches those clips with master audio via Pixels headless and uploads a real master MP4.

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut and assemble_and_sync_timeline results with mock: false as real downloadable assets.`)}`
        : provenanceEnabled
          ? `You are Creative Director AI in PRODUCTION MODE (LEGACY VEO + PROVENANCE).
${batchQuoteNote()}
'sign_c2pa_manifest' records provenance metadata in GCS (unsigned).

${productionSwarmWorkflow(`STRICT RULES:
- generate_video_cut with mock: false are real clips.
${PROVENANCE_RULES}`)}`
          : `You are Creative Director AI in PRODUCTION MODE (LEGACY VEO PIPELINE).
${batchQuoteNote()}

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut results with mock: false as real downloadable clips; share clip_url as the asset link.
- Never invent download URLs.`)}`
    : `You are Creative Director AI in PRODUCTION MODE (QUOTE-ONLY UNTIL PIXELS API CONFIGURED).
${batchQuoteNote()}

${productionSwarmWorkflow(`STRICT RULES:
- Call quote_batch_render after storyboard approval; never invent clip URLs.
- confirm_batch_render requires PIXELS_API_BASE_URL on the agent runtime.
- Do not return mock GCS or mock_cut URLs.`)}`,
  tools: productionTools,
});

/** Active agent for `adk run` / `adk web`. Default: planning. Set CREATIVE_DIRECTOR_MODE=production for batch quote/render flow. */
export const rootAgent =
  agentMode === 'production' ? productionAgent : planningAgent;

const agento11yBootstrap = await createAgento11yBootstrap();
if (!agento11yBootstrap && isGcpOtlpTelemetryEnabled()) {
  await setupGcpOtlpProvidersOnly();
}
const agento11yPlugins = agento11yBootstrap ? [agento11yBootstrap.plugin] : [];

/**
 * Preferred entry for ADK Dev UI / Runner — carries Agent Observability plugins
 * when AGENTO11Y_* + OTEL_* env are set.
 * Name must be `agent` (matches `agent.ts` / Dev UI routes) so session create
 * and Runner lookup use the same appName. Grafana identity is set on the plugin.
 */
export const app = new App({
  name: 'agent',
  rootAgent,
  plugins: agento11yPlugins,
});

export {
  agentMode,
  agento11yBootstrap,
  dpAgent,
  editorAgent,
  grafanaMcpEnabled,
  planningAgent,
  productionAgent,
  writerAgent,
};
