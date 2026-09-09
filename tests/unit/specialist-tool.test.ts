import {afterEach, describe, expect, it, vi} from 'vitest';
import {AgentTool} from '@google/adk';
import {specialistAgentTool} from '../../agents/specialist-tool.js';
import {writerAgent} from '../../agents/writer.js';

describe('specialistAgentTool', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('wraps the local specialist when no card URL is set', () => {
    vi.stubEnv('WRITER_A2A_CARD_URL', '');
    const tool = specialistAgentTool(
      writerAgent,
      'WRITER_A2A_CARD_URL',
      'Writes music-video treatments.',
    );
    expect(tool).toBeInstanceOf(AgentTool);
  });

  it('uses RemoteA2AAgent when WRITER_A2A_CARD_URL is set', () => {
    vi.stubEnv(
      'WRITER_A2A_CARD_URL',
      'http://127.0.0.1:8000/a2a/writer/.well-known/agent-card.json',
    );
    const tool = specialistAgentTool(
      writerAgent,
      'WRITER_A2A_CARD_URL',
      'Writes music-video treatments.',
    );
    expect(tool).toBeInstanceOf(AgentTool);
  });
});
