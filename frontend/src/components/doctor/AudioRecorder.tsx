

interface AudioRecorderProps {
  isRecording: boolean;
  duration: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  hasTranscript: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function AudioRecorder({
  isRecording,
  duration,
  error,
  onStart,
  onStop,
  onClear,
  hasTranscript,
}: AudioRecorderProps) {
  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
          🎙️ Audio Recorder
        </h2>
        {isRecording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <span className="recording-dot" />
            <span style={{ color: '#f87171', fontWeight: 600 }}>Recording</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '1.1rem' }}>
              {formatTime(duration)}
            </span>
          </div>
        )}
      </div>

      {/* Timer display when not recording */}
      {!isRecording && duration > 0 && (
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '2rem', color: 'var(--text-secondary)' }}>
            {formatTime(duration)}
          </span>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>Recording completed</p>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {!isRecording ? (
          <button className="btn-primary" onClick={onStart} id="start-recording-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Start Recording
          </button>
        ) : (
          <button className="btn-danger" onClick={onStop} id="stop-recording-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop Recording
          </button>
        )}

        {hasTranscript && !isRecording && (
          <button className="btn-secondary" onClick={onClear} id="clear-transcript-btn">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: '16px', padding: '12px 16px',
          background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: '10px', color: '#fca5a5', fontSize: '0.85rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Help text */}
      {!isRecording && !hasTranscript && (
        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Click "Start Recording" to begin capturing the consultation audio.
          <br />Ensure microphone permissions are granted in your browser.
        </p>
      )}
    </div>
  );
}
