import type { TranscriptSegment } from '../../types/doctor.types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
}

export default function TranscriptView({ segments }: TranscriptViewProps) {
  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h2
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          📝 Transcript
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {segments.length} turn{segments.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        id="transcript-container"
        style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px 0' }}
      >
        {segments.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-muted)',
            }}
          >
            <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>🎤</p>
            <p style={{ fontSize: '0.9rem' }}>No transcript yet</p>
            <p style={{ fontSize: '0.78rem', marginTop: 6 }}>
              Upload an audio file to generate the transcript here.
            </p>
          </div>
        ) : (
          segments.map((seg, idx) => (
            <div key={idx} className="transcript-line">
              <span
                className={`speaker-tag ${
                  seg.speaker === 'DOCTOR' ? 'speaker-doctor' : 'speaker-patient'
                }`}
              >
                {seg.speaker}
              </span>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}
              >
                {seg.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
