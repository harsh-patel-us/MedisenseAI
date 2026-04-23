import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/auth.types';

interface Props {
  children: ReactNode;
  /** If set, only users with one of these roles may access this route. */
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 'calc(100vh - 120px)', color: 'var(--text-secondary)',
      }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location, prefillRole: inferRoleFromPath(location.pathname) }}
      />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Logged in but wrong role — send to their own dashboard with a message.
    return <Navigate to={user.role === 'doctor' ? '/doctor' : '/patient'} replace />;
  }

  return <>{children}</>;
}

function inferRoleFromPath(path: string): UserRole {
  if (path.startsWith('/patient')) return 'patient';
  return 'doctor';
}
