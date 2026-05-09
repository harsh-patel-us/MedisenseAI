import React, { useState, useRef } from 'react';

interface ReportUploaderProps {
  isUploading: boolean;
  /**
   * True while the AI analysis runs after the upload completes. Lets the
   * uploader stay in a single continuous "processing" state through
   * upload → analyze, instead of briefly flipping to "uploaded" and then
   * surprising the user with a separate spinner below.
   */
  isAnalyzing?: boolean;
  /** True once `setAnalysis(...)` has populated; flips the card to success. */
  analysisComplete?: boolean;
  onUpload: (file: File) => void;
  uploadedFileName?: string;
}

export default function ReportUploader({
  isUploading,
  isAnalyzing = false,
  analysisComplete = false,
  onUpload,
  uploadedFileName,
}: ReportUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = isUploading || isAnalyzing;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (busy) return;
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
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => { if (!busy) fileInputRef.current?.click(); }}
        id="report-dropzone"
        aria-busy={busy}
        style={{
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          disabled={busy}
          style={{ display: 'none' }}
          id="report-file-input"
        />

        {busy ? (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 24px', width: '56px', height: '56px', borderWidth: '4px' }} />
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: '8px' }}>
              {isUploading ? 'Uploading your report…' : 'Analyzing your report…'}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isUploading
                ? 'Securely transferring and extracting text from your file'
                : 'AI is reading your report and generating findings, summary, and a personalized health guide'}
            </p>
            {/* Two-phase progress strip */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
              }}
            >
              <PhaseBadge label="Upload" active={isUploading} done={!isUploading} />
              <span style={{ color: 'var(--border-subtle)' }}>›</span>
              <PhaseBadge label="Analysis" active={isAnalyzing} done={false} />
              <span style={{ color: 'var(--border-subtle)' }}>›</span>
              <PhaseBadge label="Ready" active={false} done={false} />
            </div>
          </div>
        ) : uploadedFileName ? (
          <div style={{ textAlign: 'center' }}>
            <div className="dropzone-icon-glow">✅</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: '8px' }}>
              {uploadedFileName}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              {analysisComplete ? 'Successfully uploaded and analyzed' : 'Uploaded — analysis pending'}
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

/**
 * Tiny pill that brightens up when its phase is the active one. Used in the
 * `Upload › Analysis › Ready` strip so the user can see which step the
 * processing pipeline is on — much clearer than a single spinner.
 */
function PhaseBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const color = active
    ? 'var(--brand-teal)'
    : done
      ? '#86efac'
      : 'var(--text-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--brand-teal)' : 'var(--border-subtle)'}`,
        background: active ? 'rgba(5,174,187,0.10)' : 'transparent',
        color,
        fontWeight: active ? 700 : 600,
        animation: active ? 'pulse-dot 1.6s ease-in-out infinite' : undefined,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
        }}
      />
      {label}
    </span>
  );
}
