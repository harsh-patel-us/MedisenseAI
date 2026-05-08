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
}

function ProfileInput({ label, icon, value, onChange, type = 'text', placeholder, required }: CustomInputProps) {
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
        style={{
          padding: '14px 18px',
          borderRadius: '14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
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
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1)';
        }}
      />
    </div>
  );
}

function ProfileTextarea({ label, icon, value, onChange, placeholder, rows = 4 }: CustomInputProps) {
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
        style={{
          padding: '14px 18px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
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
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }}
      />
    </div>
  );
}

function ProfileSelect({ label, icon, value, onChange, options }: { label: string; icon: string; value: string; onChange: (val: string) => void; options: { label: string; value: string }[] }) {
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
          border: isOpen ? '1px solid var(--brand-teal)' : '1px solid var(--border-subtle)',
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
    </div>
  );
}

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

  useEffect(() => {
    if (user?.role === 'doctor') {
      listPublicSpecialties().then(setSpecialties).catch(console.error);
    }
  }, [user?.role]);

  if (!user) return null;

  const validate = (): string | null => {
    if (fullName.trim().length < 2) return 'Full name must be at least 2 characters';
    
    const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
    if (phoneNumber && !phoneRegex.test(phoneNumber)) return 'Invalid phone number format';
    if (emergencyPhone && !phoneRegex.test(emergencyPhone)) return 'Invalid emergency contact phone format';
    
    if (dob) {
      const selectedDate = new Date(dob);
      if (selectedDate > new Date()) return 'Date of birth cannot be in the future';
    }
    
    if (bio.length > 1000) return 'Bio must be under 1000 characters';
    if (address.length > 500) return 'Address must be under 500 characters';
    
    return null;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const error = validate();
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateProfile({
        full_name: fullName,
        phone_number: phoneNumber,
        bio: bio,
        date_of_birth: dob ? new Date(dob).toISOString() : null,
        gender: gender,
        blood_group: bloodGroup,
        address: address,
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
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
        overflow: 'hidden'
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
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
           <p style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: '1rem', fontWeight: 500 }}>{user.email}</p>
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
                    <ProfileInput label="Full Name" icon="👤" value={fullName} onChange={setFullName} required />
                    <ProfileInput label="Phone Number" icon="📞" value={phoneNumber} onChange={setPhoneNumber} placeholder="+1 (555) 000-0000" />
                    <ProfileInput label="Date of Birth" icon="📅" value={dob} onChange={setDob} type="date" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <ProfileSelect label="Gender" icon="⚧" value={gender} onChange={setGender} options={genderOptions} />
                      <ProfileSelect label="Blood Group" icon="🩸" value={bloodGroup} onChange={setBloodGroup} options={bloodOptions} />
                    </div>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: 32, overflow: 'visible', zIndex: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div className="feature-icon-wrapper" style={{ width: 40, height: 40, marginBottom: 0, borderRadius: 10, fontSize: '1rem' }}>🆘</div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Emergency Contact</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <ProfileInput label="Contact Name" icon="👤" value={emergencyName} onChange={setEmergencyName} placeholder="Full Name" />
                    <ProfileInput label="Contact Phone" icon="📞" value={emergencyPhone} onChange={setEmergencyPhone} placeholder="+1 (555) 000-0000" />
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
                        onChange={setSpecialty} 
                        options={specialties.map(s => ({ label: s.name, value: s.id }))} 
                      />
                    )}
                    <ProfileTextarea label="Personal Bio" icon="📖" value={bio} onChange={setBio} rows={6} placeholder="Share a brief introduction about yourself..." />
                    <ProfileTextarea label="Home Address" icon="🏠" value={address} onChange={setAddress} rows={3} placeholder="Full street address, city, and zip..." />
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
