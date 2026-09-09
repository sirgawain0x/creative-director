import {GOOGLE_SEARCH, LlmAgent, URL_CONTEXT} from '@google/adk';
import {creativeDirectorModel} from '../lib/model.js';

export const searchSpecialist = new LlmAgent({
  name: 'search_specialist',
  description: 'Searches the web for artist lore, lyrics, and references.',
  model: creativeDirectorModel,
  instruction:
    'You are a research assistant. Find verified music details, lyrics, and visual references.',
  tools: [GOOGLE_SEARCH],
});

export const urlSpecialist = new LlmAgent({
  name: 'url_specialist',
  description: 'Fetches and parses context from external web pages and asset links.',
  model: creativeDirectorModel,
  instruction:
    'You are a web document specialist. Extract key information from provided URLs.',
  tools: [URL_CONTEXT],
});
