import { NextRequest } from 'next/server';
import { generateImageWithAI, getMimeType } from '../../lib/imageGeneration';
import { composeTextOnImage } from '../../lib/serverTextComposition';
import { TARGET_HEIGHT, TARGET_WIDTH } from '../../lib/textComposition';


interface CSVRow {
  id?: string; // Optional ID field
  uuid: string;
  gameName: string;
  studioName: string;
  imageUrl: string;
}

function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const results: CSVRow[] = [];
  
  // Skip header row - check for common header patterns
  const headerLine = lines[0]?.toLowerCase() || '';
  const startIndex = (headerLine.includes('id') || headerLine.includes('uuid') || headerLine.includes('game name')) ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // Handle quoted fields and commas within quotes
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    
    // Format: ID (optional), UUID, Game Name, Studio Name, Image URL
    // Handle both formats: with ID (5 columns) or without ID (4 columns)
    if (parts.length >= 4) {
      let id: string | undefined;
      let uuid: string;
      let gameName: string;
      let studioName: string;
      let imageUrl: string;
      
      if (parts.length === 5) {
        // Has ID column
        id = parts[0].replace(/^"|"$/g, '').trim() || undefined;
        uuid = parts[1].replace(/^"|"$/g, '').trim();
        gameName = parts[2].replace(/^"|"$/g, '').trim();
        studioName = parts[3].replace(/^"|"$/g, '').trim();
        imageUrl = parts[4].replace(/^"|"$/g, '').trim();
      } else {
        // No ID column (4 columns)
        uuid = parts[0].replace(/^"|"$/g, '').trim();
        gameName = parts[1].replace(/^"|"$/g, '').trim();
        studioName = parts[2].replace(/^"|"$/g, '').trim();
        imageUrl = parts[3].replace(/^"|"$/g, '').trim();
      }
      
      // Only add if we have required fields
      if (uuid && gameName && imageUrl) {
        results.push({
          id,
          uuid,
          gameName,
          studioName: studioName || '', // Studio name can be empty
          imageUrl,
        });
      }
    }
  }
  
  return results;
}

function sanitizeCSV(rows: CSVRow[]): Array<{ imageUrl: string; gameName: string; studioName: string; uuid: string; id?: string }> {
  // 1. Remove rows with empty game name
  const withGameNames = rows.filter(row => row.gameName && row.gameName.trim());

  // 2. Remove duplicates based on UUID (keep first occurrence)
  const seen = new Map<string, { imageUrl: string; gameName: string; studioName: string; uuid: string; id?: string }>();
  for (const row of withGameNames) {
    const uuidKey = row.uuid.trim().toLowerCase();
    if (!seen.has(uuidKey)) {
      seen.set(uuidKey, {
        imageUrl: row.imageUrl.trim(),
        gameName: row.gameName.trim(),
        studioName: row.studioName.trim(),
        uuid: row.uuid.trim(),
        id: row.id?.trim(),
      });
    }
  }

  return Array.from(seen.values());
}

async function fetchImageFromUrl(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(imageUrl, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image (${response.status}): ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Downloaded image is empty');
      }
      
      // Determine MIME type from Content-Type header or URL extension
      let mimeType = response.headers.get('content-type') || '';
      if (!mimeType || !mimeType.startsWith('image/')) {
        // Fallback to URL extension
        const urlLower = imageUrl.toLowerCase();
        if (urlLower.includes('.svg')) {
          mimeType = 'image/svg+xml';
        } else if (urlLower.includes('.webp')) {
          mimeType = 'image/webp';
        } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (urlLower.includes('.png')) {
          mimeType = 'image/png';
        } else {
          mimeType = 'image/webp'; // Default
        }
      } else {
        // Extract just the MIME type part (remove charset, etc.)
        mimeType = mimeType.split(';')[0].trim();
      }
      
      return { buffer: Buffer.from(arrayBuffer), mimeType };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('aborted')) {
        throw new Error(`Timeout downloading image: ${imageUrl}`);
      }
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new Error(`Image does not exist at URL: ${imageUrl}`);
      }
      throw new Error(`Failed to download image ${imageUrl}: ${error.message}`);
    }
    throw new Error(`Unknown error downloading image: ${imageUrl}`);
  }
}

async function generateSingleImage(
  inputBuffer: Buffer,
  inputMime: string,
  gameName: string,
  studioName: string,
  apiKey: string
): Promise<{ imageBuffer: Buffer; cost: import('../../lib/imageGeneration').GenerationCost }> {
  const generated = await generateImageWithAI(inputBuffer, inputMime, apiKey);
  // Bake the game/studio name overlay into the image server-side.
  const composed = await composeTextOnImage({
    baseImage: generated.imageBuffer,
    gameName,
    studioName,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
  });
  return { imageBuffer: composed, cost: generated.cost };
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_BULK_CONVERT !== 'true') {
    return new Response(
      JSON.stringify({ error: 'Bulk convert is not enabled.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured. Please contact the administrator.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const formData = await request.formData();
    const csvFile = formData.get('csvFile') as File;

    if (!csvFile) {
      return new Response(
        JSON.stringify({ error: 'CSV file is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV
    const csvText = await csvFile.text();
    const csvRows = parseCSV(csvText);

    if (csvRows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'CSV file is empty or invalid.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize CSV
    const sanitized = sanitizeCSV(csvRows);
    const total = sanitized.length;

    // Create a ReadableStream for Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial progress for sanitization
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', current: 0, total })}\n\n`));
        
        // Simulate sanitization progress (since it's instant, just send completion)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'sanitization_complete', 
          total,
          pendingItems: sanitized.map(row => ({
            imagePath: row.imageUrl,
            gameName: row.gameName,
            studioName: row.studioName,
            id: row.id,
          }))
        })}\n\n`));

        // Process images in batches of 10 to avoid overwhelming the API
        const BATCH_SIZE = 10;
        const batches: Array<typeof sanitized> = [];
        
        // Split sanitized array into batches of 10
        for (let i = 0; i < sanitized.length; i += BATCH_SIZE) {
          batches.push(sanitized.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`[bulk-generate] Processing ${sanitized.length} images in ${batches.length} batches of ${BATCH_SIZE}`);
        
        // Process each batch sequentially, but items within each batch run in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[bulk-generate] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
          
          const batchPromises = batch.map(async (row) => {
            try {
              // Fetch image from URL - if this fails, skip and continue
              let imageBuffer: Buffer;
              let mimeType: string;
              try {
                const fetchResult = await fetchImageFromUrl(row.imageUrl);
                imageBuffer = fetchResult.buffer;
                mimeType = fetchResult.mimeType;
              } catch (downloadError) {
                // Skip this image and continue with others
                const errorResult = {
                  imagePath: row.imageUrl,
                  gameName: row.gameName,
                  studioName: row.studioName,
                  id: row.id,
                  error: downloadError instanceof Error ? downloadError.message : 'Failed to download image',
                };
                
                // Send error result immediately
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', result: errorResult, total })}\n\n`));
                
                return errorResult;
              }

              // Generate image
              const generationResult = await generateSingleImage(
                imageBuffer,
                mimeType,
                row.gameName,
                row.studioName,
                apiKey
              );

              const result = {
                imagePath: row.imageUrl,
                gameName: row.gameName,
                studioName: row.studioName,
                id: row.id,
                image: generationResult.imageBuffer.toString('base64'),
                cost: generationResult.cost,
              };

              // Send result as soon as it's ready
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', result, total })}\n\n`));
              
              return result;
            } catch (error) {
              // Catch any other errors (generation errors, etc.)
              const errorResult = {
                imagePath: row.imageUrl,
                gameName: row.gameName,
                studioName: row.studioName,
                id: row.id,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              };
              
              // Send error result and continue processing others
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', result: errorResult, total })}\n\n`));
              
              return errorResult;
            }
          });

          // Wait for current batch to complete before starting next batch
          await Promise.all(batchPromises);
          
          console.log(`[bulk-generate] Batch ${batchIndex + 1}/${batches.length} completed`);
        }

        // Send completion message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', total })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error processing bulk conversion:', error);
    
    let errorMessage = 'Failed to process bulk conversion';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (errorMessage.includes('required') || errorMessage.includes('Missing')) {
        statusCode = 400;
      } else if (errorMessage.includes('API key') || errorMessage.includes('quota')) {
        statusCode = 503;
      }
    } else {
      errorMessage = `An unexpected error occurred: ${String(error)}`;
    }

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      }),
      { 
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
