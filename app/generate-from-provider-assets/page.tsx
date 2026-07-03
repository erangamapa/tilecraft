'use client';

import { upload } from '@vercel/blob/client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LANDSCAPE_HEIGHT as PROVIDER_LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH as PROVIDER_LANDSCAPE_WIDTH,
  PORTRAIT_HEIGHT as TARGET_HEIGHT,
  PORTRAIT_WIDTH as TARGET_WIDTH,
  composeTextOnImageClient,
} from '../lib/composeTextClient';
import {
  PROVIDER_ASSETS_PROMPT_LANDSCAPE,
  PROVIDER_ASSETS_PROMPT_PORTRAIT,
} from '../lib/prompts';
import ErrorDisplay from '../components/ErrorDisplay';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

function UploadArea({
  label,
  note,
  file,
  files,
  maxFiles,
  onFile,
  onFiles,
  onRemove,
  dragActive,
  setDragActive,
  inputRef,
  single = false,
}: {
  label: string;
  note: string;
  file?: File | null;
  files?: File[];
  maxFiles?: number;
  onFile?: (f: File | null) => void;
  onFiles?: (f: File[]) => void;
  onRemove?: (i: number) => void;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  single?: boolean;
}) {
  const items = single ? (file ? [file] : []) : files || [];
  const canAdd = single ? !file : (files?.length ?? 0) < (maxFiles ?? 2);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const list = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (single && list[0]) onFile?.(list[0]);
    else if (list.length) onFiles?.(list);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (single && list[0]) onFile?.(list[0]);
    else if (list.length) onFiles?.(list);
    e.target.value = '';
  };

  return (
    <div className="input-group">
      <label>
        {label} — {note}
      </label>
      <div
        className={`upload-area ${dragActive ? 'dragover' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {items.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                {items.map((f, i) => (
              <div key={i} style={{ position: 'relative', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  style={{ width: single ? 150 : 100, height: single ? 112 : 75, objectFit: 'cover', display: 'block' }}
                />
                {(onRemove || (single && onFile)) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); single && onFile ? onFile(null) : onRemove?.(i); }}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                      border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                )}
                <div style={{ padding: '4px 6px', fontSize: 11, color: '#666', maxWidth: single ? 150 : 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
              </div>
            ))}
            {canAdd && (
              <div
                style={{
                  width: single ? 150 : 100, height: single ? 112 : 75, border: '2px dashed #ccc', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12,
                }}
              >
                + Add
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="upload-icon">📁</div>
            <div className="upload-text">Click to upload or drag and drop</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={!single}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

export default function GenerateFromProviderAssetsPage() {
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const mainCharInputRef = useRef<HTMLInputElement>(null);
  const altCharsInputRef = useRef<HTMLInputElement>(null);
  const objectsInputRef = useRef<HTMLInputElement>(null);
  const gameNameImageInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<'upload' | 'generating' | 'playground'>('upload');
  const [outputType, setOutputType] = useState<'portrait' | 'landscape'>('portrait');
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [mainCharacterFile, setMainCharacterFile] = useState<File | null>(null);
  const [alternativeCharacterFiles, setAlternativeCharacterFiles] = useState<File[]>([]);
  const [objectFiles, setObjectFiles] = useState<File[]>([]);
  const [gameNameImageFile, setGameNameImageFile] = useState<File | null>(null);
  const [gameName, setGameName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [baseImageBase64, setBaseImageBase64] = useState<string | null>(null);
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationCost, setGenerationCost] = useState<{ totalCost: number; totalTokens: number } | null>(null);
  const [dragActiveBg, setDragActiveBg] = useState(false);
  const [dragActiveMain, setDragActiveMain] = useState(false);
  const [dragActiveAlt, setDragActiveAlt] = useState(false);
  const [dragActiveObj, setDragActiveObj] = useState(false);
  const [dragActiveGameNameImg, setDragActiveGameNameImg] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [customPromptPortrait, setCustomPromptPortrait] = useState(PROVIDER_ASSETS_PROMPT_PORTRAIT);
  const [customPromptLandscape, setCustomPromptLandscape] = useState(PROVIDER_ASSETS_PROMPT_LANDSCAPE);
  const [showPrompt, setShowPrompt] = useState(false);

  const previewWidth = outputType === 'landscape' ? PROVIDER_LANDSCAPE_WIDTH : TARGET_WIDTH;
  const previewHeight = outputType === 'landscape' ? PROVIDER_LANDSCAPE_HEIGHT : TARGET_HEIGHT;

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

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) return `${file.name} is not an image file.`;
    if (file.size > MAX_FILE_SIZE) return `${file.name} is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB).`;
    if (file.size === 0) return `${file.name} is empty.`;
    return null;
  };

  const handleFile = (setter: (f: File | null) => void, file: File | null) => {
    setUploadError(null);
    if (!file) { setter(null); return; }
    const err = validateFile(file);
    if (err) setUploadError(err);
    else setter(file);
  };

  const handleFiles = (setter: React.Dispatch<React.SetStateAction<File[]>>, files: File[], max: number) => {
    setUploadError(null);
    const valid: File[] = [];
    for (const f of files) {
      const err = validateFile(f);
      if (err) { setUploadError(err); return; }
      valid.push(f);
    }
    setter((prev) => [...prev, ...valid].slice(0, max));
  };

  const uploadFileToBlob = async (file: File, prefix: string): Promise<string> => {
    const blob = await upload(`${prefix}-${Date.now()}-${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/upload',
    });
    return blob.url;
  };

  const handleGenerate = async () => {
    if (!backgroundFile || !mainCharacterFile) return;

    setGenerationError(null);
    setCurrentStep('generating');

    try {
      // Upload files to Vercel Blob first (bypasses 4.5MB serverless body limit)
      const [backgroundUrl, mainCharacterUrl] = await Promise.all([
        uploadFileToBlob(backgroundFile, 'bg'),
        uploadFileToBlob(mainCharacterFile, 'main'),
      ]);
      const alternativeCharacterUrls = await Promise.all(
        alternativeCharacterFiles.map((f) => uploadFileToBlob(f, 'alt'))
      );
      const objectUrls = await Promise.all(objectFiles.map((f) => uploadFileToBlob(f, 'obj')));
      const gameNameImageUrl =
        outputType === 'landscape' && gameNameImageFile
          ? await uploadFileToBlob(gameNameImageFile, 'gname')
          : null;

      const body = {
        backgroundUrl,
        mainCharacterUrl,
        alternativeCharacterUrls,
        objectUrls,
        ...(gameNameImageUrl && { gameNameImageUrl }),
        outputType,
        gameName: gameName.trim(),
        studioName: studioName.trim(),
        ...(outputType === 'portrait' ? { customPromptPortrait } : { customPromptLandscape }),
      };

      const response = await fetch('/api/generate-from-provider-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      const imageData = outputType === 'portrait' ? data.image : data.imageLandscape;
      if (!imageData) throw new Error('No image generated. Please try again.');

      if (data.cost) setGenerationCost({ totalCost: data.cost.totalCost, totalTokens: data.cost.totalTokens });
      else setGenerationCost(null);

      setBaseImageBase64(imageData);
      setComposedImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setGenerationError(null);
      setCurrentStep('playground');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate. Please try again.');
      setCurrentStep('upload');
    }
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
    const a = document.createElement('a');
    a.href = composedImageUrl;
    a.download = `${gameName || 'tile'}-${outputType}.png`;
    a.click();
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <h1>Generate from Provider Assets</h1>
          <h2>Compose a background with main character and optional elements to generate portrait and landscape tiles</h2>
          <p style={{ marginTop: 8 }}>
            <Link href="/" style={{ color: '#4a90e2', textDecoration: 'underline' }}>← Back to main</Link>
          </p>
        </div>
      </div>

      {currentStep === 'upload' && (
        <div className="wizard-step active">
          <h2>Upload Images (in order)</h2>
          <ErrorDisplay error={uploadError} onDismiss={() => setUploadError(null)} />
          <ErrorDisplay error={generationError} onDismiss={() => setGenerationError(null)} />

          <div className="input-group">
            <label>Output type</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" name="outputType" checked={outputType === 'portrait'} onChange={() => setOutputType('portrait')} />
                Portrait (with text overlay)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" name="outputType" checked={outputType === 'landscape'} onChange={() => setOutputType('landscape')} />
                Landscape
              </label>
            </div>
          </div>

          <UploadArea
            label="1. Background image"
            note="background of the tile to be applied"
            file={backgroundFile}
            onFile={(f) => handleFile(setBackgroundFile, f)}
            dragActive={dragActiveBg}
            setDragActive={setDragActiveBg}
            inputRef={backgroundInputRef}
            single
          />

          <UploadArea
            label="2. Main Character"
            note="character to be prominent and appear large"
            file={mainCharacterFile}
            onFile={(f) => handleFile(setMainCharacterFile, f)}
            dragActive={dragActiveMain}
            setDragActive={setDragActiveMain}
            inputRef={mainCharInputRef}
            single
          />

          <UploadArea
            label="3. Alternative characters (max 2)"
            note="characters to appear smaller than main (optional)"
            files={alternativeCharacterFiles}
            maxFiles={2}
            onFiles={(f) => handleFiles(setAlternativeCharacterFiles, f, 2)}
            onRemove={(i) => setAlternativeCharacterFiles((p) => p.filter((_, j) => j !== i))}
            dragActive={dragActiveAlt}
            setDragActive={setDragActiveAlt}
            inputRef={altCharsInputRef}
          />

          <UploadArea
            label="4. Objects (max 2)"
            note="e.g. tool, nature element, man-made object (optional)"
            files={objectFiles}
            maxFiles={2}
            onFiles={(f) => handleFiles(setObjectFiles, f, 2)}
            onRemove={(i) => setObjectFiles((p) => p.filter((_, j) => j !== i))}
            dragActive={dragActiveObj}
            setDragActive={setDragActiveObj}
            inputRef={objectsInputRef}
          />

          {outputType === 'landscape' && (
            <UploadArea
              label="5. Game name as image (optional)"
              note="game name as an image wrapped in an object"
              file={gameNameImageFile}
              onFile={(f) => handleFile(setGameNameImageFile, f)}
              dragActive={dragActiveGameNameImg}
              setDragActive={setDragActiveGameNameImg}
              inputRef={gameNameImageInputRef}
              single
            />
          )}

          <div className="input-group">
            <label>Game Name (optional — overlaid on tile if filled)</label>
            <input type="text" placeholder="Enter game name (e.g., Sweet Bonanza)" value={gameName} onChange={(e) => setGameName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Studio Name (optional — overlaid on tile if filled)</label>
            <input type="text" placeholder="Enter studio name (e.g., Pragmatic Play)" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
          </div>

          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setShowPrompt((p) => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
                {showPrompt ? 'Hide' : 'Show'} AI prompts
              </button>
              {showPrompt && (
                <button type="button" onClick={() => { setCustomPromptPortrait(PROVIDER_ASSETS_PROMPT_PORTRAIT); setCustomPromptLandscape(PROVIDER_ASSETS_PROMPT_LANDSCAPE); }} style={{ padding: '4px 10px', fontSize: 12, background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
                  Reset to default
                </button>
              )}
            </label>
            {showPrompt && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {outputType === 'portrait' && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Portrait prompt ({'{{INPUT_STRUCTURE}}'} is replaced at generation)</label>
                    <textarea value={customPromptPortrait} onChange={(e) => setCustomPromptPortrait(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #ccc', resize: 'vertical' }} />
                  </div>
                )}
                {outputType === 'landscape' && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Landscape prompt ({'{{INPUT_STRUCTURE}}'} is replaced at generation)</label>
                    <textarea value={customPromptLandscape} onChange={(e) => setCustomPromptLandscape(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #ccc', resize: 'vertical' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="button-group">
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!backgroundFile || !mainCharacterFile}
            >
              Generate
            </button>
          </div>
        </div>
      )}

      {currentStep === 'generating' && (
        <div className="wizard-step active">
          <h2>Generating {outputType === 'portrait' ? 'Portrait' : 'Landscape'}...</h2>
          <p>Please wait while we generate your {outputType === 'portrait' ? 'portrait' : 'landscape'} tile.</p>
        </div>
      )}

      {currentStep === 'playground' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h1>{outputType === 'landscape' ? 'Landscape Tile' : 'Text Playground'}</h1>
              <h2>{outputType === 'landscape' ? 'Preview and download your landscape tile — add game/studio name to overlay text' : 'Preview and adjust the text layout on your portrait tile'}</h2>
              {generationCost && <p style={{ color: '#4a90e2', marginTop: 8, fontSize: 14, fontWeight: 500 }}>Generation Cost: ${generationCost.totalCost.toFixed(4)} ({generationCost.totalTokens} tokens)</p>}
            </div>
            <button className="btn-secondary" onClick={handleRegenerate}>Regenerate</button>
          </div>
          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div className="input-group"><label>Game Name (optional)</label><input type="text" value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="Enter game name" /></div>
              <div className="input-group"><label>Studio Name (optional)</label><input type="text" value={studioName} onChange={(e) => setStudioName(e.target.value)} placeholder="Enter studio name" /></div>
              <div className="input-group">
                <label>Preview Scale</label>
                <input type="range" min={1} max={4} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
              </div>
              <button className="btn-primary" onClick={handleDownload} disabled={!composedImageUrl}>
                Download {outputType === 'landscape' ? 'Landscape PNG (688×524)' : 'Portrait PNG'}
              </button>
            </div>
            <div style={{ flex: '0 0 auto', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ padding: 12, width: previewWidth * scale + 24, height: previewHeight * scale + 24, boxSizing: 'content-box' }}>
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
                  <div style={{ width: previewWidth * scale, height: previewHeight * scale, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
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
