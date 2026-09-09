import {z} from 'zod';
import {GENRE_IDS} from './genre.js';

export const storyboardSceneSchema = z.object({
  scene_index: z.number().int().positive(),
  timestamp_start: z.string().min(1),
  timestamp_end: z.string().min(1),
  camera_movement: z.string().min(1),
  lighting: z.string().min(1),
  visual_prompt: z.string().min(1),
});

export const productionPackageSchema = z.object({
  genre: z.enum(GENRE_IDS),
  treatment: z.string().min(1),
  storyboard: z.array(storyboardSceneSchema).min(1),
  clip_urls: z.array(z.string()).optional(),
  master_url: z.string().optional(),
});

export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;
export type ProductionPackage = z.infer<typeof productionPackageSchema>;
