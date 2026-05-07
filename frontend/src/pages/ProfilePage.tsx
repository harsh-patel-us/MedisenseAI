import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, uploadProfilePic, getProfilePicUrl, listPublicSpecialties, type SpecialtyOption } from '../api/authApi';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [dob, setDob] = useState(user?.date_of_birth ? new Date(user.date_of_birth).toISOString().split('T')[0] : '');
  const [gender, setGender] = useState(user?.gender || '');
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateProfile({
        full_name: fullName,
        phone_number: phoneNumber,
        bio: bio,
        date_of_birth: dob ? new Date(dob).toISOString() : null,
        gender: gender,
        specialty: user.role === 'doctor' ? specialty : undefined,
      });
      setUser(updated);
      setMessage({ type: 'success', text: 'Changes saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
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

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* ── Header Banner ── */}
      <div style={{ 
        height: 200, 
        background: 'linear-gradient(135deg, #1e40af 0%, #0d9488 100%)',
        position: 'relative',
        marginBottom: 80
      }}>
        <div style={{
          position: 'absolute', bottom: -60, left: '50%', transform: 'translateX(-50%)',
          width: 140, height: 140, borderRadius: '50%',
          border: '6px solid var(--surface-0)', background: 'var(--surface-1)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '3.5rem', overflow: 'hidden'
        }}>
          {user.has_profile_pic ? (
            <img 
              src={getProfilePicUrl()} 
              alt={user.full_name} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            user.role === 'doctor' ? '🩺' : '🧬'
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              position: 'absolute', inset: 0, 
              background: 'rgba(0,0,0,0.4)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, cursor: 'pointer', transition: 'opacity 0.2s ease',
              border: 'none', fontSize: '1.5rem'
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
          >
            {uploading ? '⌛' : '📷'}
          </button>
        </div>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
        {/* ── Name & Role ── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
           <h1 style={{ fontSize: '2.5rem', fontWeight: 950, letterSpacing: '-1px' }}>{user.full_name}</h1>
           <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
              <span style={{ 
                padding: '6px 16px', borderRadius: 99, 
                background: 'rgba(13, 148, 136, 0.1)', color: 'var(--brand-teal)',
                fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase'
              }}>
                {user.role}
              </span>
              {user.specialty && (
                <span style={{ 
                  padding: '6px 16px', borderRadius: 99, 
                  background: 'rgba(30, 64, 175, 0.1)', color: '#60a5fa',
                  fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase'
                }}>
                  {user.specialty}
                </span>
              )}
           </div>
           <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>{user.email}</p>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
           
           {/* Section: Basic Info */}
           <div className="glass-card" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                 <span style={{ fontSize: '1.2rem', color: 'var(--brand-teal)' }}>👤</span>
                 <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Account Identity</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Full Name</label>
                    <input 
                       type="text" 
                       value={fullName} 
                       onChange={(e) => setFullName(e.target.value)} 
                       required 
                       style={{
                          padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.95rem'
                       }}
                    />
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone Number</label>
                    <input 
                       type="tel" 
                       value={phoneNumber} 
                       onChange={(e) => setPhoneNumber(e.target.value)} 
                       placeholder="+1 (555) 000-0000"
                       style={{
                          padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.95rem'
                       }}
                    />
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                       <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date of Birth</label>
                       <input 
                          type="date" 
                          value={dob} 
                          onChange={(e) => setDob(e.target.value)} 
                          style={{
                             padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                             border: '1px solid var(--border-subtle)', color: 'white', colorScheme: 'dark'
                          }}
                       />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                       <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gender</label>
                       <select 
                          value={gender} 
                          onChange={(e) => setGender(e.target.value)}
                          style={{
                             padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                             border: '1px solid var(--border-subtle)', color: 'white'
                          }}
                       >
                          <option value="">Select...</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer_not_to_say">N/A</option>
                       </select>
                    </div>
                 </div>
              </div>
           </div>

           {/* Section: Professional/Medical */}
           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="glass-card" style={{ padding: 32, flex: 1 }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <span style={{ fontSize: '1.2rem', color: 'var(--brand-teal)' }}>📖</span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>About & Bio</h3>
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {user.role === 'doctor' && (
                       <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Medical Specialty</label>
                          <select 
                             value={specialty} 
                             onChange={(e) => setSpecialty(e.target.value)}
                             style={{
                                padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border-subtle)', color: 'white'
                             }}
                          >
                             {specialties.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                             ))}
                          </select>
                       </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                       <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bio</label>
                       <textarea 
                          value={bio} 
                          onChange={(e) => setBio(e.target.value)} 
                          rows={user.role === 'doctor' ? 4 : 8}
                          placeholder="Tell us about yourself..."
                          style={{
                             padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                             border: '1px solid var(--border-subtle)', color: 'white', resize: 'none', lineHeight: 1.6
                          }}
                       />
                    </div>
                 </div>
              </div>

              {/* Status Message Overlay */}
              {message && (
                 <div style={{
                    padding: '16px 20px', borderRadius: 12,
                    background: message.type === 'success' ? 'rgba(13, 148, 136, 0.15)' : 'rgba(220, 38, 38, 0.15)',
                    border: `1px solid ${message.type === 'success' ? 'var(--brand-teal)' : '#dc2626'}`,
                    color: message.type === 'success' ? '#4ade80' : '#fca5a5',
                    fontSize: '0.9rem', fontWeight: 600,
                    animation: 'demo-fade 0.3s ease-out'
                 }}>
                    {message.type === 'success' ? '✓ ' : '✕ '} {message.text}
                 </div>
              )}

              <button 
                 type="submit" 
                 className="btn-primary" 
                 disabled={saving}
                 style={{ 
                    justifyContent: 'center', height: 54, 
                    fontSize: '1rem', boxShadow: '0 10px 30px rgba(13, 148, 136, 0.2)' 
                 }}
              >
                 {saving ? '⌛ Saving changes...' : '💾 Save Profile'}
              </button>
           </div>

        </form>
      </div>
    </div>
  );
}
