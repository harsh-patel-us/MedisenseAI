import React, { useState, useRef } from 'react';

interface ReportUploaderProps {
  isUploading: boolean;
  onUpload: (file: File) => void;
  uploadedFileName?: string;
}

export default function ReportUploader({ isUploading, onUpload, uploadedFileName }: ReportUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="glass-card" style={{ padding: '32px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>📤</span> Upload Medical Report
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          Securely upload your health documents for instant AI analysis and personalized guidance.
        </p>
      </div>

      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        id="report-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="report-file-input"
        />

        {isUploading ? (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 24px', width: '56px', height: '56px', borderWidth: '4px' }} />
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: '8px' }}>
              Processing Document...
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Extracting medical data and preparing analysis
            </p>
          </div>
        ) : uploadedFileName ? (
          <div style={{ textAlign: 'center' }}>
            <div className="dropzone-icon-glow">✅</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: '8px' }}>
              {uploadedFileName}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Successfully uploaded and analyzed
            </p>
            <button className="btn-secondary" style={{ padding: '8px 20px', fontSize: '0.8rem' }}>
              Replace File
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="dropzone-icon-glow">📄</div>
            <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Drop your report here
            </p>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              or <span style={{ color: 'var(--brand-teal)', fontWeight: 700, textDecoration: 'underline' }}>browse your files</span>
            </p>
            
            <div style={{ 
              display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px',
              padding: '12px 24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>🔒 Secure</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>⚡ Instant</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>📏 Max 20MB</span>
              </div>
            </div>
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '20px' }}>
              Supports PDF, JPG, PNG formats
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
