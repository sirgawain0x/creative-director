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
  AGENTO11Y_AGENT_NAME,
  createAgento11yBootstrap,
} from './lib/agento11y.js';
import {
  createGrafanaMcpToolset,
  isGrafanaMcpConfigured,
} from './lib/grafana-mcp.js';
import {resolveGenre} from './lib/genre.js';
import {creativeDirectorModel} from './lib/model.js';
import {
  isC2paEmbedConfigured,
  isHeadlessAssemblyConfigured,
  isProductionRenderConfigured,
  isProvenanceConfigured,
} from './lib/render-config.js';
import {loadGenrePack} from './lib/skills.js';
import {assembleAndSyncTimeline} from './tools/assemble-timeline.js';
import {generateVideoCut} from './tools/generate-video-cut.js';
import {signC2paManifest} from './tools/sign-c2pa-manifest.js';

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
const grafanaMcpEnabled = isGrafanaMcpConfigured();
const grafanaMcpToolset = createGrafanaMcpToolset();
const grafanaTools = grafanaMcpToolset ? [grafanaMcpToolset] : [];

const selectGenrePackTool = new FunctionTool({
  name: 'select_genre_pack',
  description:
    'Select the music-video genre skill pack (dark-pop, hip-hop, or generic fallback) from the user brief. Call this before writer_agent or dp_agent.',
  parameters: z.object({
    brief: z
      .string()
      .describe('User brief including genre, mood, and musical style'),
  }),
  execute: async ({brief}) => {
    const genre = resolveGenre(brief);
    return {
      genre,
      pack: loadGenrePack(genre),
    };
  },
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
// Mock / live video production function tools
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
  editorTool,
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

function liveCutsNote(): string {
  return `'generate_video_cut' renders real MP4 clips (Gemini still + Veo 3.1) and uploads them to GCS.`;
}

const productionAgent = new LlmAgent({
  name: 'Creative_Director_AI',
  description: productionRenderEnabled
    ? headlessAssemblyEnabled
      ? provenanceEnabled
        ? c2paEmbedEnabled
          ? 'Production-mode Creative Director: swarm + real Veo cuts, headless assembly, GCS provenance, and headless C2PA embed.'
          : 'Production-mode Creative Director: swarm + real Veo cuts, headless assembly, and GCS provenance (C2PA signing in Pixels UI).'
        : 'Production-mode Creative Director: swarm + real Veo cuts + headless timeline assembly; C2PA remains mocked.'
      : provenanceEnabled
        ? 'Production-mode Creative Director: swarm + real Veo cuts and GCS provenance metadata; assembly mocked.'
        : 'Production-mode Creative Director: swarm + real Veo cuts to GCS; assembly and C2PA remain mocked.'
    : 'Production-mode Creative Director: swarm storyboard plus MOCK render/assemble/C2PA pipeline stubs.',
  model: creativeDirectorModel,
  instruction: productionRenderEnabled
    ? headlessAssemblyEnabled
      ? provenanceEnabled
        ? c2paEmbedEnabled
          ? `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY + PROVENANCE + C2PA EMBED).
${liveCutsNote()}
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' writes provenance sidecars and cryptographically signs the master via Pixels headless (cryptographically_signed: true, signed_master_url).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`)}`
          : `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY + PROVENANCE).
${liveCutsNote()}
'assemble_and_sync_timeline' stitches clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' records C2PA provenance metadata in GCS (unsigned / pending_user_sign).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut, assemble_and_sync_timeline, and sign_c2pa_manifest results with mock: false as real.
${PROVENANCE_RULES}`)}`
        : `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + ASSEMBLY).
${liveCutsNote()}
'assemble_and_sync_timeline' stitches those clips with master audio via Pixels headless and uploads a real master MP4.
'sign_c2pa_manifest' is still a MOCK stub (mock: true).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut and assemble_and_sync_timeline results with mock: false as real downloadable assets.
- Results from sign_c2pa_manifest with mock: true are SIMULATIONS — say so explicitly.`)}`
      : provenanceEnabled
        ? `You are Creative Director AI in PRODUCTION MODE (LIVE CUTS + PROVENANCE).
'generate_video_cut' renders real MP4 clips to GCS.
'assemble_and_sync_timeline' is still a MOCK stub.
'sign_c2pa_manifest' records provenance metadata in GCS (unsigned).

${productionSwarmWorkflow(`STRICT RULES:
- generate_video_cut with mock: false are real clips.
${PROVENANCE_RULES}`)}`
        : `You are Creative Director AI in PRODUCTION MODE (PARTIAL LIVE PIPELINE).
${liveCutsNote()}
'assemble_and_sync_timeline' and 'sign_c2pa_manifest' are still MOCK stubs (mock: true).

${productionSwarmWorkflow(`STRICT RULES:
- Treat generate_video_cut results with mock: false as real downloadable clips; share clip_url as the asset link.
- Results from assemble_and_sync_timeline and sign_c2pa_manifest with mock: true are SIMULATIONS — say so explicitly.
- Prefix mock assembly/C2PA URLs with "MOCK (not downloadable):".
- Do not claim C2PA was cryptographically signed.`)}`
    : `You are Creative Director AI in PRODUCTION MODE (MOCK PIPELINE).
Video tools are stubs — they return fake URLs labeled mock: true.

${productionSwarmWorkflow(`STRICT RULES:
${MOCK_PIPELINE_RULES}`)}`,
  tools: productionTools,
});

/** Active agent for `adk run` / `adk web`. Default: planning. Set CREATIVE_DIRECTOR_MODE=production for mock pipeline. */
export const rootAgent =
  agentMode === 'production' ? productionAgent : planningAgent;

const agento11yBootstrap = createAgento11yBootstrap();
const agento11yPlugins = agento11yBootstrap ? [agento11yBootstrap.plugin] : [];

/**
 * Preferred entry for ADK Dev UI / Runner — carries Agent Observability plugins
 * when AGENTO11Y_* + OTEL_* env are set.
 */
export const app = new App({
  name: AGENTO11Y_AGENT_NAME,
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
