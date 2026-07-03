'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  composeTextOnImageClient,
} from './lib/composeTextClient';
import { GENERATION_PROMPT, GENERATION_PROMPT_LANDSCAPE } from './lib/prompts';
import ErrorDisplay from './components/ErrorDisplay';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

export default function Home() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<'upload' | 'generating' | 'playground'>('upload');
  const [outputType, setOutputType] = useState<'portrait' | 'landscape'>('portrait');
  const [inputAsset, setInputAsset] = useState<File | null>(null);
  const [gameName, setGameName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [baseImageBase64, setBaseImageBase64] = useState<string | null>(null);
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationCost, setGenerationCost] = useState<{ totalCost: number; totalTokens: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [customPrompt, setCustomPrompt] = useState(GENERATION_PROMPT);
  const [showPrompt, setShowPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewWidth = outputType === 'landscape' ? LANDSCAPE_WIDTH : PORTRAIT_WIDTH;
  const previewHeight = outputType === 'landscape' ? LANDSCAPE_HEIGHT : PORTRAIT_HEIGHT;

  // Re-bake the text overlay on the backend whenever the base image or names change.
  useEffect(() => {
    if (currentStep !== 'playground' || !baseImageBase64) return;

    let cancelled = false;
    setComposing(true);
    const timer = setTimeout(async () => {
      try {
        const composed = await composeTextOnImageClient({
          imageBase64: baseImageBase64,
          gameName: gameName.trim(),
          studioName: studioName.trim(),
          width: previewWidth,
          height: previewHeight,
        });
        if (cancelled) return;
        setComposedImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return base64ToBlobUrl(composed);
        });
      } catch (err) {
        if (!cancelled) {
          setGenerationError(err instanceof Error ? err.message : 'Failed to apply text overlay.');
        }
      } finally {
        if (!cancelled) setComposing(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentStep, baseImageBase64, gameName, studioName, previewWidth, previewHeight]);

  const handleFile = (file: File | null) => {
    setUploadError(null);

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError(`${file.name} is not an image file. Please upload an image file.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`${file.name} is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB). Please choose a smaller file.`);
      return;
    }

    if (file.size === 0) {
      setUploadError(`${file.name} is empty. Please choose a valid image file.`);
      return;
    }

    try {
      setInputAsset(file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process file. Please try again.';
      setUploadError(errorMessage);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!inputAsset) return;

    setGenerationError(null);
    setCurrentStep('generating');

    try {
      const formData = new FormData();
      formData.append('inputAsset', inputAsset);
      formData.append('gameName', gameName.trim());
      formData.append('studioName', studioName.trim());
      formData.append('outputType', outputType);
      formData.append('customPrompt', customPrompt);

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate image';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Generation failed: ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an invalid response. Please try again.');
      }

      const data = await response.json();

      if (!data.image) {
        throw new Error('No image generated. Please try again.');
      }

      if (data.cost) {
        setGenerationCost({ totalCost: data.cost.totalCost, totalTokens: data.cost.totalTokens });
      } else {
        setGenerationCost(null);
      }

      setBaseImageBase64(data.image);
      setComposedImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setGenerationError(null);
      setCurrentStep('playground');
    } catch (error) {
      console.error('Error generating image:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to generate image. Please try again.';
      setGenerationError(errorMessage);
      setCurrentStep('upload');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleRegenerate = () => {
    if (composedImageUrl) URL.revokeObjectURL(composedImageUrl);
    setBaseImageBase64(null);
    setComposedImageUrl(null);
    setGenerationError(null);
    setGenerationCost(null);
    setCurrentStep('upload');
  };

  const handleDownload = () => {
    if (!composedImageUrl) return;
    const link = document.createElement('a');
    link.href = composedImageUrl;
    link.download = `${gameName || 'tile'}-${outputType}.png`;
    link.click();
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <h1>Tile Craft</h1>
          <h2>Tool that generates stunning portrait game tiles from casino game provider assets using Nano Banana and Canvas</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => router.push('/generate-from-provider-assets')}
            style={{
              padding: '8px 16px',
              background: '#4a90e2',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginTop: '10px',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#357abd';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#4a90e2';
            }}
          >
            Generate from Provider Assets (experimental)
          </button>
          {process.env.NEXT_PUBLIC_ENABLE_BULK_CONVERT === 'true' && (
            <button
              onClick={() => router.push('/bulk-convert')}
              style={{
                padding: '8px 16px',
                background: '#4a90e2',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                marginTop: '10px',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#357abd';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#4a90e2';
              }}
            >
              Bulk Convert
            </button>
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: '#e0e0e0',
              color: '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginTop: '10px',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#d0d0d0';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#e0e0e0';
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {currentStep === 'upload' && (
        <div className="wizard-step active">
          <h2>Upload Input Asset</h2>

          <ErrorDisplay error={uploadError} onDismiss={() => setUploadError(null)} />
          <ErrorDisplay error={generationError} onDismiss={() => setGenerationError(null)} />

          <div className="input-group">
            <label>Output type</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" name="outputType" checked={outputType === 'portrait'} onChange={() => { setOutputType('portrait'); setCustomPrompt(GENERATION_PROMPT); }} />
                Portrait (500×750)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" name="outputType" checked={outputType === 'landscape'} onChange={() => { setOutputType('landscape'); setCustomPrompt(GENERATION_PROMPT_LANDSCAPE); }} />
                Landscape (688×524)
              </label>
            </div>
          </div>

          <div className="input-group">
            <label>Input Asset Image</label>
            <div
              className={`upload-area ${dragActive ? 'dragover' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {inputAsset ? (
                <div>
                  <img
                    src={URL.createObjectURL(inputAsset)}
                    alt="Input asset"
                    style={{
                      maxWidth: '200px',
                      maxHeight: '200px',
                      borderRadius: '8px',
                      marginBottom: '10px',
                    }}
                  />
                  <div className="upload-text">{inputAsset.name}</div>
                </div>
              ) : (
                <>
                  <div className="upload-icon">📁</div>
                  <div className="upload-text">
                    Click to upload or drag and drop
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ marginTop: '16px', padding: '12px 0', borderTop: '1px solid #eee' }}>
              <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px', lineHeight: 1.5 }}>The asset you pick to upload among multiple assets given to you by the provider should have the following qualities:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
                <li>Use an image with sufficient resolution that is not blurry for the best results. (Provider can have same asset with multiple resolution versions.)</li>
                <li>The input asset file should include all objects and design elements, colors, fades, etc. that you want in the final generated tile. (Usually, every provider has one, and most likely it will be an existing game tile.)</li>
                <li>It&apos;s totally fine to have game name, studio name, badges, logos etc. in the input asset. We adjust them during generation and apply the correct fonts and styling to match the guidelines.</li>
              </ul>
            </div>
          </div>

          <div className="input-group">
            <label>Game Name (optional — overlaid on tile if filled)</label>
            <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px', lineHeight: 1.5 }}>Start the game name with &quot;Live&quot; if it&apos;s a live game.</p>
            <input
              type="text"
              placeholder="Enter game name (e.g., Sweet Bonanza)"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Studio Name (optional — overlaid on tile if filled)</label>
            <input
              type="text"
              placeholder="Enter studio name (e.g., Pragmatic Play)"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowPrompt((p) => !p)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  color: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                {showPrompt ? 'Hide' : 'Show'} AI prompt
              </button>
              <span style={{ color: '#666' }}>— modify before sending to AI</span>
              {showPrompt && (
                <button
                  type="button"
                  onClick={() => setCustomPrompt(outputType === 'landscape' ? GENERATION_PROMPT_LANDSCAPE : GENERATION_PROMPT)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Reset to default
                </button>
              )}
            </label>
            {showPrompt && (
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="AI generation prompt"
                rows={16}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  resize: 'vertical',
                  marginTop: '8px',
                }}
              />
            )}
          </div>

          <div className="button-group">
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!inputAsset}
            >
              Generate
            </button>
          </div>
        </div>
      )}

      {currentStep === 'generating' && (
        <div className="wizard-step active">
          <h2>Generating {outputType === 'landscape' ? 'Landscape' : 'Portrait'}...</h2>
          <p>Please wait while we generate your {outputType === 'landscape' ? 'landscape' : 'portrait'} tile.</p>
        </div>
      )}

      {currentStep === 'playground' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h1>{outputType === 'landscape' ? 'Landscape Tile' : 'Text Playground'}</h1>
              <h2>{outputType === 'landscape' ? 'Preview and download your landscape tile — add game/studio name to overlay text' : 'Preview and adjust the text layout on your generated tile'}</h2>
              {generationCost && (
                <p style={{ color: '#4a90e2', marginTop: '8px', fontSize: '14px', fontWeight: '500' }}>
                  Generation Cost: ${generationCost.totalCost.toFixed(4)} ({generationCost.totalTokens} tokens)
                </p>
              )}
            </div>
            <button className="btn-secondary" onClick={handleRegenerate}>
              Regenerate
            </button>
          </div>

          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div className="input-group">
                <label htmlFor="gameName">Game Name (optional)</label>
                <input
                  id="gameName"
                  type="text"
                  value={gameName}
                  onChange={(event) => setGameName(event.target.value)}
                  placeholder="Enter game name"
                />
              </div>

              <div className="input-group">
                <label htmlFor="studioName">Studio Name (optional)</label>
                <input
                  id="studioName"
                  type="text"
                  value={studioName}
                  onChange={(event) => setStudioName(event.target.value)}
                  placeholder="Enter studio name"
                />
              </div>

              <div className="input-group">
                <label htmlFor="scale">Preview Scale</label>
                <input
                  id="scale"
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                />
              </div>

              <button
                className="btn-primary"
                onClick={handleDownload}
                disabled={!composedImageUrl}
              >
                Download {outputType === 'landscape' ? 'Landscape PNG (688×524)' : 'Portrait PNG'}
              </button>
            </div>

            <div style={{ flex: '0 0 auto', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div
                style={{
                  padding: '12px',
                  width: previewWidth * scale + 24,
                  height: previewHeight * scale + 24,
                  boxSizing: 'content-box',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {outputType === 'landscape' ? 'Landscape 688×524' : 'Portrait 500×750'}
                  {composing && <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>applying text…</span>}
                </div>
                {composedImageUrl ? (
                  <img
                    src={composedImageUrl}
                    alt="Generated tile"
                    width={previewWidth}
                    height={previewHeight}
                    style={{ width: previewWidth * scale, height: previewHeight * scale, display: 'block' }}
                  />
                ) : (
                  <div
                    style={{
                      width: previewWidth * scale,
                      height: previewHeight * scale,
                      background: '#000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#666',
                      fontSize: 13,
                    }}
                  >
                    Rendering…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
