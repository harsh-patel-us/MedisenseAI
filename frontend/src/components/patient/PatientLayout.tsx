import type { ReactNode } from 'react';
import PatientSidebar from './PatientSidebar';

interface PatientLayoutProps {
  children: ReactNode;
}

export default function PatientLayout({ children }: PatientLayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <PatientSidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'rgba(6,13,27,0.3)' }}>
        {children}
      </main>
    </div>
  );
}
