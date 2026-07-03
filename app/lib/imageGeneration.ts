import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  Part,
} from '@google/generative-ai';
import sharp from 'sharp';
import { GENERATION_PROMPT } from './prompts';
import { TARGET_HEIGHT, TARGET_WIDTH } from './textComposition';

export function fileToGenerativePart(buffer: Buffer, mimeType: string): Part {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };
}

export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml',
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/** Gemini API does not support SVG. Convert SVG to PNG before sending. */
async function normalizeInputForAPI(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const isSvg = mimeType === 'image/svg+xml' || mimeType === 'image/svg';
  if (!isSvg) return { buffer, mimeType };

  try {
    const pngBuffer = await sharp(buffer, { density: 200 }) // Rasterize at 200 DPI for good quality
      .png()
      .toBuffer();
    return { buffer: pngBuffer, mimeType: 'image/png' };
  } catch (err) {
    throw new Error(
      `Failed to convert SVG to PNG: ${err instanceof Error ? err.message : 'Unknown error'}. Ensure librsvg is available.`
    );
  }
}

export interface GenerationCost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number; // USD
  outputCost: number; // USD
  totalCost: number; // USD
}

export interface GenerationResult {
  imageBuffer: Buffer;
  cost: GenerationCost;
}
//const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';

export async function generateImageWithAI(
  inputBuffer: Buffer,
  inputMime: string,
  apiKey: string,
  customPrompt?: string,
  outputDimensions?: { width: number; height: number }
): Promise<GenerationResult> {
  const modelId = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    // Relax safety filters to allow casino artwork that may be flagged as explicit.
    // BLOCK_NONE = allow content regardless of safety probability.
    // Note: Google maintains non-configurable filters for certain content (e.g. child safety).
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const { buffer: apiBuffer, mimeType: apiMime } = await normalizeInputForAPI(inputBuffer, inputMime);

  const prompt = customPrompt?.trim() || GENERATION_PROMPT;
  const promptParts: Part[] = [
    { text: prompt },
    fileToGenerativePart(apiBuffer, apiMime),
  ];

  let result;
  try {
    result = await model.generateContent(promptParts);
  } catch (err) {
    if (err instanceof Error && err.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your GEMINI_API_KEY configuration.');
    }
    // Preserve the actual API error (429 rate limit, quota, RESOURCE_EXHAUSTED, etc.)
    const message =
      err instanceof Error
        ? err.message
        : (err as { message?: string; error?: { message?: string } })?.error?.message ??
          (err as { message?: string })?.message ??
          String(err);
    throw new Error(message);
  }

  const response = await result.response;
  console.log(response);

  // Extract usage metadata for cost calculation
  // Try both camelCase and snake_case property names
  const usageMetadata = response.usageMetadata || (response as any).usage_metadata;
  const inputTokens = usageMetadata?.promptTokenCount || usageMetadata?.prompt_token_count || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || usageMetadata?.candidates_token_count || 0;
  const totalTokens = usageMetadata?.totalTokenCount || usageMetadata?.total_token_count || 0;

  // Model-specific pricing (USD per 1M tokens)
  // Gemini 3 Pro Image: Input $2/1M, Output $120/1M (images)
  // Gemini 2.5 Flash Image: Input ~$0.30/1M, Output $30/1M (images, ~1290 tokens/img)
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

  // Check for safety ratings
  if (response.promptFeedback?.blockReason) {
    throw new Error(`Content blocked: ${response.promptFeedback.blockReason}.`);
  }

  const candidate = response.candidates?.[0];
  
  if (!candidate) {
    throw new Error('No response from AI model.');
  }

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

  // Resize to exact dimensions with high quality settings
  const outWidth = outputDimensions?.width ?? TARGET_WIDTH;
  const outHeight = outputDimensions?.height ?? TARGET_HEIGHT;
  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(imageBuffer)
      .resize(outWidth, outHeight, {
        fit: 'cover',
        position: 'top',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3, // High quality resampling
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

