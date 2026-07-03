'use client';

import ErrorDisplay from './ErrorDisplay';

interface Step3Props {
  active: boolean;
  error?: string | null;
}

export default function Step3({ active, error }: Step3Props) {
  if (!active) return null;

  return (
    <div className="wizard-step active">
      <div className="progress-container">
        {!error && (
          <>
            <div className="spinner" />
            <h2>Generating Portrait Tile...</h2>
            <p style={{ color: '#666', marginTop: '10px' }}>
              This may take a few moments. Please wait.
            </p>
          </>
        )}
        {error && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
            <ErrorDisplay error={error} />
            <p style={{ color: '#666', marginTop: '20px' }}>
              Please go back and try again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
