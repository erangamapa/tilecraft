'use client';

interface ErrorDisplayProps {
  error: string | null;
  onDismiss?: () => void;
}

export default function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '16px',
        background: '#fee',
        color: '#c33',
        borderRadius: '8px',
        fontSize: '14px',
        border: '1px solid #fcc',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div>{error}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#c33',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 8px',
              lineHeight: '1',
              marginLeft: '12px',
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
