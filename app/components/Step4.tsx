'use client';

interface Step4Props {
  active: boolean;
  imageUrls: string[];
  gameName: string;
  onReset: () => void;
}

export default function Step4({ active, imageUrls, gameName, onReset }: Step4Props) {
  const handleDownload = (imageUrl: string, variation: number) => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${gameName.replace(/\s+/g, '-').toLowerCase()}-variation${variation}-500x656.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!active) return null;

  return (
    <div className="wizard-step active">
      <div className="result-container">
        <h2>Generated Portrait Tiles</h2>
        <p style={{ color: '#666', marginBottom: '20px', textAlign: 'center' }}>
          {imageUrls.length} variation{imageUrls.length !== 1 ? 's' : ''} generated
        </p>
        {imageUrls.length > 0 && (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '20px', 
              marginBottom: '30px',
              justifyContent: 'center'
            }}>
              {imageUrls.map((imageUrl, index) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  padding: '15px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  background: '#fafafa'
                }}>
                  <img 
                    src={imageUrl} 
                    alt={`Generated portrait tile variation ${index + 1}`} 
                    className="result-image"
                    style={{ marginBottom: '15px' }}
                  />
                  <button 
                    className="btn-primary" 
                    onClick={() => handleDownload(imageUrl, index + 1)}
                    style={{ width: '100%' }}
                  >
                    Download Variation {index + 1}
                  </button>
                </div>
              ))}
            </div>
            <div className="button-group" style={{ justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={onReset}>
                Generate Another
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
