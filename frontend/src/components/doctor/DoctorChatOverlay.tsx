import React from 'react';
import DoctorChatView from './DoctorChatView';

interface DoctorChatOverlayProps {
  sessionId: string;
  patientName?: string;
  specialtyName?: string | null;
  onClose: () => void;
}

export function DoctorChatOverlay({
  sessionId,
  patientName,
  specialtyName,
  onClose,
}: DoctorChatOverlayProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
       <div className="glass-card" style={{ width: '100%', maxWidth: 800, height: '85vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>✕</button>
          <div style={{ padding: '24px 30px', borderBottom: '1px solid var(--border-subtle)' }}>
             <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
               {patientName ? `Conversation with ${patientName}` : 'Patient Conversation'}
             </h2>
             <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
               {specialtyName ? `🩺 ${specialtyName}` : 'MediSense AI patient chat'}
             </p>
          </div>
          <DoctorChatView sessionId={sessionId} />
       </div>
    </div>
  );
}
