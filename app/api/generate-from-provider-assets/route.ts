import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getMimeType } from '../../lib/imageGeneration';
import {
  generateFromProviderAssets,
  PROVIDER_LANDSCAPE_HEIGHT,
  PROVIDER_LANDSCAPE_WIDTH,
} from '../../lib/providerAssetsGeneration';

async function deleteBlobs(urls: string[]): Promise<void> {
  const valid = urls.filter((u): u is string => !!u && u.includes('blob.vercel-storage.com'));
  if (valid.length === 0) return;
  try {
    await del(valid);
  } catch (err) {
    console.error('Failed to delete blob inputs:', err);
  }
}

async function processFile(file: File): Promise<{ buffer: Buffer; mimeType: string }> {
  const inputArrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(inputArrayBuffer);
  const mimeType =
    file.type && file.type.startsWith('image/')
      ? file.type.split(';')[0].trim()
      : getMimeType(file.name);
  return { buffer, mimeType };
}

async function fetchImageFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'image/png';
  const mimeType = contentType.split(';')[0].trim();
  return { buffer, mimeType };
}

export async function POST(request: NextRequest) {
  const blobsToCleanup: string[] = [];
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured. Please contact the administrator.' },
        { status: 500 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let backgroundFile: File | null = null;
    let mainCharacterFile: File | null = null;
    let alternativeCharacterFiles: File[] = [];
    let objectFiles: File[] = [];
    let gameNameImageFile: File | null = null;
    let outputType = 'portrait';
    let gameName = '';
    let studioName = '';
    let customPromptPortrait: string | undefined;
    let customPromptLandscape: string | undefined;

    let backgroundUrl: string | null = null;
    let mainCharacterUrl: string | null = null;
    let alternativeCharacterUrls: string[] = [];
    let objectUrls: string[] = [];
    let gameNameImageUrl: string | null = null;

    if (isJson) {
      const body = await request.json();
      backgroundUrl = body.backgroundUrl || null;
      mainCharacterUrl = body.mainCharacterUrl || null;
      alternativeCharacterUrls = Array.isArray(body.alternativeCharacterUrls) ? body.alternativeCharacterUrls : [];
      objectUrls = Array.isArray(body.objectUrls) ? body.objectUrls : [];
      gameNameImageUrl = body.gameNameImageUrl || null;
      outputType = body.outputType || 'portrait';
      gameName = body.gameName || '';
      studioName = body.studioName || '';
      customPromptPortrait = body.customPromptPortrait;
      customPromptLandscape = body.customPromptLandscape;

      if (backgroundUrl) blobsToCleanup.push(backgroundUrl);
      if (mainCharacterUrl) blobsToCleanup.push(mainCharacterUrl);
      blobsToCleanup.push(...alternativeCharacterUrls.filter(Boolean));
      blobsToCleanup.push(...objectUrls.filter(Boolean));
      if (gameNameImageUrl) blobsToCleanup.push(gameNameImageUrl);
    } else {
      const formData = await request.formData();
      backgroundFile = formData.get('background') as File;
      mainCharacterFile = formData.get('mainCharacter') as File;
      alternativeCharacterFiles = (formData.getAll('alternativeCharacters') as File[]) || [];
      objectFiles = (formData.getAll('objects') as File[]) || [];
      gameNameImageFile = formData.get('gameNameImage') as File | null;
      outputType = (formData.get('outputType') as string) || 'portrait';
      gameName = (formData.get('gameName') as string) || '';
      studioName = (formData.get('studioName') as string) || '';
      customPromptPortrait = (formData.get('customPromptPortrait') as string) || undefined;
      customPromptLandscape = (formData.get('customPromptLandscape') as string) || undefined;
    }

    if (outputType !== 'portrait' && outputType !== 'landscape') {
      return NextResponse.json(
        { error: 'outputType must be "portrait" or "landscape".' },
        { status: 400 }
      );
    }

    const hasBackground = isJson ? !!backgroundUrl : !!(backgroundFile && backgroundFile.size > 0);
    const hasMainCharacter = isJson ? !!mainCharacterUrl : !!(mainCharacterFile && mainCharacterFile.size > 0);

    if (!hasBackground) {
      return NextResponse.json(
        { error: 'Background image is required. Please upload a background file.' },
        { status: 400 }
      );
    }

    if (!hasMainCharacter) {
      return NextResponse.json(
        { error: 'Main character image is required. Please upload a main character file.' },
        { status: 400 }
      );
    }

    const validAltChars = isJson
      ? alternativeCharacterUrls.filter(Boolean).slice(0, 2)
      : alternativeCharacterFiles.filter((f) => f && f.size > 0).slice(0, 2);
    const validObjects = isJson
      ? objectUrls.filter(Boolean).slice(0, 2)
      : objectFiles.filter((f) => f && f.size > 0).slice(0, 2);
    const hasGameNameImage =
      outputType === 'landscape' &&
      (isJson ? !!gameNameImageUrl : !!(gameNameImageFile && gameNameImageFile.size > 0));

    let input;
    if (isJson) {
      const altUrls = validAltChars as string[];
      const objUrls = validObjects as string[];
      input = {
        background: await fetchImageFromUrl(backgroundUrl!),
        mainCharacter: await fetchImageFromUrl(mainCharacterUrl!),
        alternativeCharacters: await Promise.all(altUrls.map(fetchImageFromUrl)),
        objects: await Promise.all(objUrls.map(fetchImageFromUrl)),
        ...(hasGameNameImage && gameNameImageUrl && {
          gameNameImage: await fetchImageFromUrl(gameNameImageUrl),
        }),
      };
    } else {
      input = {
        background: await processFile(backgroundFile!),
        mainCharacter: await processFile(mainCharacterFile!),
        alternativeCharacters: await Promise.all(
          (validAltChars as File[]).map(processFile)
        ),
        objects: await Promise.all((validObjects as File[]).map(processFile)),
        ...(hasGameNameImage &&
          gameNameImageFile && {
            gameNameImage: await processFile(gameNameImageFile),
          }),
      };
    }

    if (outputType === 'portrait') {
      const portraitResult = await generateFromProviderAssets(
        input,
        'portrait',
        apiKey,
        customPromptPortrait
      );

      return NextResponse.json(
        {
          image: portraitResult.imageBuffer.toString('base64'),
          imageLandscape: null,
          gameName: gameName.trim(),
          studioName: studioName.trim(),
          cost: portraitResult.cost,
          landscapeWidth: PROVIDER_LANDSCAPE_WIDTH,
          landscapeHeight: PROVIDER_LANDSCAPE_HEIGHT,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const landscapeResult = await generateFromProviderAssets(
      input,
      'landscape',
      apiKey,
      customPromptLandscape
    );

    return NextResponse.json(
      {
        image: null,
        imageLandscape: landscapeResult.imageBuffer.toString('base64'),
        gameName: gameName.trim(),
        studioName: studioName.trim(),
        cost: landscapeResult.cost,
        landscapeWidth: PROVIDER_LANDSCAPE_WIDTH,
        landscapeHeight: PROVIDER_LANDSCAPE_HEIGHT,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating from provider assets:', error);

    let errorMessage = 'Failed to generate images';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('required') || errorMessage.includes('Missing')) {
        statusCode = 400;
      } else if (errorMessage.includes('API key') || errorMessage.includes('quota')) {
        statusCode = 503;
      } else if (errorMessage.includes('blocked') || errorMessage.includes('Content blocked')) {
        statusCode = 400;
      }
    } else {
      errorMessage = `An unexpected error occurred: ${String(error)}`;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: statusCode }
    );
  } finally {
    await deleteBlobs(blobsToCleanup);
  }
}
