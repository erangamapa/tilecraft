import path from 'path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import {
  computeTextLayout,
  drawBlobLayer,
  drawTextLayer,
} from './textComposition';

const FONT_FAMILY_GAME = 'MidnightSans';
const FONT_FAMILY_STUDIO = 'Inter';

// Registered under aliases the shared draw code expects. These TTF files are the
// node-parseable variants (Inter-Regular.ttf / midnight woff2 fail to parse in Skia/FreeType).
const GAME_FONT_FILE = 'midnight-sans-st-24-heavy-pro.ttf';
const STUDIO_FONT_FILE = 'Inter-Regular-converted.ttf';

let fontsRegistered = false;

function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), 'fonts');
  GlobalFonts.registerFromPath(path.join(fontsDir, GAME_FONT_FILE), FONT_FAMILY_GAME);
  GlobalFonts.registerFromPath(path.join(fontsDir, STUDIO_FONT_FILE), FONT_FAMILY_STUDIO);
  fontsRegistered = true;
}

export interface ComposeTextParams {
  baseImage: Buffer;
  gameName: string;
  studioName: string;
  width: number;
  height: number;
}

/**
 * Draws the game/studio name overlay onto a generated base image server-side,
 * reusing the exact layout/draw logic from textComposition.ts via a Skia canvas
 * (which, unlike node-canvas, supports the `filter: blur()` the overlay relies on).
 */
export async function composeTextOnImage({
  baseImage,
  gameName,
  studioName,
  width,
  height,
}: ComposeTextParams): Promise<Buffer> {
  ensureFontsRegistered();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D & { filter?: string };

  const image = await loadImage(baseImage);
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, width, height);

  if (gameName.trim() || studioName.trim()) {
    const layout = computeTextLayout(ctx, {
      gameName,
      studioName,
      fontFamilyGame: FONT_FAMILY_GAME,
      fontFamilyStudio: FONT_FAMILY_STUDIO,
      width,
      height,
    });
    drawBlobLayer(ctx, layout, { width, applyBlur: true });
    drawTextLayer(ctx, layout, {
      width,
      fontFamilyGame: FONT_FAMILY_GAME,
      fontFamilyStudio: FONT_FAMILY_STUDIO,
    });
  }

  return canvas.toBuffer('image/png');
}
