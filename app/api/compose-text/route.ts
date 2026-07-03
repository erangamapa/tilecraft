import { NextRequest, NextResponse } from 'next/server';
import { composeTextOnImage } from '../../lib/serverTextComposition';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageBase64 = typeof body.image === 'string' ? body.image : '';
    const gameName = typeof body.gameName === 'string' ? body.gameName : '';
    const studioName = typeof body.studioName === 'string' ? body.studioName : '';
    const width = Number(body.width);
    const height = Number(body.height);

    if (!imageBase64) {
      return NextResponse.json({ error: 'image (base64) is required.' }, { status: 400 });
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return NextResponse.json({ error: 'Valid width and height are required.' }, { status: 400 });
    }

    const baseImage = Buffer.from(imageBase64, 'base64');
    const composed = await composeTextOnImage({ baseImage, gameName, studioName, width, height });

    return NextResponse.json({ image: composed.toString('base64') });
  } catch (error) {
    console.error('Error composing text overlay:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply text overlay.' },
      { status: 500 }
    );
  }
}
