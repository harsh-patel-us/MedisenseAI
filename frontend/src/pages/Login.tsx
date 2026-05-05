import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/auth.types';

interface LocationState {
  from?: { pathname: string };
  prefillRole?: UserRole;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) || {};
  const { login } = useAuth();

  const [role, setRole] = useState<UserRole>(state.prefillRole || 'doctor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const [user] = await Promise.all([
        login({ email: email.trim(), password, role }),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
      const fallback = user.role === 'doctor' ? '/doctor' : '/patient';
      navigate(state.from?.pathname || fallback, { replace: true });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Login failed. Please try again.';
      setError(typeof detail === 'string' ? detail : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {submitting && (
        <div className="full-page-loader">
          <div className="loader-content">
            <div className="loader-rings">
              <div className="loader-ring" />
              <div className="loader-ring" />
              <div className="loader-ring" />
              <div className="loader-icon">💊</div>
            </div>
            <div className="loader-text">Verifying Credentials…</div>
          </div>
        </div>
      )}
      <div style={{
        minHeight: 'calc(100vh - 120px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
      }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 460, padding: '36px 32px' }}>
        <h1 style={{
          fontSize: '1.6rem', fontWeight: 800, marginBottom: 6,
          background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Sign in to continue to MediSense AI.
        </p>

        <RoleToggle role={role} onChange={setRole} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
          />

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.35)',
              color: '#fca5a5', fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{ padding: '12px', justifyContent: 'center', marginTop: 6 }}
          >
            {submitting ? 'Signing in…' : `Sign in as ${role === 'doctor' ? 'Doctor' : 'Patient'}`}
          </button>
        </form>

        <p style={{
          marginTop: 20, fontSize: '0.85rem',
          color: 'var(--text-secondary)', textAlign: 'center',
        }}>
          New to MediSense?{' '}
          <Link to="/register" state={{ prefillRole: role }} style={{ color: 'var(--brand-teal)', fontWeight: 700 }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}

// ── Role toggle ──────────────────────────────────────────────────────────
function RoleToggle({ role, onChange }: { role: UserRole; onChange: (r: UserRole) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      padding: 4, borderRadius: 10,
      background: 'rgba(15,30,60,0.4)',
      border: '1px solid var(--border-subtle)',
      marginBottom: 20,
    }}>
      {(['doctor', 'patient'] as UserRole[]).map((r) => {
        const active = r === role;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            style={{
              padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.85rem',
              background: active ? 'var(--gradient-brand)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.18s',
            }}
          >
            {r === 'doctor' ? '🩺 Doctor' : '🧬 Patient'}
          </button>
        );
      })}
    </div>
  );
}

// ── Field component ──────────────────────────────────────────────────────
function Field({
  label, type, value, onChange, placeholder, required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'rgba(6,13,27,0.6)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '0.92rem', outline: 'none',
          transition: 'border-color 0.18s',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand-teal)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
      />
    </label>
  );
}
