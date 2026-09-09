import {AgentTool, LlmAgent, RemoteA2AAgent} from '@google/adk';

/**
 * Wrap a local specialist as AgentTool, or a RemoteA2AAgent when a card URL env is set.
 * Card URL should point at an A2A Agent Card (JSON), not the chat UI.
 */
export function specialistAgentTool(
  localAgent: LlmAgent,
  cardUrlEnv: string,
  description: string,
): AgentTool {
  const cardUrl = process.env[cardUrlEnv]?.trim();
  if (cardUrl) {
    return new AgentTool({
      agent: new RemoteA2AAgent({
        name: localAgent.name,
        description,
        agentCard: cardUrl,
      }),
    });
  }
  return new AgentTool({agent: localAgent});
}
