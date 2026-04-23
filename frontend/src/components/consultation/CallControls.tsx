import type { CSSProperties } from 'react';
import type { CallStatus } from '../../types/consultation.types';

interface CallControlsProps {
  callStatus: CallStatus;
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
}

const btnBase: CSSProperties = {
  width: 52, height: 52, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', cursor: 'pointer', fontSize: '1.2rem',
  transition: 'all 0.15s ease',
};

export default function CallControls({
  callStatus,
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo,
  onEndCall,
}: CallControlsProps) {
  const canControl = callStatus === 'active' || callStatus === 'connecting';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '20px 0',
    }}>
      {/* Mute */}
      <button
        onClick={onToggleMute}
        disabled={!canControl}
        title={isMuted ? 'Unmute' : 'Mute'}
        style={{
          ...btnBase,
          background: isMuted ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.1)',
          border: `1px solid ${isMuted ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.15)'}`,
          opacity: !canControl ? 0.4 : 1,
        }}
      >
        {isMuted ? '🔇' : '🎤'}
      </button>

      {/* Video toggle */}
      <button
        onClick={onToggleVideo}
        disabled={!canControl}
        title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        style={{
          ...btnBase,
          background: isVideoOff ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.1)',
          border: `1px solid ${isVideoOff ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.15)'}`,
          opacity: !canControl ? 0.4 : 1,
        }}
      >
        {isVideoOff ? '📵' : '📷'}
      </button>

      {/* End call */}
      <button
        onClick={onEndCall}
        disabled={!canControl}
        title="End call"
        style={{
          ...btnBase,
          width: 64, height: 64,
          background: canControl ? '#dc2626' : 'rgba(220,38,38,0.3)',
          border: 'none',
          boxShadow: canControl ? '0 4px 20px rgba(220,38,38,0.4)' : 'none',
          opacity: !canControl ? 0.4 : 1,
        }}
      >
        📵
      </button>
    </div>
  );
}
