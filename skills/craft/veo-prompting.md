# Veo prompting

Write `visual_prompt` strings the director can pass to `generate_video_cut` unchanged.

- One shot per scene: subject, action, location, time of day, lighting, camera move, lens feel, color grade.
- Keep the same protagonist description (wardrobe, hair, age range) across scenes.
- Include camera_movement as a short phrase (e.g. `slow dolly in`, `handheld orbit`).
- Avoid on-screen text, lyrics captions, logos, and "in the style of [living artist]".
- Duration: Veo clips are short; 4–8 seconds is the default beat unless the storyboard says otherwise.
- Do not mention GCS, mock URLs, or that a file was rendered.
