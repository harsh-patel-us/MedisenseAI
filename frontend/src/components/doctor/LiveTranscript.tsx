import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../../types/doctor.types';

interface LiveTranscriptProps {
  segments: TranscriptSegment[];
  isRecording: boolean;
}

export default function LiveTranscript({ segments, isRecording }: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
          📝 Live Transcript
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {segments.length} segment{segments.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        ref={scrollRef}
        id="transcript-container"
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '8px 0',
          scrollBehavior: 'smooth',
        }}
      >
        {segments.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-muted)',
          }}>
            {isRecording ? (
              <>
                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontSize: '0.9rem' }}>Listening for speech...</p>
                <p style={{ fontSize: '0.78rem', marginTop: 6 }}>Speak clearly. Transcript will appear in real time.</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>🎤</p>
                <p style={{ fontSize: '0.9rem' }}>No transcript yet</p>
                <p style={{ fontSize: '0.78rem', marginTop: 6 }}>Start recording to see the live transcript here.</p>
              </>
            )}
          </div>
        ) : (
          segments.map((seg, idx) => (
            <div
              key={idx}
              className="transcript-line"
              style={{
                opacity: seg.confidence !== undefined && seg.confidence < 0.6 ? 0.6 : 1,
                background: seg.confidence !== undefined && seg.confidence < 0.6
                  ? 'rgba(245, 158, 11, 0.06)'
                  : undefined,
              }}
            >
              <span className={`speaker-tag ${seg.speaker === 'DOCTOR' ? 'speaker-doctor' : 'speaker-patient'}`}>
                {seg.speaker}
              </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {seg.text}
              </span>
              {seg.confidence !== undefined && seg.confidence < 0.6 && (
                <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginLeft: 'auto', flexShrink: 0 }}>
                  ⚠ low confidence
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Processing indicator */}
      {isRecording && segments.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', marginTop: '8px',
          fontSize: '0.78rem', color: 'var(--brand-teal)',
        }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          Processing audio...
        </div>
      )}
    </div>
  );
}
