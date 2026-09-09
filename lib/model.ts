import {Gemini} from '@google/adk';

/**
 * Agent Platform / Vertex (Enterprise) auth.
 * Agent Engine deploys regionally (e.g. us-central1) and may set
 * GOOGLE_CLOUD_LOCATION to that region — but gemini-3.x is only on
 * the global model endpoint. Always pin Gemini.location to "global".
 */
export function createCreativeDirectorModel(): Gemini {
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

export const creativeDirectorModel = createCreativeDirectorModel();
