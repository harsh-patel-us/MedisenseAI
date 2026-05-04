import { useRef, useState } from 'react';
import { uploadAudioFile } from '../../api/doctorApi';
import type { TranscriptSegment } from '../../types/doctor.types';

interface AudioFileUploadProps {
  onTranscribed: (segments: TranscriptSegment[], sessionId: string, rawText: string) => void;
  onClear: () => void;
  hasTranscript: boolean;
}

const ACCEPTED = '.mp3,.wav,.webm,.ogg,.flac,.m4a,audio/*';
const MAX_MB = 20;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AudioFileUpload({ onTranscribed, onClear, hasTranscript }: AudioFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setSelectedFile(file);
    setProgress(0);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const res = await uploadAudioFile(selectedFile, (p) => setProgress(p));
      onTranscribed(res.transcript, res.session_id, res.raw_text);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Upload failed';
      setError(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleClearLocal = () => {
    setSelectedFile(null);
    setProgress(0);
    setError(null);
    onClear();
  };

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
          🎧 Upload Consultation Audio
        </h2>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {!selectedFile ? (
        <div
          onClick={handlePick}
          style={{
            border: '2px dashed var(--border-subtle)',
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
            background: 'rgba(15,30,60,0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-teal)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
          }}
        >
          <p style={{ fontSize: '2.2rem', marginBottom: 6 }}>🎙️</p>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 4 }}>
            Click to select an audio file
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            mp3, wav, webm, ogg, flac, m4a · up to {MAX_MB} MB
          </p>
        </div>
      ) : (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(15,30,60,0.4)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={selectedFile.name}
            >
              📁 {selectedFile.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {formatBytes(selectedFile.size)} · {selectedFile.type || 'audio'}
            </div>
          </div>
          {!uploading && !hasTranscript && (
            <button
              className="btn-secondary"
              onClick={() => setSelectedFile(null)}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              Change
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              height: 8,
              background: 'rgba(15,30,60,0.6)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--gradient-brand)',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            {progress < 100 ? `Uploading… ${progress}%` : 'Transcribing audio…'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        {selectedFile && !hasTranscript && (
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={uploading}
            id="transcribe-btn"
          >
            {uploading ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Transcribing…
              </>
            ) : (
              <>📝 Transcribe Audio</>
            )}
          </button>
        )}
        {hasTranscript && !uploading && (
          <button className="btn-secondary" onClick={handleClearLocal} id="clear-audio-btn">
            ✕ Clear &amp; Upload Another
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '10px',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {!selectedFile && !hasTranscript && (
        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Select an audio recording of the consultation.
          <br />The transcript will be generated and used for the SOAP note.
        </p>
      )}
    </div>
  );
}
