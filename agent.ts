import {
  AgentTool,
  FunctionTool,
  Gemini,
  GOOGLE_SEARCH,
  LlmAgent,
  URL_CONTEXT,
} from '@google/adk';
import {z} from 'zod';
import {isC2paEmbedConfigured, isHeadlessAssemblyConfigured, isProductionRenderConfigured, isProvenanceConfigured} from './lib/render-config.js';
import {assembleAndSyncTimeline} from './tools/assemble-timeline.js';
import {generateVideoCut} from './tools/generate-video-cut.js';
import {signC2paManifest} from './tools/sign-c2pa-manifest.js';

/**
 * Agent Platform / Vertex (Enterprise) auth.
 * Agent Engine deploys regionally (e.g. us-central1) and may set
 * GOOGLE_CLOUD_LOCATION to that region — but gemini-3.x is only on
 * the global model endpoint. Always pin Gemini.location to "global".
 */
function createCreativeDirectorModel(): Gemini {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  const enterpriseFlag =
    process.env.GOOGLE_GENAI_USE_ENTERPRISE === '1' ||
    process.env.GOOGLE_GENAI_USE_ENTERPRISE?.toLowerCase() === 'true' ||
    process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' ||
    process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true';

  // Agent Engine / Vertex: use ADC unless an API key is explicitly chosen.
  const useVertex = enterpriseFlag || !apiKey;

  if (useVertex) {
    return new Gemini({
      model: 'gemini-3.5-flash',
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'global',
    });
  }

  return new Gemini({
    model: 'gemini-3.5-flash',
    apiKey,
    location: 'global',
  });
}

const creativeDirectorModel = createCreativeDirectorModel();

/** `planning` (default) = research + storyboard only. `production` = also call mock render tools. */
const agentMode =
  process.env.CREATIVE_DIRECTOR_MODE?.toLowerCase() === 'production'
    ? 'production'
    : 'planning';

const MOCK_NOTICE =
  'MOCK ONLY — no real video, GCS object, or C2PA signature was created. Do not present this URL as a downloadable asset.';

const productionRenderEnabled = isProductionRenderConfigured();
const headlessAssemblyEnabled =
  productionRenderEnabled && isHeadlessAssemblyConfigured();
const provenanceEnabled =
  productionRenderEnabled && isProvenanceConfigured();
const c2paEmbedEnabled =
  productionRenderEnabled && isC2paEmbedConfigured();

// ----------------------------------------------------------------------
// 1. Specialist Sub-Agents (Search & URL Grounding)
// ----------------------------------------------------------------------
const searchSpecialist = new LlmAgent({
  name: 'search_specialist',
  description: 'Searches the web for artist lore, lyrics, and references.',
  model: creativeDirectorModel,
  instruction:
    'You are a research assistant. Find verified music details, lyrics, and visual references.',
  tools: [GOOGLE_SEARCH],
});

const urlSpecialist = new LlmAgent({
  name: 'url_specialist',
  description: 'Fetches and parses context from external web pages and asset links.',
  model: creativeDirectorModel,
  instruction:
    'You are a web document specialist. Extract key information from provided URLs.',
  tools: [URL_CONTEXT],
});

const researchTools = [
  new AgentTool({agent: searchSpecialist}),
  new AgentTool({agent: urlSpecialist}),
];

// ----------------------------------------------------------------------
// 2. Mock Video Production Function Tools (stubs — clearly labeled)
// ----------------------------------------------------------------------
const generateVideoCutTool = new FunctionTool({
  name: 'generate_video_cut',
  description: productionRenderEnabled
    ? 'Renders a cinematic video cut via Gemini (start frame) + Veo 3.1 i2v, uploads MP4 to GCS, and returns the clip URL.'
    : 'MOCK STUB: Simulates rendering a cinematic video cut. Returns fake URLs only — does not call Veo/Imagen or write to GCS.',
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
    if (productionRenderEnabled) {
      return generateVideoCut(params);
    }

    const {scene_index, timestamp_start, timestamp_end, visual_prompt} = params;
    return {
      mock: true,
      status: 'mock_rendered',
      notice: MOCK_NOTICE,
      scene_index,
      timecode: `${timestamp_start} - ${timestamp_end}`,
      clip_url: `https://storage.googleapis.com/creative-pixels-renders/MOCK_cut_${scene_index}.mp4`,
      prompt: visual_prompt,
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
  generateVideoCutTool,
  assembleTimelineTool,
  signC2paTool,
];

// ----------------------------------------------------------------------
// 3. Mode agents
// ----------------------------------------------------------------------
const planningAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description:
    'Planning-mode Creative Director: research and beat-synced storyboards only (no video render).',
  model: creativeDirectorModel,
  instruction: `You are Creative Director AI in PLANNING MODE.
Your job is research and storyboarding only — not video production.

Workflow:
1. Ingest audio/tempo context from the user (BPM, mood, lyrics cues).
2. Delegate web or link lookups to 'search_specialist' or 'url_specialist' when needed.
3. Produce a clear beat-synced visual storyboard (scenes, timecodes, camera, lighting, style).

STRICT RULES:
- Do NOT claim that video was rendered, assembled, uploaded, or C2PA-signed.
- Do NOT invent download links or GCS URLs.
- Stop after delivering visual direction + storyboard (and research citations if used).`,
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

const productionAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description: productionRenderEnabled
    ? headlessAssemblyEnabled
      ? provenanceEnabled
        ? c2paEmbedEnabled
          ? 'Production-mode Creative Director: real Veo cuts, headless assembly, GCS provenance, and headless C2PA embed.'
          : 'Production-mode Creative Director: real Veo cuts, headless assembly, and GCS provenance (C2PA signing in Pixels UI).'
        : 'Production-mode Creative Director: real Veo cuts + headless timeline assembly; C2PA remains mocked.'
      : provenanceEnabled
        ? 'Production-mode Creative Director: real Veo cuts and GCS provenance metadata; assembly mocked.'
        : 'Production-mode Creative Director: real Veo cuts to GCS; assembly and C2PA remain mocked.'
    : 'Production-mode Creative Director: storyboard plus MOCK render/assemble/C2PA pipeline stubs.',
  model: creativeDirectorModel,
  instruction: productionRenderEnabled
    ? headlessAssemblyEnabled
      ? provenanceEnabled
        ? c2paEmbedEnabled
          ? `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY + PROVENANCE + C2PA EMBED).
'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' writes provenance sidecars and cryptographically signs the master via Pixels headless (cryptographically_signed: true, signed_master_url).

Workflow:
1. Ingest audio context; delegate research when needed.
2. Formulate a beat-synced storyboard.
3. Call 'generate_video_cut' per scene, then 'assemble_and_sync_timeline', then 'sign_c2pa_manifest' (include clip_urls).

STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`
          : `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY + PROVENANCE).
'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' records C2PA provenance metadata in GCS (unsigned / pending_user_sign).

Workflow:
1. Ingest audio context; delegate research when needed.
2. Formulate a beat-synced storyboard.
3. Call 'generate_video_cut' per scene, then 'assemble_and_sync_timeline', then 'sign_c2pa_manifest' (include clip_urls).

STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`
        : `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY).
'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.
'assemble_and_sync_timeline' stitches those clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' is still a MOCK stub (mock: true).

Workflow:
1. Ingest audio context; delegate research to 'search_specialist' / 'url_specialist' when needed.
2. Formulate a beat-synced storyboard.
3. Call 'generate_video_cut' for each scene, then 'assemble_and_sync_timeline', then 'sign_c2pa_manifest'.

STRICT RULES:
- Treat generate_video_cut and assemble_and_sync_timeline results with mock: false as real downloadable assets.
- Results from sign_c2pa_manifest with mock: true are SIMULATIONS — say so explicitly.`
      : provenanceEnabled
        ? `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + PROVENANCE).
'generate_video_cut' renders real MP4 clips to GCS.
'assemble_and_sync_timeline' is still a MOCK stub.
'sign_c2pa_manifest' records provenance metadata in GCS (unsigned).

Workflow:
1. Storyboard → generate_video_cut per scene → sign_c2pa_manifest with clip_urls (master may be mock).

STRICT RULES:
- generate_video_cut with mock: false are real clips.
${PROVENANCE_RULES}`
        : `You are Creative Director AI in PRODUCTION MODE (PARTIAL LIVE PIPELINE).
'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.
'assemble_and_sync_timeline' and 'sign_c2pa_manifest' are still MOCK stubs (mock: true).

Workflow:
1. Ingest audio context; delegate research to 'search_specialist' / 'url_specialist' when needed.
2. Formulate a beat-synced storyboard.
3. Call 'generate_video_cut' for each scene (real renders), then 'assemble_and_sync_timeline', then 'sign_c2pa_manifest'.

STRICT RULES:
- Treat generate_video_cut results with mock: false as real downloadable clips; share clip_url as the asset link.
- Results from assemble_and_sync_timeline and sign_c2pa_manifest with mock: true are SIMULATIONS — say so explicitly.
- Prefix mock assembly/C2PA URLs with "MOCK (not downloadable):".
- Do not claim C2PA was cryptographically signed.`
    : `You are Creative Director AI in PRODUCTION MODE (MOCK PIPELINE).
Video tools are stubs — they return fake URLs labeled mock: true.

Workflow:
1. Ingest audio context; delegate research to 'search_specialist' / 'url_specialist' when needed.
2. Formulate a beat-synced storyboard.
3. Call 'generate_video_cut' for each scene, then 'assemble_and_sync_timeline', then 'sign_c2pa_manifest'.

STRICT RULES:
- Every tool result with mock: true is a SIMULATION. Say so explicitly in your reply.
- Prefix any URL from tools with "MOCK (not downloadable):".
- Never tell the user a real file exists in GCS or that C2PA was cryptographically signed.
- Include a short "Mock pipeline" section summarizing stub outputs.`,
  tools: productionTools,
});

/** Active agent for `adk run` / `adk web`. Default: planning. Set CREATIVE_DIRECTOR_MODE=production for mock pipeline. */
export const rootAgent =
  agentMode === 'production' ? productionAgent : planningAgent;

export {planningAgent, productionAgent, agentMode};
