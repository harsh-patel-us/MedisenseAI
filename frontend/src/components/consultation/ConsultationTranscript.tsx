import { useEffect, useRef } from 'react';
import type { CallStatus, ConsultationTranscriptSegment } from '../../types/consultation.types';

interface ConsultationTranscriptProps {
  transcript: ConsultationTranscriptSegment[];
  callStatus: CallStatus;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export default function ConsultationTranscript({
  transcript,
  callStatus,
}: ConsultationTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

  const isLive = callStatus === 'active' || callStatus === 'connecting';

  return (
    <div className="glass-card" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
          📝 Live Transcript
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '0.72rem', color: '#4ade80',
              background: 'rgba(74,222,128,0.1)', borderRadius: '6px',
              padding: '2px 8px',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#4ade80',
                animation: 'pulse 1.5s infinite',
              }} />
              LIVE
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {transcript.length} segment{transcript.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        maxHeight: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingRight: '4px',
      }}>
        {transcript.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center',
            padding: '40px 20px',
          }}>
            {isLive
              ? 'Transcript will appear here as you speak...'
              : callStatus === 'waiting'
              ? 'Transcript will appear once the call starts'
              : 'No transcript recorded'}
          </div>
        ) : (
          transcript.map((seg, i) => {
            const isDoctor = seg.speaker === 'DOCTOR';
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: isDoctor ? 'row' : 'row-reverse',
                gap: '8px',
                alignItems: 'flex-start',
              }}>
                <div style={{
                  flexShrink: 0,
                  width: 28, height: 28, borderRadius: '50%',
                  background: isDoctor
                    ? 'linear-gradient(135deg, #1759B0, #05AEBB)'
                    : 'linear-gradient(135deg, #05aebb, #4ade80)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem',
                }}>
                  {isDoctor ? '🩺' : '👤'}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    marginBottom: '3px',
                    flexDirection: isDoctor ? 'row' : 'row-reverse',
                  }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: isDoctor ? '#60a5fa' : '#4ade80',
                    }}>
                      {isDoctor ? 'DOCTOR' : 'PATIENT'}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {formatTime(seg.timestamp)}
                    </span>
                  </div>
                  <div style={{
                    background: isDoctor
                      ? 'rgba(23,89,176,0.15)'
                      : 'rgba(5,174,187,0.12)',
                    border: `1px solid ${isDoctor ? 'rgba(23,89,176,0.25)' : 'rgba(5,174,187,0.2)'}`,
                    borderRadius: isDoctor ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                  }}>
                    {seg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
