'use client';

import { useState, useRef, useEffect } from 'react';
import ErrorDisplay from './ErrorDisplay';

interface Step1Props {
  active: boolean;
  onComplete: (images: File[]) => void;
}

const DEFAULT_EXAMPLES = [
  'avimasters.avif',
  'dragonspire.avif',
  'drop-the-boss.avif',
  'gates-of-olympus-1000.avif',
  'gold-portals.avif',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function Step1({ active, onComplete }: Step1Props) {
  const [mode, setMode] = useState<'default' | 'upload'>('default');
  const [images, setImages] = useState<File[]>([]);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load default images when mode is set to 'default'
  useEffect(() => {
    if (active && mode === 'default' && images.length === 0) {
      loadDefaultImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode]);

  const loadDefaultImages = async () => {
    setLoadingDefaults(true);
    setError(null);
    try {
      const loadedImages: File[] = [];
      
      for (const filename of DEFAULT_EXAMPLES) {
        try {
          const response = await fetch(`/examples/${filename}`);
          if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.statusText}`);
          }
          const blob = await response.blob();
          const file = new File([blob], filename, { type: blob.type || 'image/avif' });
          loadedImages.push(file);
        } catch (err) {
          throw new Error(`Failed to load default image: ${filename}. Please try uploading custom images.`);
        }
      }
      
      setImages(loadedImages);
    } catch (error) {
      console.error('Error loading default images:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load default images. Please try uploading custom images.';
      setError(errorMessage);
      setMode('upload');
    } finally {
      setLoadingDefaults(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    setError(null);

    try {
      const imageFiles: File[] = [];
      const errors: string[] = [];

      Array.from(files).forEach((file, index) => {
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
          errors.push(`${file.name} is not an image file`);
          return;
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name} is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
          return;
        }

        // Check if file is empty
        if (file.size === 0) {
          errors.push(`${file.name} is empty`);
          return;
        }

        imageFiles.push(file);
      });

      if (errors.length > 0) {
        setError(errors.join('. '));
      }

      const newImages = [...images, ...imageFiles].slice(0, 5);
      setImages(newImages);

      if (newImages.length > 5) {
        setError(`Only 5 images allowed. Showing first 5 images.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process files. Please try again.';
      setError(errorMessage);
    }
  };

  const handleModeChange = (newMode: 'default' | 'upload') => {
    setMode(newMode);
    setImages([]);
    setError(null);
    if (newMode === 'default') {
      loadDefaultImages();
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
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const handleNext = () => {
    if (images.length === 5) {
      onComplete(images);
    }
  };

  if (!active) return null;

  return (
    <div className="wizard-step active">
      <h2>Choose Example Images</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Use default examples or upload 5 custom example portrait tiles
      </p>

      <ErrorDisplay error={error} onDismiss={() => setError(null)} />

      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="exampleMode"
            value="default"
            checked={mode === 'default'}
            onChange={() => handleModeChange('default')}
          />
          <span>Use Default Examples</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="exampleMode"
            value="upload"
            checked={mode === 'upload'}
            onChange={() => handleModeChange('upload')}
          />
          <span>Upload Custom Images</span>
        </label>
      </div>

      {mode === 'upload' && (
        <div
          className={`upload-area ${dragActive ? 'dragover' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📁</div>
          <div className="upload-text">
            Click to upload or drag and drop
            <br />
            <small style={{ color: '#999' }}>
              {images.length}/5 images uploaded
            </small>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileInput}
          />
        </div>
      )}

      {mode === 'default' && loadingDefaults && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Loading default examples...
        </div>
      )}

      {images.length > 0 && (
        <div className="image-preview-grid">
          {images.map((image, index) => (
            <div key={index} className="image-preview">
              <img
                src={URL.createObjectURL(image)}
                alt={`Example ${index + 1}`}
              />
              {mode === 'upload' && (
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="button-group">
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={images.length !== 5}
        >
          Next
        </button>
      </div>
    </div>
  );
}
