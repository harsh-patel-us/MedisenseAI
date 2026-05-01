import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import AudioRecorder from '../components/doctor/AudioRecorder';
import LiveTranscript from '../components/doctor/LiveTranscript';
import SoapNoteEditor from '../components/doctor/SoapNoteEditor';
import { generateNote } from '../api/doctorApi';
import { createRoom } from '../api/consultationApi';
import {
  listUnprocessedSessions,
  processTranscript,
  getProcessStatus,
} from '../api/meetApi';
import type { UnprocessedSession, ProcessStatusResponse } from '../api/meetApi';
import type { SoapNote, MedicalEntities } from '../types/doctor.types';

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const {
    isRecording, duration, transcript, sessionId, error,
    startRecording, stopRecording, clearTranscript,
  } = useAudioRecorder();

  const [soapNote, setSoapNote] = useState<SoapNote | null>(null);
  const [entities, setEntities] = useState<MedicalEntities | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Video consultation modal state
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [consultDoctorName, setConsultDoctorName] = useState('');
  const [consultPatientName, setConsultPatientName] = useState('');
  const [consultCreating, setConsultCreating] = useState(false);
  const [consultError, setConsultError] = useState('');
  const [createdRoom, setCreatedRoom] = useState<{ room_id: string } | null>(null);

  const handleCreateConsultation = async () => {
    setConsultCreating(true);
    setConsultError('');
    try {
      const room = await createRoom(
        consultDoctorName || 'Doctor',
        consultPatientName || 'Patient',
      );
      setCreatedRoom(room);
    } catch {
      setConsultError('Failed to create consultation room. Is the server running?');
    } finally {
      setConsultCreating(false);
    }
  };

  const handleJoinConsultation = () => {
    if (createdRoom) {
      navigate(`/consultation/room/${createdRoom.room_id}?role=doctor`);
    }
  };

  const handleGenerateNote = async () => {
    if (transcript.length === 0) return;
    setGenerating(true);
    setGenError(null);

    try {
      const res = await generateNote(transcript, sessionId || 'manual-session');
      setSoapNote(res.soap_note);
      setEntities(res.entities);
    } catch (err: any) {
      console.error('Generate note failed:', err);
      setGenError(err.response?.data?.detail || err.message || 'Failed to generate SOAP note');
    } finally {
      setGenerating(false);
    }
  };

  const handleNewSession = () => {
    clearTranscript();
    setSoapNote(null);
    setEntities(null);
    setGenError(null);
  };

  /* ── Google Meet processing state ────────────────────────────────── */
  const [meetSessions, setMeetSessions] = useState<UnprocessedSession[]>([]);
  const [meetLoading, setMeetLoading] = useState(false);
  const [meetStatus, setMeetStatus] = useState<Record<string, ProcessStatusResponse>>({});
  const [meetSoapNote, setMeetSoapNote] = useState<SoapNote | null>(null);
  const [meetSessionId, setMeetSessionId] = useState<string | null>(null);
  const pollTimerRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadMeetSessions = useCallback(async () => {
    setMeetLoading(true);
    try {
      const sessions = await listUnprocessedSessions();
      setMeetSessions(sessions);
    } catch {
      // non-fatal
    } finally {
      setMeetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetSessions();
    return () => {
      // Cleanup all poll timers on unmount
      Object.values(pollTimerRef.current).forEach(clearInterval);
    };
  }, [loadMeetSessions]);

  const handleProcessMeet = async (sessionId: string) => {
    try {
      const res = await processTranscript({ session_id: sessionId });
      setMeetStatus((s) => ({
        ...s,
        [sessionId]: {
          task_id: res.task_id,
          session_id: sessionId,
          status: 'pending',
          detail: 'Starting...',
          started_at: new Date().toISOString(),
          completed_at: null,
          soap_note: null,
          patient_explanation: null,
          transcript: [],
        },
      }));
      // Start polling
      const timer = setInterval(async () => {
        try {
          const status = await getProcessStatus(res.task_id);
          setMeetStatus((s) => ({ ...s, [sessionId]: status }));
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(timer);
            delete pollTimerRef.current[sessionId];
            if (status.status === 'completed' && status.soap_note) {
              setMeetSoapNote(status.soap_note as unknown as SoapNote);
              setMeetSessionId(sessionId);
            }
            // Refresh list
            loadMeetSessions();
          }
        } catch {
          clearInterval(timer);
          delete pollTimerRef.current[sessionId];
        }
      }, 3000);
      pollTimerRef.current[sessionId] = timer;
    } catch {
      setMeetStatus((s) => ({
        ...s,
        [sessionId]: {
          task_id: '',
          session_id: sessionId,
          status: 'failed',
          detail: 'Failed to start processing. Is the backend running?',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          soap_note: null,
          patient_explanation: null,
          transcript: [],
        },
      }));
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{
            fontSize: '1.8rem', fontWeight: 800,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', marginBottom: '8px',
          }}>
            🩺 Doctor Dashboard
          </h1>
          <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
            Record consultations or start a live video call with AI transcription
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setShowConsultModal(true); setCreatedRoom(null); setConsultError(''); }}
          style={{ fontSize: '0.88rem', padding: '10px 20px', whiteSpace: 'nowrap' }}
        >
          🎥 Start Video Consultation
        </button>
      </div>

      {/* Video Consultation Modal */}
      {showConsultModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowConsultModal(false); }}
        >
          <div className="glass-card" style={{ maxWidth: 460, width: '100%', padding: '36px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '6px' }}>
              🎥 New Video Consultation
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              A room ID will be generated. Share it with your patient so they can join.
            </p>

            {!createdRoom ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
                      Your Name (Doctor)
                    </label>
                    <input
                      type="text"
                      value={consultDoctorName}
                      onChange={e => setConsultDoctorName(e.target.value)}
                      placeholder="Dr. Smith"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
                      Patient Name
                    </label>
                    <input
                      type="text"
                      value={consultPatientName}
                      onChange={e => setConsultPatientName(e.target.value)}
                      placeholder="John Doe"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {consultError && (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '14px',
                    background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
                    color: '#fca5a5', fontSize: '0.82rem' }}>
                    ⚠ {consultError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" onClick={handleCreateConsultation} disabled={consultCreating} style={{ flex: 1 }}>
                    {consultCreating ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating...</> : 'Create Room'}
                  </button>
                  <button className="btn-secondary" onClick={() => setShowConsultModal(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  background: 'rgba(23,89,176,0.1)', border: '1px solid rgba(23,89,176,0.3)',
                  borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Share this Room ID with your patient:
                  </p>
                  <div style={{
                    fontSize: '2rem', fontWeight: 900, letterSpacing: '6px',
                    color: '#60a5fa', fontFamily: 'monospace',
                  }}>
                    {createdRoom.room_id}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Patient goes to: <em>Menu → Join Call → enter above ID</em>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" onClick={handleJoinConsultation} style={{ flex: 1 }}>
                    🎥 Join Consultation Room
                  </button>
                  <button className="btn-secondary" onClick={() => setShowConsultModal(false)} style={{ flex: 1 }}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left: Recorder + Transcript */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <AudioRecorder
            isRecording={isRecording}
            duration={duration}
            error={error}
            onStart={startRecording}
            onStop={stopRecording}
            onClear={handleNewSession}
            hasTranscript={transcript.length > 0}
          />

          <LiveTranscript segments={transcript} isRecording={isRecording} />

          {/* Generate SOAP Note Button */}
          {transcript.length > 0 && !isRecording && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                onClick={handleGenerateNote}
                disabled={generating}
                id="generate-soap-btn"
                style={{ flex: 1 }}
              >
                {generating ? (
                  <>
                    <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    Generating SOAP Note...
                  </>
                ) : (
                  '🤖 Generate SOAP Note'
                )}
              </button>
              <button className="btn-secondary" onClick={handleNewSession} id="new-session-btn">
                🔄 New Session
              </button>
            </div>
          )}

          {/* Entities display */}
          {entities && (
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>
                🔬 Extracted Medical Entities
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Symptoms', items: entities.symptoms, color: '#f87171' },
                  { label: 'Medications', items: entities.medications, color: '#60a5fa' },
                  { label: 'Diagnoses', items: entities.diagnoses, color: '#fbbf24' },
                  { label: 'Vitals', items: entities.vitals, color: '#4ade80' },
                ].map((group) => (
                  <div key={group.label}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: group.color, textTransform: 'uppercase' }}>
                      {group.label}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      {group.items.length > 0 ? group.items.map((item, i) => (
                        <span key={i} style={{
                          padding: '2px 8px', fontSize: '0.75rem', borderRadius: '6px',
                          background: `${group.color}15`, color: group.color,
                          border: `1px solid ${group.color}30`,
                        }}>
                          {item}
                        </span>
                      )) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None found</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {genError && (
            <div style={{
              padding: '12px 16px', background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '10px',
              color: '#fca5a5', fontSize: '0.85rem',
            }}>
              ⚠️ {genError}
            </div>
          )}
        </div>

        {/* Right: SOAP Note Editor */}
        <div>
          {soapNote ? (
            <SoapNoteEditor
              soapNote={soapNote}
              sessionId={sessionId}
              onUpdate={setSoapNote}
            />
          ) : (
            <div className="glass-card" style={{
              padding: '60px 40px', textAlign: 'center',
              minHeight: '400px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <p style={{ fontSize: '3rem', marginBottom: '16px' }}>📄</p>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
                SOAP Note Will Appear Here
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '320px' }}>
                Record a consultation, then click "Generate SOAP Note" to create
                an AI-assisted clinical note.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Responsive override */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: '1fr 1fr'"],
          div[style*="grid-template-columns"] {
            display: flex !important;
            flex-direction: column !important;
          }
        }
      `}</style>

      {/* ── Process Google Meet Consultation ──────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div
          className="glass-card"
          style={{ padding: '28px', marginBottom: 24 }}
          id="meet-processing-section"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                📹 Process Google Meet Consultation
              </h2>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Meet sessions linked via scheduling appear here. Process the
                transcript to generate a SOAP note automatically.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={loadMeetSessions}
              disabled={meetLoading}
              style={{ fontSize: '0.8rem', padding: '8px 16px' }}
            >
              {meetLoading ? '↻ Loading…' : '↻ Refresh'}
            </button>
          </div>

          {meetSessions.length === 0 ? (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.88rem',
              }}
            >
              {meetLoading
                ? 'Loading…'
                : 'No unprocessed Google Meet sessions. Schedule a consultation with Google Meet to get started.'}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                maxHeight: 420,
                overflowY: 'auto',
              }}
            >
              {meetSessions.map((ms) => {
                const status = meetStatus[ms.session_id];
                const isProcessing =
                  status &&
                  (status.status === 'pending' || status.status === 'running');
                const isFailed = status?.status === 'failed';
                const isCompleted = status?.status === 'completed';

                return (
                  <div
                    key={ms.session_id}
                    style={{
                      padding: '16px 18px',
                      borderRadius: 12,
                      background: 'rgba(15,30,60,0.4)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            marginBottom: 2,
                          }}
                        >
                          {ms.doctor_name || 'Doctor'} ↔{' '}
                          {ms.patient_name || 'Patient'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {new Date(ms.created_at).toLocaleString()} ·{' '}
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                            }}
                          >
                            {ms.meet_conference_id || 'No conf. ID'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isProcessing && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--brand-teal)',
                              fontWeight: 600,
                            }}
                          >
                            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
                            {status?.detail || 'Processing…'}
                          </span>
                        )}
                        {isFailed && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: '#f87171',
                              fontWeight: 600,
                            }}
                          >
                            ⚠ {status?.detail || 'Failed'}
                          </span>
                        )}
                        {isCompleted && (
                          <span
                            className="badge badge-normal"
                          >
                            ✓ Completed
                          </span>
                        )}
                        {!isProcessing && !isCompleted && (
                          <button
                            className="btn-primary"
                            onClick={() => handleProcessMeet(ms.session_id)}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.8rem',
                            }}
                          >
                            ⚡ Process Transcript
                          </button>
                        )}
                        {isCompleted && status?.soap_note && (
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setMeetSoapNote(status.soap_note as unknown as SoapNote);
                              setMeetSessionId(ms.session_id);
                            }}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.8rem',
                            }}
                          >
                            📄 View SOAP Note
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SOAP Note from Meet processing */}
        {meetSoapNote && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--brand-teal)',
                }}
              >
                📹 Google Meet SOAP Note
              </h3>
              <button
                onClick={() => {
                  setMeetSoapNote(null);
                  setMeetSessionId(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕ Close
              </button>
            </div>
            <SoapNoteEditor
              soapNote={meetSoapNote}
              sessionId={meetSessionId}
              onUpdate={setMeetSoapNote}
            />
          </div>
        )}
      </div>
    </div>
  );
}
