import type { ReactNode } from 'react';
import DoctorSidebar from './DoctorSidebar';
import { DoctorChatProvider } from '../../contexts/DoctorChatContext';

interface DoctorLayoutProps {
  children: ReactNode;
}

function DoctorLayoutContent({ children }: DoctorLayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <DoctorSidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'rgba(6,13,27,0.3)' }}>
        {children}
      </main>
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
