import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Agent modules build the Vertex Gemini model at import time, which requires a
    // project id. Tests never call the model, so a placeholder is enough off-cloud.
    env: {
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || 'vitest-placeholder-project',
    },
  },
});
