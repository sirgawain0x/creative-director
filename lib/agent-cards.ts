import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

export const AGENT_CARD_NAMES = ['writer', 'dp', 'editor', 'director'] as const;

export type AgentCardName = (typeof AGENT_CARD_NAMES)[number];

export const agentCardSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
  examples: z.array(z.string()).optional(),
});

export const agentCardSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  version: z.string().min(1),
  protocolVersion: z.string().min(1),
  preferredTransport: z.string().optional(),
  capabilities: z.object({
    streaming: z.boolean().optional(),
  }),
  defaultInputModes: z.array(z.string()).min(1),
  defaultOutputModes: z.array(z.string()).min(1),
  skills: z.array(agentCardSkillSchema).min(1),
});

export type AgentCardDocument = z.infer<typeof agentCardSchema>;

const cardsRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'agents',
  'cards',
);

export function loadAgentCard(name: AgentCardName): AgentCardDocument {
  const raw = JSON.parse(
    readFileSync(join(cardsRoot, `${name}.json`), 'utf8'),
  ) as unknown;
  return agentCardSchema.parse(raw);
}

export function cardsRootDir(): string {
  return cardsRoot;
}
