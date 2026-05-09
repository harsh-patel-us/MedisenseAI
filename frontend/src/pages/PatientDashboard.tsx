import { useCallback, useEffect, useState } from 'react';
import { listDoctors } from '../api/patientChatbotApi';
import type { DoctorCard } from '../types/patientChatbot.types';
import { useNavigate } from 'react-router-dom';
import LanguageSelector from '../components/LanguageSelector';
import { useAuth } from '../contexts/AuthContext';

export default function PatientDashboard() {
  const [doctors, setDoctors] = useState<DoctorCard[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  // Holds the id of the doctor whose card the user just clicked. Drives
  // the "Connecting…" state on that card during route transition so the
  // user gets immediate feedback instead of a frozen-looking page.
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSelectDoctor = (doctorId: string) => {
    if (navigatingId) return;
    setNavigatingId(doctorId);
    // Defer navigation by a frame so the "Connecting…" state paints before
    // the route swaps out — otherwise users on slow devices see no feedback
    // at all between click and the new page rendering its own loader.
    requestAnimationFrame(() => {
      navigate('/patient/chat', { state: { doctorId } });
    });
  };

  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const res = await listDoctors();
      setDoctors(res.doctors);
    } catch (err) {
      console.error('Failed to load doctors', err);
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
      {/* Header */}
      <div
        style={{
          marginBottom: '40px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{
            fontSize: '2.2rem', fontWeight: 900,
            background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '12px',
          }}>
            🧬 Specialist Directory
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: 1.6 }}>
            Consult with our verified medical specialists. Select a doctor below to start a secure, AI-assisted health consultation.
          </p>
        </div>
        {user?.role === 'patient' && <LanguageSelector />}
      </div>

      {/* Registered Specialists */}
      <div className="glass-card" style={{ padding: '32px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            🩺 Available Specialists
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing {doctors.length} registered professionals
          </div>
        </div>

        {doctorsLoading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} /> &nbsp;
            Loading specialists...
          </div>
        ) : doctors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            No doctors registered yet. Please check back later.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
          }}>
            {doctors.map((doc) => {
              const isThisCardNavigating = navigatingId === doc.id;
              const anotherCardNavigating =
                navigatingId !== null && navigatingId !== doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => !navigatingId && handleSelectDoctor(doc.id)}
                  style={{
                    padding: '24px',
                    background: isThisCardNavigating
                      ? 'rgba(5,174,187,0.14)'
                      : 'rgba(6,13,27,0.45)',
                    border: `1px solid ${isThisCardNavigating
                      ? '#05aebb'
                      : 'var(--border-subtle)'
                      }`,
                    borderRadius: '20px',
                    cursor: navigatingId ? 'wait' : 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    position: 'relative',
                    overflow: 'hidden',
                    opacity: anotherCardNavigating ? 0.45 : 1,
                    pointerEvents: navigatingId ? 'none' : 'auto',
                  }}
                  onMouseEnter={(e) => {
                    if (navigatingId) return;
                    e.currentTarget.style.borderColor = '#05aebb';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.background = 'rgba(5,174,187,0.1)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(5,174,187,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    if (navigatingId) return;
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.background = 'rgba(6,13,27,0.45)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: '16px',
                    background: 'rgba(5,174,187,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2.2rem', marginBottom: '8px',
                    border: '1px solid rgba(5,174,187,0.2)'
                  }}>
                    {doc.specialty === 'cardiologist' ? '❤️' :
                      doc.specialty === 'neurologist' ? '🧠' :
                        doc.specialty === 'pediatrician' ? '🧒' :
                          doc.specialty === 'dermatologist' ? '🧴' : '🩺'}
                  </div>

                  <div>
                    <div style={{
                      fontWeight: 800,
                      fontSize: '1.15rem',
                      color: 'var(--text-primary)',
                      marginBottom: '4px'
                    }}>
                      {doc.full_name}
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      color: '#05aebb',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {doc.specialty_name || doc.specialty || 'General Physician'}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Verified medical professional available for consultations and diagnostic review.
                  </p>

                  <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
                    <button
                      className="btn-primary"
                      disabled={!!navigatingId}
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '0.88rem',
                        background: 'var(--gradient-brand)',
                        border: 'none',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                      }}
                    >
                      {isThisCardNavigating ? (
                        <>
                          <span
                            className="spinner"
                            style={{
                              width: 16,
                              height: 16,
                              borderWidth: 2,
                            }}
                          />
                          Connecting…
                        </>
                      ) : (
                        'Start Consultation'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Tips */}
      <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ fontSize: '1.5rem' }}>📄</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>Have a medical report?</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Head to the <strong>Upload Report</strong> section to get an instant AI analysis.
            </div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ fontSize: '1.5rem' }}>💬</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>Continuing a chat?</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Visit the <strong>Consultations</strong> tab to resume your active discussions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
