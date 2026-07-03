'use client';

import { useState, useRef } from 'react';
import ErrorDisplay from './ErrorDisplay';

interface Step2Props {
  active: boolean;
  onComplete: (asset: File, gameName: string, studioName: string) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function Step2({ active, onComplete }: Step2Props) {
  const [inputAsset, setInputAsset] = useState<File | null>(null);
  const [gameName, setGameName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    setError(null);
    
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      setError(`${file.name} is not an image file. Please upload an image file.`);
      return;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`${file.name} is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB). Please choose a smaller file.`);
      return;
    }

    // Check if file is empty
    if (file.size === 0) {
      setError(`${file.name} is empty. Please choose a valid image file.`);
      return;
    }

    try {
      setInputAsset(file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process file. Please try again.';
      setError(errorMessage);
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

  const handleGenerate = () => {
    if (inputAsset && gameName.trim()) {
      onComplete(inputAsset, gameName.trim(), studioName.trim());
    }
  };

  if (!active) return null;

  return (
    <div className="wizard-step active">
      <h2>Upload Input Asset & Enter Game Name</h2>

      <ErrorDisplay error={error} onDismiss={() => setError(null)} />

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
          />
        </div>
      </div>

      <div className="input-group">
        <label>Game Name</label>
        <input
          type="text"
          placeholder="Enter game name (e.g., Sweet Bonanza)"
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>Studio Name</label>
        <input
          type="text"
          placeholder="Enter studio name (e.g., Pragmatic Play)"
          value={studioName}
          onChange={(e) => setStudioName(e.target.value)}
        />
      </div>

      <div className="button-group">
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={!inputAsset || !gameName.trim()}
        >
          Generate
        </button>
      </div>
    </div>
  );
}
