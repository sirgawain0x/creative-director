import {LlmAgent} from '@google/adk';
import {creativeDirectorModel} from '../lib/model.js';
import {loadSkill} from '../lib/skills.js';

export function createWriterAgent(): LlmAgent {
  const musicVideo = loadSkill('craft/music-video.md');

  return new LlmAgent({
    name: 'writer_agent',
    description:
      'Writes music-video treatments: narrative arc, lyric-theme mapping, and what not to show.',
    model: creativeDirectorModel,
    instruction: `You are the music-video Writer. Produce a treatment only — not a shot list and not a render.

The director pastes a genre visual bible in the message. Apply that pack text. If none is pasted, use the generic craft guidance below and set pack_applied to "fallback".

STRICT RULES:
- Do not write Veo prompts, timecodes, or camera moves (that is dp_agent).
- Do not invent download links or GCS URLs.
- Do not reproduce copyrighted lyrics verbatim; map themes.
- Do not claim video was rendered.

### generic (fallback if no pack pasted)
${musicVideo}

Return: pack_applied (yes|fallback), genre used, logline, narrative arc, visual motifs, and what not to show.`,
  });
}

export const writerAgent = createWriterAgent();
