import {describe, expect, it} from 'vitest';
import {
  AGENT_CARD_NAMES,
  agentCardSchema,
  loadAgentCard,
} from '../../lib/agent-cards.js';

describe('A2A agent cards', () => {
  it('loads a valid card for every department', () => {
    for (const name of AGENT_CARD_NAMES) {
      const card = loadAgentCard(name);
      expect(agentCardSchema.safeParse(card).success).toBe(true);
      expect(card.skills.length).toBeGreaterThan(0);
      expect(card.url).toMatch(/^https?:\/\//);
    }
  });

  it('uses stable specialist names that match in-process agents', () => {
    expect(loadAgentCard('writer').name).toBe('writer_agent');
    expect(loadAgentCard('dp').name).toBe('dp_agent');
    expect(loadAgentCard('editor').name).toBe('editor_agent');
    expect(loadAgentCard('director').name).toBe('Creative_Director_AI');
  });
});
