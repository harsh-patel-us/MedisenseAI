import { useEffect, useRef, useState } from 'react';
import { listSupportedLanguages, updateLanguage } from '../api/authApi';
import { useAuth } from '../contexts/AuthContext';
import type { SupportedLanguage } from '../types/auth.types';

const TOAST_TIMEOUT_MS = 2400;

export interface LanguageSelectorProps {
  /** Visual size; the dashboard header wants compact. */
  compact?: boolean;
  /** Override the label. Defaults to "Language". */
  label?: string;
}

export default function LanguageSelector({
  compact = true,
  label = 'Language',
}: LanguageSelectorProps) {
  const { user, setUser } = useAuth();
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const langs = await listSupportedLanguages();
        if (!cancelled) setLanguages(langs);
      } catch (err) {
        console.error('Failed to load supported languages', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up any pending toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_TIMEOUT_MS);
  };

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    if (!user || code === user.preferred_language || saving) return;
    setSaving(true);
    try {
      const updated = await updateLanguage(code);
      setUser(updated);
      const label = languages.find((l) => l.code === code)?.label || code;
      showToast(`Language updated to ${label}`);
    } catch (err) {
      console.error('Language update failed', err);
      showToast('Could not update language. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const current = user?.preferred_language || 'en';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
      }}
    >
      <label
        htmlFor="medisense-language"
        style={{
          fontSize: compact ? '0.74rem' : '0.85rem',
          color: 'var(--text-muted)',
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}
      >
        🌐 {label}
      </label>
      <select
        id="medisense-language"
        value={current}
        onChange={onChange}
        disabled={saving || languages.length === 0}
        style={{
          background: 'rgba(15,30,60,0.6)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          padding: compact ? '6px 10px' : '8px 12px',
          borderRadius: 8,
          fontSize: compact ? '0.84rem' : '0.92rem',
          cursor: saving ? 'not-allowed' : 'pointer',
          outline: 'none',
          minWidth: 160,
        }}
      >
        {languages.length === 0 ? (
          <option value={current}>Loading…</option>
        ) : (
          languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))
        )}
      </select>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'rgba(5, 174, 187, 0.95)',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: '0.82rem',
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
