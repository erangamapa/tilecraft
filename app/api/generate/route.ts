import { NextRequest, NextResponse } from 'next/server';
import { generateImageWithAI, getMimeType } from '../../lib/imageGeneration';
import { GENERATION_PROMPT_LANDSCAPE } from '../../lib/prompts';

const LANDSCAPE_WIDTH = 688;
const LANDSCAPE_HEIGHT = 524;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured. Please contact the administrator.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const inputAsset = formData.get('inputAsset') as File;
    const gameName = (formData.get('gameName') as string) || '';
    const studioName = (formData.get('studioName') as string) || '';
    const customPrompt = (formData.get('customPrompt') as string) || undefined;
    const outputType = (formData.get('outputType') as string) || 'portrait';

    if (!inputAsset) {
      return NextResponse.json(
        { error: 'Input asset is required. Please upload an image file.' },
        { status: 400 }
      );
    }

    let inputBuffer: Buffer;
    let inputMime: string;
    try {
      const inputArrayBuffer = await inputAsset.arrayBuffer();
      inputBuffer = Buffer.from(inputArrayBuffer);
      inputMime =
        inputAsset.type && inputAsset.type.startsWith('image/')
          ? inputAsset.type.split(';')[0].trim()
          : getMimeType(inputAsset.name);
    } catch (err) {
      throw new Error(`Failed to process input asset: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    const isLandscape = outputType === 'landscape';
    const effectivePrompt = customPrompt?.trim() || (isLandscape ? GENERATION_PROMPT_LANDSCAPE : undefined);
    const outputDimensions = isLandscape ? { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT } : undefined;

    const result = await generateImageWithAI(inputBuffer, inputMime, apiKey, effectivePrompt, outputDimensions);

    return NextResponse.json(
      {
        image: result.imageBuffer.toString('base64'),
        outputType,
        gameName: gameName.trim(),
        studioName: studioName.trim(),
        cost: result.cost,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error generating image:', error);

    let errorMessage = 'Failed to generate image';
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
  }
}
