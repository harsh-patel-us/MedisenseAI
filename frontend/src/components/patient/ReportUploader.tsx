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
    <div className="glass-card" style={{ padding: '28px' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        📤 Upload Medical Report
      </h2>

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
          <div>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--brand-teal)' }}>
              Uploading & extracting text...
            </p>
          </div>
        ) : uploadedFileName ? (
          <div>
            <p style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--brand-teal)' }}>
              {uploadedFileName}
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Click or drag to replace with a different file
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '3rem', marginBottom: '12px' }}>📄</p>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Drop your medical report here
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              or <span style={{ color: 'var(--brand-teal)', fontWeight: 600 }}>click to browse</span>
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '12px' }}>
              Supports PDF, JPG, PNG • Max 20 MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
