export const PORTRAIT_WIDTH = 500;
export const PORTRAIT_HEIGHT = 750;
export const LANDSCAPE_WIDTH = 688;
export const LANDSCAPE_HEIGHT = 524;

export interface ComposeTextClientParams {
  imageBase64: string;
  gameName: string;
  studioName: string;
  width: number;
  height: number;
}

/**
 * Calls the backend text compositor, which bakes the game/studio name overlay
 * onto the base image and returns the resulting PNG as base64.
 */
export async function composeTextOnImageClient(
  params: ComposeTextClientParams
): Promise<string> {
  const response = await fetch('/api/compose-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to apply text overlay.');
  }

  const data = await response.json();
  if (!data.image) {
    throw new Error('Text compositor returned no image.');
  }
  return data.image as string;
}
