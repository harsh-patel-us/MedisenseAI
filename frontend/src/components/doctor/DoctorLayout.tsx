import type { ReactNode } from 'react';
import DoctorSidebar from './DoctorSidebar';

interface DoctorLayoutProps {
  children: ReactNode;
}

export default function DoctorLayout({ children }: DoctorLayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <DoctorSidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'rgba(6,13,27,0.3)' }}>
        {children}
      </main>
    </div>
  );
}
