import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, uploadProfilePic, getProfilePicUrl, listPublicSpecialties, type SpecialtyOption } from '../api/authApi';

/* ── Custom Styled Input Components ───────────────────────────────────── */

interface CustomInputProps {
  label: string;
  icon: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  error?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

function ProfileInput({
  label,
  icon,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  error,
  maxLength,
  inputMode,
}: CustomInputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span> {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-invalid={!!error}
        style={{
          padding: '14px 18px',
          borderRadius: '14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${error ? '#ef4444' : 'var(--border-subtle)'}`,
          color: 'var(--text-primary)',
          fontSize: '0.95rem',
          transition: 'all 0.3s ease',
          outline: 'none',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--brand-teal)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.boxShadow = '0 0 15px rgba(13, 148, 136, 0.15)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--border-subtle)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1)';
        }}
      />
      {error && <FieldError text={error} />}
    </div>
  );
}

function ProfileTextarea({ label, icon, value, onChange, placeholder, rows = 4, error, maxLength }: CustomInputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span> {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={!!error}
        style={{
          padding: '14px 18px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${error ? '#ef4444' : 'var(--border-subtle)'}`,
          color: 'var(--text-primary)',
          fontSize: '0.95rem',
          resize: 'none',
          lineHeight: '1.6',
          transition: 'all 0.3s ease',
          outline: 'none'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--brand-teal)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--border-subtle)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }}
      />
      <div style={{ display: 'flex', justifyContent: error ? 'space-between' : 'flex-end', gap: 12 }}>
        {error && <FieldError text={error} />}
        {maxLength && (
          <span style={{ fontSize: '0.7rem', color: value.length > maxLength * 0.9 ? '#fbbf24' : 'var(--text-muted)' }}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

function ProfileSelect({ label, icon, value, onChange, options, error }: { label: string; icon: string; value: string; onChange: (val: string) => void; options: { label: string; value: string }[]; error?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', position: 'relative' }} ref={containerRef}>
      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span> {label}
      </label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '14px 18px',
          borderRadius: '14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: isOpen ? '1px solid var(--brand-teal)' : `1px solid ${error ? '#ef4444' : 'var(--border-subtle)'}`,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.3s ease',
          boxShadow: isOpen ? '0 0 15px rgba(13, 148, 136, 0.15)' : 'none'
        }}
      >
        <span>{selectedOption ? selectedOption.label : 'Select...'}</span>
        <span style={{ fontSize: '0.8rem', opacity: 0.6, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {isOpen && (
        <div className="glass-card" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          zIndex: 999, padding: '8px', maxHeight: '200px', overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid var(--border-glow)'
        }}>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              style={{
                padding: '10px 14px', borderRadius: '10px',
                background: value === opt.value ? 'rgba(13, 148, 136, 0.2)' : 'transparent',
                color: value === opt.value ? 'var(--brand-teal)' : 'var(--text-primary)',
                fontSize: '0.9rem', fontWeight: value === opt.value ? 700 : 500,
                cursor: 'pointer', transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => { if (value !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      {error && <FieldError text={error} />}
    </div>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <span style={{ color: '#fca5a5', fontSize: '0.75rem', fontWeight: 700 }}>
      {text}
    </span>
  );
}

function formatDateValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function ProfileDatePicker({
  label,
  icon,
  value,
  onChange,
  error,
}: {
  label: string;
  icon: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const selected = parseDateValue(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(selected || new Date(today.getFullYear() - 25, today.getMonth(), 1));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const years = Array.from({ length: 121 }, (_, i) => today.getFullYear() - i);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const selectDay = (day: number) => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (next > today) return;
    onChange(formatDateValue(next));
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', position: 'relative' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span> {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '14px 18px',
          borderRadius: '14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${open ? 'var(--brand-teal)' : error ? '#ef4444' : 'var(--border-subtle)'}`,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: open ? '0 0 15px rgba(13, 148, 136, 0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <span>{selected ? selected.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Select date of birth'}</span>
        <span style={{ color: 'var(--brand-teal)', fontWeight: 900 }}>▦</span>
      </button>
      {open && (
        <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 1000, padding: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid var(--border-glow)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <select
              value={viewDate.getMonth()}
              onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), Number(e.target.value), 1))}
              style={calendarSelectStyle}
            >
              {months.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
            <select
              value={viewDate.getFullYear()}
              onChange={(e) => setViewDate(new Date(Number(e.target.value), viewDate.getMonth(), 1))}
              style={calendarSelectStyle}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={`${d}-${i}`} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: firstDay }).map((_, i) => <span key={`blank-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
              const disabled = date > today;
              const active = value === formatDateValue(date);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  style={{
                    height: 34,
                    borderRadius: 10,
                    border: active ? '1px solid var(--brand-teal)' : '1px solid transparent',
                    background: active ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.04)',
                    color: disabled ? 'var(--text-muted)' : active ? '#fff' : 'var(--text-primary)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: active ? 800 : 600,
                    opacity: disabled ? 0.35 : 1,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && <FieldError text={error} />}
    </div>
  );
}

const calendarSelectStyle: React.CSSProperties = {
  background: 'rgba(15,30,60,0.9)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  padding: '10px 12px',
  outline: 'none',
};

/* ── Profile Page Component ───────────────────────────────────────────── */

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [dob, setDob] = useState(user?.date_of_birth ? new Date(user.date_of_birth).toISOString().split('T')[0] : '');
  const [gender, setGender] = useState(user?.gender || '');
  const [bloodGroup, setBloodGroup] = useState(user?.blood_group || '');
  const [address, setAddress] = useState(user?.address || '');
  const [emergencyName, setEmergencyName] = useState(user?.emergency_contact_name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergency_contact_phone || '');
  const [specialty, setSpecialty] = useState(user?.specialty || '');
  
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.role === 'doctor') {
      listPublicSpecialties().then(setSpecialties).catch(console.error);
    }
  }, [user?.role]);

  if (!user) return null;

  const getDigits = (value: string) => value.replace(/\D/g, '');

  const handlePhoneChange = (setter: (value: string) => void) => (value: string) => {
    setter(value.replace(/\D/g, '').slice(0, 10));
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (fullName.trim().length < 2) errors.fullName = 'Enter at least 2 characters';
    if (fullName.trim().length > 80) errors.fullName = 'Name must be under 80 characters';
    if (/^\d+$/.test(fullName.trim())) errors.fullName = 'Name cannot be only numbers';

    if (phoneNumber && getDigits(phoneNumber).length !== 10) errors.phoneNumber = 'Mobile number must be exactly 10 digits';
    if (emergencyPhone && getDigits(emergencyPhone).length !== 10) errors.emergencyPhone = 'Emergency phone must be exactly 10 digits';
    if (emergencyName.trim().length > 80) errors.emergencyName = 'Contact name must be under 80 characters';
    if (emergencyName.trim() && !emergencyPhone) errors.emergencyPhone = 'Add a 10-digit emergency phone';
    if (emergencyPhone && !emergencyName.trim()) errors.emergencyName = 'Add the emergency contact name';

    if (dob) {
      const selectedDate = new Date(dob);
      const today = new Date();
      if (Number.isNaN(selectedDate.getTime())) errors.dob = 'Select a valid date';
      else if (selectedDate > today) errors.dob = 'Date of birth cannot be in the future';
      else {
        let age = today.getFullYear() - selectedDate.getFullYear();
        const beforeBirthday =
          today.getMonth() < selectedDate.getMonth()
          || (today.getMonth() === selectedDate.getMonth() && today.getDate() < selectedDate.getDate());
        if (beforeBirthday) age -= 1;
        if (age > 120) errors.dob = 'Enter a realistic date of birth';
      }
    }

    if (gender && !genderOptions.some((opt) => opt.value === gender)) errors.gender = 'Select a valid gender';
    if (bloodGroup && !bloodOptions.some((opt) => opt.value === bloodGroup)) errors.bloodGroup = 'Select a valid blood group';
    if (bio.length > 1000) errors.bio = 'Bio must be under 1000 characters';
    if (address.length > 500) errors.address = 'Address must be under 500 characters';
    if (user.role === 'doctor' && !specialty) errors.specialty = 'Select your specialization';

    return errors;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: 'error', text: 'Please fix the highlighted fields before saving.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateProfile({
        full_name: fullName.trim(),
        phone_number: phoneNumber ? getDigits(phoneNumber) : '',
        bio: bio,
        date_of_birth: dob ? new Date(dob).toISOString() : null,
        gender: gender,
        blood_group: bloodGroup,
        address: address,
        emergency_contact_name: emergencyName.trim(),
        emergency_contact_phone: emergencyPhone ? getDigits(emergencyPhone) : '',
        specialty: user.role === 'doctor' ? specialty : undefined,
      });
      setUser(updated);
      setMessage({ type: 'success', text: 'Profile successfully updated!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 2MB' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload a valid image file' });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const updated = await uploadProfilePic(file);
      setUser(updated);
      setMessage({ type: 'success', text: 'Avatar updated!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to upload image' });
    } finally {
      setUploading(false);
    }
  };

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
    { label: 'Prefer not to say', value: 'prefer_not_to_say' }
  ];

  const bloodOptions = [
    { label: 'A+', value: 'A+' }, { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' }, { label: 'B-', value: 'B-' },
    { label: 'AB+', value: 'AB+' }, { label: 'AB-', value: 'AB-' },
    { label: 'O+', value: 'O+' }, { label: 'O-', value: 'O-' }
  ];

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* ── Header Banner ── */}
      <div style={{ 
        height: 240, 
        background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.8) 0%, rgba(13, 148, 136, 0.8) 100%)',
        position: 'relative',
        marginBottom: 100,
        borderRadius: '0 0 40px 40px',
        overflow: 'visible'
      }}>
        <div className="bg-mesh" style={{ opacity: 0.3 }} />
        
        <div style={{
          position: 'absolute', bottom: -70, left: '50%', transform: 'translateX(-50%)',
          width: 160, height: 160, borderRadius: '50%',
          border: '8px solid var(--surface-0)', background: 'var(--surface-1)',
          boxShadow: '0 15px 45px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '4rem', overflow: 'hidden', zIndex: 10
        }}>
          {user.has_profile_pic ? (
            <img 
              src={getProfilePicUrl()} 
              alt={user.full_name} 
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
            />
          ) : (
            <span className="animate-float" style={{ display: 'inline-block' }}>{user.role === 'doctor' ? '🩺' : '🧬'}</span>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              position: 'absolute', inset: 0, 
              background: 'rgba(2, 6, 23, 0.6)', color: 'white',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              opacity: 0, cursor: 'pointer', transition: 'opacity 0.3s ease',
              border: 'none', gap: '8px'
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
          >
            <span style={{ fontSize: '1.5rem' }}>{uploading ? '⌛' : '📷'}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>Update Photo</span>
          </button>
        </div>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* ── Name & Role ── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
           <h1 style={{ fontSize: '3rem', fontWeight: 950, letterSpacing: '-2px', marginBottom: '12px', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
             {user.full_name}
           </h1>
           <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center' }}>
              <span className="live-indicator" style={{ width: '8px', height: '8px' }} />
              <span style={{ 
                padding: '8px 20px', borderRadius: 99, 
                background: 'rgba(13, 148, 136, 0.1)', color: 'var(--brand-teal)',
                fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                border: '1px solid rgba(13, 148, 136, 0.2)'
              }}>
                {user.role} Account
              </span>
              {user.specialty && (
                <span style={{ 
                  padding: '8px 20px', borderRadius: 99, 
                  background: 'rgba(30, 64, 175, 0.1)', color: '#60a5fa',
                  fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                  border: '1px solid rgba(30, 64, 175, 0.2)'
                }}>
                  {user.specialty.replace('_', ' ')}
                </span>
              )}
           </div>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
             
             {/* Column 1: Identity & Contact */}
             <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div className="glass-card" style={{ padding: 32, overflow: 'visible', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div className="feature-icon-wrapper" style={{ width: 40, height: 40, marginBottom: 0, borderRadius: 10, fontSize: '1rem' }}>🆔</div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Identity & Contact</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <ProfileInput
                      label="Full Name"
                      icon="👤"
                      value={fullName}
                      onChange={(value) => { setFullName(value); setFieldErrors((e) => ({ ...e, fullName: '' })); }}
                      required
                      maxLength={80}
                      error={fieldErrors.fullName}
                    />
                    <ProfileInput
                      label="Mobile Number"
                      icon="📞"
                      value={phoneNumber}
                      onChange={(value) => { handlePhoneChange(setPhoneNumber)(value); setFieldErrors((e) => ({ ...e, phoneNumber: '' })); }}
                      placeholder="10-digit mobile number"
                      inputMode="numeric"
                      maxLength={10}
                      error={fieldErrors.phoneNumber}
                    />
                    <ProfileDatePicker
                      label="Date of Birth"
                      icon="📅"
                      value={dob}
                      onChange={(value) => { setDob(value); setFieldErrors((e) => ({ ...e, dob: '' })); }}
                      error={fieldErrors.dob}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <ProfileSelect label="Gender" icon="⚧" value={gender} onChange={(value) => { setGender(value); setFieldErrors((e) => ({ ...e, gender: '' })); }} options={genderOptions} error={fieldErrors.gender} />
                      <ProfileSelect label="Blood Group" icon="🩸" value={bloodGroup} onChange={(value) => { setBloodGroup(value); setFieldErrors((e) => ({ ...e, bloodGroup: '' })); }} options={bloodOptions} error={fieldErrors.bloodGroup} />
                    </div>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: 32, overflow: 'visible', zIndex: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div className="feature-icon-wrapper" style={{ width: 40, height: 40, marginBottom: 0, borderRadius: 10, fontSize: '1rem' }}>🆘</div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Emergency Contact</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <ProfileInput
                      label="Contact Name"
                      icon="👤"
                      value={emergencyName}
                      onChange={(value) => { setEmergencyName(value); setFieldErrors((e) => ({ ...e, emergencyName: '' })); }}
                      placeholder="Full Name"
                      maxLength={80}
                      error={fieldErrors.emergencyName}
                    />
                    <ProfileInput
                      label="Contact Phone"
                      icon="📞"
                      value={emergencyPhone}
                      onChange={(value) => { handlePhoneChange(setEmergencyPhone)(value); setFieldErrors((e) => ({ ...e, emergencyPhone: '' })); }}
                      placeholder="10-digit mobile number"
                      inputMode="numeric"
                      maxLength={10}
                      error={fieldErrors.emergencyPhone}
                    />
                  </div>
                </div>
             </div>

             {/* Column 2: Bio & Professional */}
             <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div className="glass-card" style={{ padding: 32, flex: 1, overflow: 'visible', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div className="feature-icon-wrapper" style={{ width: 40, height: 40, marginBottom: 0, borderRadius: 10, fontSize: '1rem' }}>📝</div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Profile Details</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {user.role === 'doctor' && (
                      <ProfileSelect 
                        label="Specialization" 
                        icon="🩺" 
                        value={specialty} 
                        onChange={(value) => { setSpecialty(value); setFieldErrors((e) => ({ ...e, specialty: '' })); }} 
                        options={specialties.map(s => ({ label: s.name, value: s.id }))} 
                        error={fieldErrors.specialty}
                      />
                    )}
                    <ProfileTextarea
                      label="Personal Bio"
                      icon="📖"
                      value={bio}
                      onChange={(value) => { setBio(value); setFieldErrors((e) => ({ ...e, bio: '' })); }}
                      rows={6}
                      placeholder="Share a brief introduction about yourself..."
                      maxLength={1000}
                      error={fieldErrors.bio}
                    />
                    <ProfileTextarea
                      label="Home Address"
                      icon="🏠"
                      value={address}
                      onChange={(value) => { setAddress(value); setFieldErrors((e) => ({ ...e, address: '' })); }}
                      rows={3}
                      placeholder="Full street address, city, and zip..."
                      maxLength={500}
                      error={fieldErrors.address}
                    />
                  </div>
                </div>

                {/* Submit Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {message && (
                    <div style={{
                      padding: '18px 24px', borderRadius: '16px',
                      background: message.type === 'success' ? 'rgba(13, 148, 136, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                      border: `1px solid ${message.type === 'success' ? 'var(--brand-teal)' : '#dc2626'}`,
                      color: message.type === 'success' ? '#4ade80' : '#fca5a5',
                      fontSize: '0.95rem', fontWeight: 700,
                      animation: 'demo-fade 0.4s ease-out',
                      display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>{message.type === 'success' ? '✨' : '⚠️'}</span>
                      {message.text}
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={saving}
                    style={{ 
                      justifyContent: 'center', height: 64, 
                      fontSize: '1.1rem', borderRadius: '18px',
                      boxShadow: '0 20px 40px rgba(13, 148, 136, 0.2)',
                      width: '100%'
                    }}
                  >
                    {saving ? (
                      <><div className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} /> Saving Changes...</>
                    ) : (
                      '💾 Update My Profile'
                    )}
                  </button>
                </div>
             </div>

          </div>
        </form>
      </div>
    </div>
  );
}
