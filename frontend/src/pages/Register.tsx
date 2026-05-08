import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/auth.types';
import { listPublicSpecialties, listSupportedLanguages, type SpecialtyOption } from '../api/authApi';
import type { SupportedLanguage } from '../types/auth.types';

interface LocationState {
  prefillRole?: UserRole;
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) || {};
  const { register } = useAuth();

  const [role, setRole] = useState<UserRole>(state.prefillRole || 'doctor');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    listPublicSpecialties()
      .then((items) => { if (alive) setSpecialties(items); })
      .catch(() => { /* non-fatal — patients don't need it */ });
    listSupportedLanguages()
      .then((items) => { if (alive) setLanguages(items); })
      .catch(() => { /* non-fatal — defaults to English on the server */ });
    return () => { alive = false; };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (role === 'doctor' && !specialty) {
      setError('Please choose your specialization.');
      return;
    }

    setSubmitting(true);
    try {
      const [user] = await Promise.all([
        register({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          role,
          specialty: role === 'doctor' ? specialty : null,
          preferred_language: role === 'patient' ? language : 'en',
        }),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
      navigate(user.role === 'doctor' ? '/doctor' : '/patient', { replace: true });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Registration failed. Please try again.';
      setError(typeof detail === 'string' ? detail : 'Registration failed.');
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
            <div className="loader-text">Creating Account…</div>
          </div>
        </div>
      )}
      <div style={{
        minHeight: 'calc(100vh - 120px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
      }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 480, padding: '36px 32px' }}>
        <h1 style={{
          fontSize: '1.6rem', fontWeight: 800, marginBottom: 6,
          background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Create your account
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Pick your role to get a tailored experience.
        </p>

        <RoleToggle role={role} onChange={setRole} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label={role === 'doctor' ? 'Full name (e.g. Dr. Priya Shah)' : 'Full name'}
            type="text"
            value={fullName}
            onChange={setFullName}
            placeholder={role === 'doctor' ? 'Dr. Priya Shah' : 'John Doe'}
            required
          />
          {role === 'doctor' && (
            <SpecialtySelect
              value={specialty}
              onChange={setSpecialty}
              options={specialties}
            />
          )}
          {role === 'patient' && (
            <LanguageField
              value={language}
              onChange={setLanguage}
              options={languages}
            />
          )}
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
            placeholder="At least 6 characters"
            required
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat your password"
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
            {submitting ? 'Creating account…' : `Register as ${role === 'doctor' ? 'Doctor' : 'Patient'}`}
          </button>
        </form>

        <p style={{
          marginTop: 20, fontSize: '0.85rem',
          color: 'var(--text-secondary)', textAlign: 'center',
        }}>
          Already have an account?{' '}
          <Link to="/login" state={{ prefillRole: role }} style={{ color: 'var(--brand-teal)', fontWeight: 700 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}

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

function SpecialtySelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SpecialtyOption[];
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Specialization
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'rgba(6,13,27,0.6)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '0.92rem', outline: 'none',
          appearance: 'none',
          backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%), linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%)',
          backgroundPosition: 'calc(100% - 18px) 50%, calc(100% - 13px) 50%',
          backgroundSize: '5px 5px',
          backgroundRepeat: 'no-repeat',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand-teal)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
      >
        <option value="" disabled>Select your specialization…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {value && (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {options.find((s) => s.id === value)?.description}
        </span>
      )}
    </label>
  );
}

function LanguageField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SupportedLanguage[];
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: '0.78rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        🌐 Preferred language
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '11px 14px',
          borderRadius: 10,
          background: 'rgba(6,13,27,0.6)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '0.92rem',
          outline: 'none',
        }}
      >
        {options.length === 0 ? (
          <option value="en">English</option>
        ) : (
          options.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))
        )}
      </select>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        AI summaries, chatbot replies, and PDF guides will be generated in
        this language. You can change this later in your dashboard.
      </span>
    </label>
  );
}


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
