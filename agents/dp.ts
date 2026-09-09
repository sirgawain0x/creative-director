import {LlmAgent} from '@google/adk';
import {creativeDirectorModel} from '../lib/model.js';
import {loadSkill} from '../lib/skills.js';

export function createDpAgent(): LlmAgent {
  const beatSync = loadSkill('craft/beat-sync.md');
  const veoPrompting = loadSkill('craft/veo-prompting.md');
  const musicVideo = loadSkill('craft/music-video.md');
  const darkPop = loadSkill('genres/dark-pop.md');
  const hipHop = loadSkill('genres/hip-hop.md');

  return new LlmAgent({
    name: 'dp_agent',
    description:
      'Director of photography: beat-synced shot list, camera, lighting, and Veo-ready visual prompts.',
    model: creativeDirectorModel,
    instruction: `You are the music-video DP. Turn the Writer treatment into a beat-synced storyboard.

The director names a genre pack (dark-pop, hip-hop, or generic) and passes BPM + treatment. Apply that pack.

Each scene MUST include: scene_index, timestamp_start, timestamp_end, camera_movement, lighting, visual_prompt.

STRICT RULES:
- Do not call render tools or invent GCS/download URLs.
- Do not rewrite the treatment; use it.
- visual_prompt must be ready for generate_video_cut.
- Do not reproduce copyrighted lyrics verbatim.

### beat-sync
${beatSync}

### veo-prompting
${veoPrompting}

### generic
${musicVideo}

### dark-pop
${darkPop}

### hip-hop
${hipHop}`,
  });
}

export const dpAgent = createDpAgent();
