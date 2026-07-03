import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  Part,
} from '@google/generative-ai';
import sharp from 'sharp';
import {
  buildGameNameImageSection,
  buildProviderAssetsInputStructure,
  PROVIDER_ASSETS_PROMPT_LANDSCAPE,
  PROVIDER_ASSETS_PROMPT_PORTRAIT,
} from './prompts';
import { TARGET_HEIGHT, TARGET_WIDTH } from './textComposition';
import {
  fileToGenerativePart,
  GenerationCost,
  GenerationResult,
  getMimeType,
} from './imageGeneration';

const PROVIDER_LANDSCAPE_WIDTH = 688;
const PROVIDER_LANDSCAPE_HEIGHT = 524;
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';

/** Gemini API does not support SVG. Convert SVG to PNG before sending. */
async function normalizeInputForAPI(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const isSvg = mimeType === 'image/svg+xml' || mimeType === 'image/svg';
  if (!isSvg) return { buffer, mimeType };

  try {
    const pngBuffer = await sharp(buffer, { density: 200 })
      .png()
      .toBuffer();
    return { buffer: pngBuffer, mimeType: 'image/png' };
  } catch (err) {
    throw new Error(
      `Failed to convert SVG to PNG: ${err instanceof Error ? err.message : 'Unknown error'}. Ensure librsvg is available.`
    );
  }
}

export type ProviderAssetsOutputType = 'portrait' | 'landscape';

export interface ProviderAssetsInput {
  background: { buffer: Buffer; mimeType: string };
  mainCharacter: { buffer: Buffer; mimeType: string };
  alternativeCharacters: Array<{ buffer: Buffer; mimeType: string }>;
  objects: Array<{ buffer: Buffer; mimeType: string }>;
  /** Optional: game name as image (landscape only). Placed at good size for visibility. */
  gameNameImage?: { buffer: Buffer; mimeType: string };
}

/** Generate from structured provider assets. Portrait: 500×750. Landscape: 688×524. */
export async function generateFromProviderAssets(
  input: ProviderAssetsInput,
  outputType: ProviderAssetsOutputType,
  apiKey: string,
  customPrompt?: string
): Promise<GenerationResult> {
  const basePrompt =
    outputType === 'portrait' ? PROVIDER_ASSETS_PROMPT_PORTRAIT : PROVIDER_ASSETS_PROMPT_LANDSCAPE;
  const hasGameNameImage = !!input.gameNameImage && outputType === 'landscape';
  const inputStructure = buildProviderAssetsInputStructure({
    hasMainCharacter: true,
    hasAlternativeCharacters: input.alternativeCharacters.length > 0,
    hasObjects: input.objects.length > 0,
    hasGameNameImage,
  });
  const gameNameImageSection = buildGameNameImageSection(hasGameNameImage);
  let prompt = (customPrompt?.trim() || basePrompt)
    .replace('{{INPUT_STRUCTURE}}', inputStructure)
    .replace('{{GAME_NAME_IMAGE_SECTION}}', gameNameImageSection);

  const imageParts: Part[] = [];
  const { buffer: bgApiBuffer, mimeType: bgApiMime } = await normalizeInputForAPI(
    input.background.buffer,
    input.background.mimeType
  );
  imageParts.push(fileToGenerativePart(bgApiBuffer, bgApiMime));

  const { buffer: mainApiBuffer, mimeType: mainApiMime } = await normalizeInputForAPI(
    input.mainCharacter.buffer,
    input.mainCharacter.mimeType
  );
  imageParts.push(fileToGenerativePart(mainApiBuffer, mainApiMime));

  for (const { buffer, mimeType } of input.alternativeCharacters) {
    const { buffer: apiBuffer, mimeType: apiMime } = await normalizeInputForAPI(buffer, mimeType);
    imageParts.push(fileToGenerativePart(apiBuffer, apiMime));
  }

  for (const { buffer, mimeType } of input.objects) {
    const { buffer: apiBuffer, mimeType: apiMime } = await normalizeInputForAPI(buffer, mimeType);
    imageParts.push(fileToGenerativePart(apiBuffer, apiMime));
  }

  if (input.gameNameImage && outputType === 'landscape') {
    const { buffer: apiBuffer, mimeType: apiMime } = await normalizeInputForAPI(
      input.gameNameImage.buffer,
      input.gameNameImage.mimeType
    );
    imageParts.push(fileToGenerativePart(apiBuffer, apiMime));
  }

  const modelId = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const promptParts: Part[] = [{ text: prompt }, ...imageParts];

  let result;
  try {
    result = await model.generateContent(promptParts);
  } catch (err) {
    if (err instanceof Error && err.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your GEMINI_API_KEY configuration.');
    }
    const message =
      err instanceof Error
        ? err.message
        : (err as { message?: string; error?: { message?: string } })?.error?.message ??
          (err as { message?: string })?.message ??
          String(err);
    throw new Error(message);
  }

  const response = await result.response;
  const usageMetadata = response.usageMetadata || (response as any).usage_metadata;
  const inputTokens = usageMetadata?.promptTokenCount || usageMetadata?.prompt_token_count || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || usageMetadata?.candidates_token_count || 0;
  const totalTokens = usageMetadata?.totalTokenCount || usageMetadata?.total_token_count || 0;

  const isProImage = modelId.includes('gemini-3-pro-image');
  const INPUT_COST_PER_MILLION = isProImage ? 2.0 : 0.3;
  const OUTPUT_COST_PER_MILLION = isProImage ? 120.0 : 30.0;
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
  const totalCost = inputCost + outputCost;

  const cost: GenerationCost = {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
  };

  if (response.promptFeedback?.blockReason) {
    throw new Error(`Content blocked: ${response.promptFeedback.blockReason}.`);
  }

  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error('No response from AI model.');
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Generation stopped: ${candidate.finishReason}.`);
  }

  const imagePart = candidate?.content.parts.find((part) => part.inlineData);
  if (!imagePart || !imagePart.inlineData) {
    throw new Error('No image data found in AI response.');
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  } catch (err) {
    throw new Error(`Failed to decode image data: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  const targetW = outputType === 'portrait' ? TARGET_WIDTH : PROVIDER_LANDSCAPE_WIDTH;
  const targetH = outputType === 'portrait' ? TARGET_HEIGHT : PROVIDER_LANDSCAPE_HEIGHT;

  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(imageBuffer)
      .resize(targetW, targetH, {
        fit: 'cover',
        position: 'top',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      })
      .png({
        quality: 100,
        compressionLevel: 6,
        adaptiveFiltering: true,
      })
      .toBuffer();
  } catch (err) {
    throw new Error(`Failed to process generated image: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return {
    imageBuffer: resizedBuffer,
    cost,
  };
}

export { PROVIDER_LANDSCAPE_WIDTH, PROVIDER_LANDSCAPE_HEIGHT };
