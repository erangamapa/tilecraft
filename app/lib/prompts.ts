/** Single-image landscape generation prompt */
export const GENERATION_PROMPT_LANDSCAPE = `convert the attached casino game tile into a landscape image, exactly 688×524 pixels (width × height), with full artwork filling the frame.

artwork lock: keep the entire original image intact. do not crop, zoom, reframe, stretch, or distort it, and do not cut off characters, frames, effects, or environmental details. treat the original as a locked layer.

remove branding: fully erase all primary branding — game title, studio/provider name, central logos, title badges, decorative frames, ui overlays — leaving no partial letters, ghosts, or outlines. reconstruct affected areas from surrounding colors, textures, and lighting so the edit is invisible.

canvas extension: reach the exact 688×524 ratio by extending the canvas sideways with natural environment (sky, background, fog, ambient glow). never scale or compress the original; it must stay visually dominant.

corner badge: if a small secondary corner badge or label exists (e.g. "1000", "drops & wins", "promo"), preserve it exactly as-is — do not resize, restyle, move, or duplicate it.

exclusions: add no new objects, characters, text, typography, logos, watermarks, borders, frames, or branding of any kind.

output: a clean, seamless 688×524 landscape image with the full original artwork intact, no edge cut-offs, full-frame artwork, no visible edits, and no leftover branding.
`;

/** Shared prompt constant - safe to import from client components (no Node.js deps) */
export const GENERATION_PROMPT = `convert the attached landscape casino game tile into a portrait 2:3 image, exactly 500×750 pixels, prepared for later automated typography.

artwork lock: keep the entire original image intact. do not crop, zoom, reframe, resize, stretch, or distort it, and do not cut off characters, frames, effects, or environmental details. treat the original as a locked layer.

top safety: if the hero artwork touches the top edge, you may extend the canvas slightly upward (up to ~6–10% of height) for breathing room, using a natural continuation of the scene (sky, mist, haze, glow). no borders or hard lines.

corner badge: if a small secondary corner badge exists (e.g. "1000", "drops & wins", "promo"), preserve it exactly as-is in its original corner with a small margin — do not resize, restyle, move, or duplicate it. this applies only to small corner badges.

remove branding: fully erase all primary branding — game title, studio name, central logos, title badges, decorative frames, ui overlays — leaving no partial letters, ghosts, or outlines. reconstruct affected areas from surrounding colors, textures, and lighting so the edit is invisible.

canvas extension: reach the 2:3 ratio by extending downward (upward only per the top rule), never sideways, never scaling the original. the artwork must stay dominant in the upper portion.

typography-safe lower area: the lower ~40% must be calm and text-safe — a natural fade of the scene (soft gradients, mist, fog, haze, atmospheric depth). avoid heavy blur, blur blobs, gradient panels, flat plates, vignettes, bands, or hard seams. it should feel like the scene dissolving, not a designed footer.

exclusions: add no new objects, characters, text, typography, logos, watermarks, borders, frames, or branding, and no contrast hotspots or sharp edges.

output: a clean, seamless 500×750 portrait with the full original artwork intact, no top/edge cut-offs, preserved corner badge if present, a calm lower area for future text, no visible edits, and no leftover branding.
`;

/** Build optional game name image section for landscape prompt when game name image is provided */
export function buildGameNameImageSection(hasGameNameImage: boolean): string {
  if (!hasGameNameImage) return '';
  return `
game name image — size and placement: integrate the provided game-name image so the text is clearly visible and readable. size it to occupy a meaningful portion of the tile (lower area, corner, or integrated with the scene) — never tiny. it should be a recognizable focal element.
`;
}

/** Build input structure section for provider assets prompt based on available layers */
export function buildProviderAssetsInputStructure(params: {
  hasMainCharacter: boolean;
  hasAlternativeCharacters: boolean;
  hasObjects: boolean;
  hasGameNameImage?: boolean;
}): string {
  const lines: string[] = ['input structure (images are provided in this order):'];
  lines.push('- image 1: background — the scene, environment, and atmosphere.');
  lines.push('- image 2: main character — must be prominent and large; the hero of the composition.');
  if (params.hasAlternativeCharacters) {
    lines.push('- images 3–4: alternative characters — place smaller than the main character.');
  }
  if (params.hasObjects) {
    const imgRange = params.hasAlternativeCharacters ? '5–6' : '3–4';
    lines.push(`- images ${imgRange}: objects — props or decorative elements to include.`);
  }
  if (params.hasGameNameImage) {
    let imgNum = 3;
    if (params.hasAlternativeCharacters) imgNum += 2;
    if (params.hasObjects) imgNum += 2;
    lines.push(`- image ${imgNum}: game name as image — the game name wrapped in an object (logo, sign, badge); place large enough to be clearly readable.`);
  }
  return lines.join('\n');
}

/** Provider assets: full portrait prompt. Contains {{INPUT_STRUCTURE}} placeholder. */
export const PROVIDER_ASSETS_PROMPT_PORTRAIT = `you are given images in a specific order. compose them into a single cohesive portrait 2:3 image, exactly 500×750 pixels, prepared for later automated typography.

{{INPUT_STRUCTURE}}

character size (critical): the upper ~60% is for the main artwork, the lower ~40% for text. make the main character(s) large so they fill and dominate the upper area; scale the main character up. alternative characters must be smaller. avoid excess empty space above the character — it should feel bold and prominent.

composition: use the background as the base, then the main character (large), then alternative characters (smaller), then objects. match scale, lighting, shadows, and perspective so it reads as one coherent tile, not a collage.

artwork integrity: preserve and integrate all source artwork naturally; do not cut off characters, frames, or details. you may scale the main character up to fill the upper area.

top safety: if the hero touches the top edge, extend the canvas slightly upward (~6–10%) with a natural continuation of the environment. no borders or hard lines.

remove branding: erase all primary branding (game title, studio name, logos, title badges, ui overlays) from every source image, leaving no traces; reconstruct affected areas from surrounding colors and textures.

canvas extension: reach the 2:3 ratio by extending downward (upward only per the top rule), never sideways.

typography-safe lower area: the lower ~40% must be calm and text-safe — a natural fade of the scene (soft gradients, mist, fog, haze, depth). avoid heavy blur, blur blobs, gradient panels, flat plates, vignettes, bands, or hard seams.

exclusions: add no new objects, characters, text, typography, logos, watermarks, borders, frames, or branding.

output: a clean, seamless 500×750 portrait with the main character large and dominant in the upper area, no cut-offs, a calm lower area for future text, no visible edits, and no leftover branding.
`;

/** Provider assets: full landscape prompt. Contains {{INPUT_STRUCTURE}} and {{GAME_NAME_IMAGE_SECTION}} placeholders. */
export const PROVIDER_ASSETS_PROMPT_LANDSCAPE = `you are given images in a specific order. compose them into a single cohesive landscape image, exactly 688×524 pixels (width × height), with no text area — full artwork fills the frame.

{{INPUT_STRUCTURE}}
{{GAME_NAME_IMAGE_SECTION}}

character size (critical): make the main character(s) large so they dominate the frame — scale them up significantly. alternative characters must be smaller. in landscape, small characters look lost; the main character should occupy much of the width and height and be the clear focal point.

composition: use the background as the base, then the main character (large), then alternative characters (smaller), then objects. match scale, lighting, shadows, and perspective so it reads as one coherent tile, not a collage.

artwork integrity: preserve and integrate all source artwork naturally; do not cut off characters, frames, or details. you should scale the main character up to fill the frame.

remove branding: erase all primary branding (game title, studio name, logos, title badges, ui overlays) from every source image, leaving no traces; reconstruct affected areas from surrounding colors and textures.

layout: output exactly 688×524 pixels. the entire image is artwork with no reserved text area. use canvas extension or composition to hit the exact dimensions, keeping the main character large and prominent.

exclusions: add no new objects, characters, text, typography, logos, watermarks, borders, frames, or branding.

output: a clean, seamless 688×524 landscape with the main character large and dominant, filling the frame, no cut-offs, full-frame artwork, no visible edits, and no leftover branding.
`;
