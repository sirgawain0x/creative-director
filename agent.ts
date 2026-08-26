import {
  AgentTool,
  FunctionTool,
  Gemini,
  GOOGLE_SEARCH,
  LlmAgent,
  URL_CONTEXT,
} from '@google/adk';
import {z} from 'zod';

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
  description:
    'MOCK STUB: Simulates rendering a cinematic video cut. Returns fake URLs only — does not call Veo/Imagen or write to GCS.',
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
  execute: async ({
    scene_index,
    timestamp_start,
    timestamp_end,
    visual_prompt,
  }) => {
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
  description:
    'MOCK STUB: Simulates stitching cuts to a master timeline. Returns a fake master URL — does not assemble real video.',
  parameters: z.object({
    project_title: z.string().describe('The title of the video project'),
    clip_urls: z
      .array(z.string())
      .describe('List of rendered video clip URLs in sequential order'),
    audio_uri: z.string().describe('URI of the master audio file'),
    target_bpm: z.number().optional().describe('Detected BPM for transition cuts'),
  }),
  execute: async ({project_title, clip_urls}) => {
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
  description:
    'MOCK STUB: Simulates C2PA provenance signing. Returns fake metadata — does not sign a real file.',
  parameters: z.object({
    master_video_url: z.string().describe('URL of the compiled master video file'),
    creator_did: z.string().describe('Creator DID or wallet address for attribution'),
    ai_models_used: z
      .string()
      .describe(
        'List of generative AI models used (e.g. Gemini 3.5 Flash, Google Veo)',
      ),
  }),
  execute: async ({master_video_url, creator_did, ai_models_used}) => {
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

const productionAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description:
    'Production-mode Creative Director: storyboard plus MOCK render/assemble/C2PA pipeline stubs.',
  model: creativeDirectorModel,
  instruction: `You are Creative Director AI in PRODUCTION MODE (MOCK PIPELINE).
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
