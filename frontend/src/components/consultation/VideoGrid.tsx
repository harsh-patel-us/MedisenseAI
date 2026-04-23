import type { RefObject } from 'react';
import type { CallStatus, ConsultationRole } from '../../types/consultation.types';

interface VideoGridProps {
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  callStatus: CallStatus;
  role: ConsultationRole;
  roomId: string;
  localLabel: string;
  remoteLabel: string;
}

export default function VideoGrid({
  localVideoRef,
  remoteVideoRef,
  callStatus,
  role,
  roomId,
  localLabel,
  remoteLabel,
}: VideoGridProps) {
  const isActive = callStatus === 'active' || callStatus === 'ending';

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Remote video — main large view */}
      <div style={{
        width: '100%',
        aspectRatio: '16/9',
        background: '#0a0f1e',
        borderRadius: '16px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {!isActive && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(23,89,176,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem',
            }}>
              {callStatus === 'connecting' ? '⏳' : '👤'}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {callStatus === 'waiting'
                ? 'Waiting for the other participant...'
                : callStatus === 'connecting'
                ? 'Connecting...'
                : 'Call ended'}
            </p>
            {callStatus === 'waiting' && (
              <div style={{
                background: 'rgba(23,89,176,0.15)',
                border: '1px solid rgba(23,89,176,0.3)',
                borderRadius: '10px',
                padding: '10px 20px',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
              }}>
                Room ID: <strong style={{ color: '#60a5fa', letterSpacing: '2px' }}>{roomId}</strong>
                <br />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Share this with the {role === 'doctor' ? 'patient' : 'doctor'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Remote label */}
        {isActive && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            borderRadius: '8px', padding: '4px 12px',
            fontSize: '0.8rem', color: '#fff', fontWeight: 600,
          }}>
            {remoteLabel}
          </div>
        )}
      </div>

      {/* Local video — picture-in-picture */}
      <div style={{
        position: 'absolute',
        bottom: 16, right: 16,
        width: '22%', aspectRatio: '16/9',
        background: '#0a0f1e',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '2px solid rgba(23,89,176,0.5)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <div style={{
          position: 'absolute', bottom: 4, left: 6,
          fontSize: '0.65rem', color: '#fff',
          background: 'rgba(0,0,0,0.5)', borderRadius: '4px',
          padding: '1px 6px',
        }}>
          {localLabel} (You)
        </div>
      </div>
    </div>
  );
}
