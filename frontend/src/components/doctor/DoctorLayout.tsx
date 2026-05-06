import type { ReactNode } from 'react';
import DoctorSidebar from './DoctorSidebar';
import { DoctorChatProvider, useDoctorChat } from '../../contexts/DoctorChatContext';
import { DoctorChatOverlay } from './DoctorChatOverlay';

interface DoctorLayoutProps {
  children: ReactNode;
}

function DoctorLayoutContent({ children }: DoctorLayoutProps) {
  const { selectedChatId, setSelectedChatId, chatList } = useDoctorChat();
  const selectedChat = chatList.find(c => c.id === selectedChatId);

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <DoctorSidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'rgba(6,13,27,0.3)' }}>
        {children}
      </main>

      {selectedChatId && (
        <DoctorChatOverlay
          sessionId={selectedChatId}
          patientName={selectedChat?.patient_name}
          specialtyName={selectedChat?.specialty_name}
          onClose={() => setSelectedChatId(null)}
        />
      )}
    </div>
  );
}

export default function DoctorLayout({ children }: DoctorLayoutProps) {
  return (
    <DoctorChatProvider>
      <DoctorLayoutContent>
        {children}
      </DoctorLayoutContent>
    </DoctorChatProvider>
  );
}
