'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import JSZip from 'jszip';
import {
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  composeTextOnImageClient,
} from '../lib/composeTextClient';

interface GenerationCost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

interface ConversionResult {
  imagePath: string; // Image URL from CSV
  gameName: string;
  studioName: string;
  id?: string; // ID from CSV
  image?: string; // base64
  error?: string;
  isProcessing?: boolean;
  cost?: GenerationCost;
}

interface PendingItem {
  imagePath: string;
  gameName: string;
  studioName: string;
  id?: string;
}

const BULK_CONVERT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BULK_CONVERT === 'true';

export default function BulkConvert() {
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [regeneratingIndices, setRegeneratingIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Redirect to home if bulk convert is disabled
  useEffect(() => {
    if (!BULK_CONVERT_ENABLED) {
      router.replace('/');
    }
  }, [router]);

  const handleCsvFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }
    setCsvFile(file);
    setError(null);
  };

  const handleCsvInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleCsvFile(e.target.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!csvFile) {
      setError('Please upload a CSV file');
      return;
    }

    setIsSanitizing(true);
    setIsConverting(false);
    setError(null);
    setResults([]);
    setPendingItems([]);
    setProgress({ current: 0, total: 0 });

    try {
      const formData = new FormData();
      formData.append('csvFile', csvFile);

      const response = await fetch('/api/bulk-generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to process bulk conversion';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Processing failed: ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMessage);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let totalProcessed = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                // Progress during sanitization
                setProgress({ current: data.current, total: data.total });
              } else if (data.type === 'sanitization_complete') {
                // Sanitization done, conversion starting
                setIsSanitizing(false);
                setIsConverting(true);
                setPendingItems(data.pendingItems || []);
                setProgress({ current: 0, total: data.total });
              } else if (data.type === 'result') {
                // A conversion completed - text overlay is already baked in by the backend
                const result = data.result;
                setResults(prev => {
                  const updated = [...prev];
                  const index = updated.findIndex(r => r.imagePath === result.imagePath);
                  if (index >= 0) {
                    updated[index] = { ...updated[index], ...result };
                  } else {
                    updated.push(result);
                  }
                  return updated;
                });
                setPendingItems(prev => prev.filter(item => item.imagePath !== result.imagePath));
                totalProcessed++;
              } else if (data.type === 'complete') {
                // All conversions done
                setIsConverting(false);
                setPendingItems([]);
              } else if (data.type === 'error') {
                setError(data.message);
                setIsSanitizing(false);
                setIsConverting(false);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'result') {
                const result = data.result;
                setResults(prev => [...prev, result]);
              }
            } catch (e) {
              console.error('Error parsing final SSE data:', e);
            }
          }
        }
      }

      setIsSanitizing(false);
      setIsConverting(false);
    } catch (error) {
      console.error('Error processing bulk conversion:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to process bulk conversion. Please try again.';
      setError(errorMessage);
      setIsSanitizing(false);
      setIsConverting(false);
    }
  };

  const handleDownload = (result: ConversionResult) => {
    if (result.error || !result.image) return;
    
    const binaryString = atob(result.image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Use ID for filename, fallback to game name, then 'image'
    const filename = result.id || result.gameName || 'image';
    link.download = `${filename}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadUnselected = async () => {
    // Download unselected items (items that are NOT in selectedIndices) without errors as ZIP
    const resultsToDownload = results
      .map((result, index) => ({ result, index }))
      .filter(({ result, index }) => 
        !selectedIndices.has(index) && 
        result && 
        !result.error && 
        result.image
      )
      .map(({ result }) => result);
    
    if (resultsToDownload.length === 0) {
      return;
    }

    try {
      const zip = new JSZip();
      
      // Add each image to the ZIP file
      resultsToDownload.forEach((result) => {
        const binaryString = atob(result.image!);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Use ID for filename, fallback to game name, then 'image'
        // Sanitize it for filesystem
        const baseName = result.id || result.gameName || 'image';
        const sanitizedName = baseName
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase();
        const filename = `${sanitizedName}.png`;
        
        zip.file(filename, bytes);
      });
      
      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      // Use CSV filename (without extension) + '_output.zip'
      const csvFileName = csvFile?.name || 'bulk-convert';
      const csvBaseName = csvFileName.replace(/\.csv$/i, '');
      link.download = `${csvBaseName}_output.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      setError('Failed to create ZIP file. Please try again.');
    }
  };

  const handleToggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleUnselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleRegenerateSelected = async () => {
    const selectedResults = Array.from(selectedIndices)
      .map(index => results[index])
      .filter(result => result && !result.error);
    
    if (selectedResults.length === 0) return;

    setRegeneratingIndices(new Set(selectedIndices));

    try {
      // Regenerate each selected item
      const regeneratePromises = selectedResults.map(async (result, idx) => {
        const originalIndex = Array.from(selectedIndices)[idx];
        
        try {
          // Fetch image from URL directly
          const imageUrl = result.imagePath;
          
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          
          // Call regenerate API
          const formData = new FormData();
          const blob = new Blob([arrayBuffer], { type: response.headers.get('content-type') || 'image/webp' });
          formData.append('inputAsset', blob, `${result.imagePath}.webp`);
          formData.append('gameName', result.gameName);
          formData.append('studioName', result.studioName);
          // DO NOT add text overlay on server - we'll do it in frontend for 100% match

          const regenerateResponse = await fetch('/api/generate', {
            method: 'POST',
            body: formData,
          });

          if (!regenerateResponse.ok) {
            throw new Error('Regeneration failed');
          }

          const data = await regenerateResponse.json();

          // Bake the text overlay via the backend compositor
          if (data.image) {
            let composedBase64 = data.image;
            try {
              composedBase64 = await composeTextOnImageClient({
                imageBase64: data.image,
                gameName: result.gameName,
                studioName: result.studioName,
                width: PORTRAIT_WIDTH,
                height: PORTRAIT_HEIGHT,
              });
            } catch (overlayErr) {
              console.error('Error applying text overlay during regeneration:', overlayErr);
            }
            setResults(prev => {
              const newResults = [...prev];
              if (newResults[originalIndex]) {
                newResults[originalIndex] = {
                  ...newResults[originalIndex],
                  image: composedBase64,
                  error: undefined,
                  cost: data.cost, // Include cost from regeneration
                };
              }
              return newResults;
            });
          }
        } catch (error) {
          // Update with error
          setResults(prev => {
            const newResults = [...prev];
            if (newResults[originalIndex]) {
              newResults[originalIndex] = {
                ...newResults[originalIndex],
                error: error instanceof Error ? error.message : 'Regeneration failed',
              };
            }
            return newResults;
          });
        } finally {
          setRegeneratingIndices(prev => {
            const newSet = new Set(prev);
            newSet.delete(originalIndex);
            return newSet;
          });
        }
      });

      await Promise.all(regeneratePromises);
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setRegeneratingIndices(new Set());
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleReset = () => {
    setCsvFile(null);
    setResults([]);
    setPendingItems([]);
    setSelectedIndices(new Set());
    setRegeneratingIndices(new Set());
    setError(null);
    setProgress({ current: 0, total: 0 });
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  const selectedCount = selectedIndices.size;
  const unselectedSuccessCount = results.filter((r, index) => 
    !selectedIndices.has(index) && !r.error
  ).length;
  
  // Calculate total cost
  const totalCost = results
    .filter(r => !r.error && r.cost)
    .reduce((sum, r) => sum + (r.cost?.totalCost || 0), 0);

  if (!BULK_CONVERT_ENABLED) {
    return null; // Redirect happens in useEffect
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ flex: 1 }}>
          <h1>Bulk Convert</h1>
          <h2>Convert multiple images at once using CSV file with image URLs</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link
            href="/"
            style={{
              padding: '8px 16px',
              background: '#e0e0e0',
              color: '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Single Convert
          </Link>
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
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {results.length === 0 && !isSanitizing && !isConverting && (
        <div className="wizard-step active">
          <h2>Upload CSV File</h2>
          
          {error && (
            <div style={{
              padding: '12px',
              background: '#fee',
              color: '#c33',
              borderRadius: '6px',
              marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          <div className="input-group">
            <label>CSV File (format: ID,UUID,Game Name,Studio Name,Image URL)</label>
            <div
              className="upload-area"
              onClick={() => csvInputRef.current?.click()}
            >
              {csvFile ? (
                <div>
                  <div className="upload-icon">📄</div>
                  <div className="upload-text">{csvFile.name}</div>
                </div>
              ) : (
                <>
                  <div className="upload-icon">📁</div>
                  <div className="upload-text">Click to upload CSV file</div>
                </>
              )}
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvInput}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              <div style={{ marginBottom: '12px' }}>Example format:</div>
              <pre style={{
                padding: '12px',
                background: '#f5f5f5',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '12px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
{`ID,UUID,Game Name,Studio Name,Image URL
5536,293da067-41a7-4abe-96f2-bc8de71a5dcc,Coins of Alkemor,Betsoft,<url to image>
5537,647e9db6-8eef-4501-abee-284fd38adf01,6 Jokers,Pragmatic Play,<url to image>`}
              </pre>
              <div style={{ marginTop: '12px' }}>
                <strong>Note:</strong> For live casino games, ensure the word &quot;Live&quot; appears in front of every game name in the CSV (e.g. &quot;Live Blackjack&quot;, &quot;Live Baccarat&quot;).
              </div>
              <div style={{ marginTop: '12px' }}>
                The CSV will be automatically sanitized:<br />
                • Removed empty Game Name rows<br />
                • Removed duplicates based on UUID (keeping first occurrence)<br />
                • Images fetched from Image URL directly
              </div>
            </div>
          </div>

          <div className="button-group">
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!csvFile}
            >
              Start Bulk Conversion
            </button>
          </div>
        </div>
      )}

      {isSanitizing && (
        <div className="wizard-step active">
          <h2>Sanitizing CSV...</h2>
          <p>Sorting, removing duplicates, and preparing images for conversion...</p>
          {progress.total > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ marginBottom: '8px' }}>
                Progress: {progress.current} / {progress.total}
              </div>
              <div style={{
                width: '100%',
                height: '24px',
                background: '#e0e0e0',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  height: '100%',
                  background: '#4a90e2',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {(results.length > 0 || isConverting) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2>Results</h2>
              <p style={{ color: '#666', marginTop: '8px' }}>
                Success: {successCount} | Errors: {errorCount}
                {totalCost > 0 && (
                  <span style={{ marginLeft: '16px', fontWeight: 'bold', color: '#4a90e2' }}>
                    Total Cost: ${totalCost.toFixed(4)}
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {selectedCount > 0 && (
                <>
                  {unselectedSuccessCount > 0 && (
                    <button className="btn-primary" onClick={handleDownloadUnselected}>
                      Download Unselected ({unselectedSuccessCount})
                    </button>
                  )}
                  <button 
                    className="btn-primary" 
                    onClick={handleRegenerateSelected}
                    disabled={regeneratingIndices.size > 0}
                    style={{ 
                      opacity: regeneratingIndices.size > 0 ? 0.6 : 1,
                      cursor: regeneratingIndices.size > 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Regenerate Selected ({selectedCount})
                  </button>
                  {selectedCount > 1 && (
                    <button className="btn-secondary" onClick={handleUnselectAll}>
                      Unselect All
                    </button>
                  )}
                </>
              )}
              {selectedCount === 0 && successCount > 0 && (
                <button className="btn-primary" onClick={handleDownloadUnselected}>
                  Download All ({successCount})
                </button>
              )}
              <button className="btn-secondary" onClick={handleReset}>
                Start Over
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '20px',
            marginTop: '20px',
          }}>
            {/* Show pending items with spinners (always on top) */}
            {pendingItems.map((item, index) => (
              <div
                key={`pending-${index}`}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '12px',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #4a90e2',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '16px',
                }} />
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                <div style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>
                  {item.gameName}
                </div>
                {item.studioName && (
                  <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                    {item.studioName}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#999', textAlign: 'center' }}>
                  Processing...
                </div>
              </div>
            ))}
            
            {/* Show completed results - successful items first, errors last */}
            {results
              .map((result, originalIndex) => ({ result, originalIndex }))
              .sort((a, b) => {
                // Successful items (no error) come first
                if (!a.result.error && b.result.error) return -1;
                if (a.result.error && !b.result.error) return 1;
                // Maintain original order within each group
                return a.originalIndex - b.originalIndex;
              })
              .map(({ result, originalIndex }) => {
              const isSelected = selectedIndices.has(originalIndex);
              const isRegenerating = regeneratingIndices.has(originalIndex);
              
              return (
                <div
                  key={`result-${originalIndex}`}
                  onClick={() => handleToggleSelection(originalIndex)}
                  style={{
                    border: isSelected ? '9px solid #4a90e2' : '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '12px',
                    background: result.error ? '#fee' : '#fff',
                    cursor: 'pointer',
                    transition: 'border 0.2s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.border = '2px solid #4a90e2';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.border = '1px solid #ddd';
                    }
                  }}
                >
                  {isRegenerating && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(255, 255, 255, 0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      zIndex: 10,
                    }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #4a90e2',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                    </div>
                  )}
                  
                  {result.error ? (
                    <>
                      <div style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '14px', color: '#c33' }}>
                        {result.gameName}
                      </div>
                      {result.studioName && (
                        <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                          {result.studioName}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', wordBreak: 'break-all' }}>
                        {result.imagePath}
                      </div>
                      <div style={{ color: '#c33', fontSize: '14px', marginBottom: '8px', padding: '8px', background: '#fee', borderRadius: '4px' }}>
                        {result.error}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: '8px', position: 'relative' }}>
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: '#4a90e2',
                            color: 'white',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            zIndex: 5,
                          }}>
                            ✓
                          </div>
                        )}
                        <img
                          src={`data:image/png;base64,${result.image}`}
                          alt={result.imagePath}
                          style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            opacity: isRegenerating ? 0.5 : 1,
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '14px' }}>
                        {result.gameName}
                      </div>
                      {result.studioName && (
                        <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                          {result.studioName}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', wordBreak: 'break-all' }}>
                        {result.imagePath}
                      </div>
                      {result.cost && (
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#4a90e2', 
                          marginBottom: '8px',
                          padding: '4px 8px',
                          background: '#f0f7ff',
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          Cost: ${result.cost.totalCost.toFixed(4)}
                          <span style={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>
                            ({result.cost.totalTokens} tokens)
                          </span>
                        </div>
                      )}
                      <button
                        className="btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(result);
                        }}
                        style={{ width: '100%', fontSize: '12px', padding: '6px 12px' }}
                      >
                        Download
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
