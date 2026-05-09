import { useState, useEffect, useCallback, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// Live recording flow has been replaced with audio-file upload — the
// useAudioRecorder hook, AudioRecorder mic UI, and LiveTranscript display are
// no longer used. Imports kept commented for reference.
// import { useAudioRecorder } from '../hooks/useAudioRecorder';
// import AudioRecorder from '../components/doctor/AudioRecorder';
// import LiveTranscript from '../components/doctor/LiveTranscript';
import AudioFileUpload from '../components/doctor/AudioFileUpload';
import TranscriptView from '../components/doctor/TranscriptView';
import SoapNoteEditor from '../components/doctor/SoapNoteEditor';
import SoapAuditPanel from '../components/doctor/SoapAuditPanel';
import FollowUpCard from '../components/doctor/FollowUpCard';
import { generateNote } from '../api/doctorApi';
import {
  listUnprocessedSessions,
  processTranscript,
  getProcessStatus,
  getIntakeSummary,
} from '../api/meetApi';
import type { UnprocessedSession, ProcessStatusResponse } from '../api/meetApi';
import type { IntakeSummary } from '../types/consultation.types';
import axios from 'axios';
import { listSpecialties } from '../api/patientChatbotApi';
import type { SpecialtyOption } from '../types/patientChatbot.types';
import { updateMySpecialty } from '../api/authApi';
import { useAuth } from '../contexts/AuthContext';

import type { SoapNote, MedicalEntities, TranscriptSegment } from '../types/doctor.types';

export default function DoctorDashboard() {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [soapNote, setSoapNote] = useState<SoapNote | null>(null);
  const [entities, setEntities] = useState<MedicalEntities | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleTranscribed = (segments: TranscriptSegment[], newSessionId: string) => {
    setTranscript(segments);
    setSessionId(newSessionId);
    setSoapNote(null);
    setEntities(null);
    setGenError(null);
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
    setTranscript([]);
    setSessionId(null);
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

  /* ── Doctor Specialty state ──────────────────────────────────── */
  const { user, setUser } = useAuth();
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listSpecialties();
        if (!cancelled) setSpecialties(res.specialties);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSpecialty = useCallback(async () => {
    if (!specialtyDraft) return;
    setSavingSpecialty(true);
    try {
      const updated = await updateMySpecialty(specialtyDraft);
      setUser(updated);
      setSpecialtyDraft('');
    } catch (err) {
      console.error('Failed to save specialty', err);
      alert('Could not save your specialty. Please try again.');
    } finally {
      setSavingSpecialty(false);
    }
  }, [specialtyDraft, setUser]);

  const currentSpecialtyName =
    specialties.find((s) => s.id === user?.specialty)?.name || user?.specialty || '';



  return (
    <div style={{ flex: 1, minWidth: 0, maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {user?.full_name && (
              <span style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                Welcome, <strong style={{ color: 'var(--text-primary)' }}>{user.full_name}</strong>
              </span>
            )}
            {currentSpecialtyName && (
              <span style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(45, 212, 191, 0.12)',
                border: '1px solid rgba(45, 212, 191, 0.35)',
                color: '#5eead4',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}>
                🩺 {currentSpecialtyName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 6 }}>
            Upload a consultation audio file or schedule a Google Meet — both flow into AI-generated SOAP notes
          </p>
        </div>
        {/* <button
          className="btn-primary"
          onClick={() => navigate('/consultation/schedule')}
          style={{ fontSize: '0.88rem', padding: '10px 20px', whiteSpace: 'nowrap' }}
        >
          📅 Schedule Google Meet
        </button> */}
      </div>


      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left: Audio upload + transcript */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <AudioFileUpload
            onTranscribed={handleTranscribed}
            onClear={handleNewSession}
            hasTranscript={transcript.length > 0}
          />

          <TranscriptView segments={transcript} />

          {/* Generate SOAP Note Button */}
          {transcript.length > 0 && (
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
            <>
              <SoapNoteEditor
                soapNote={soapNote}
                sessionId={sessionId}
                onUpdate={setSoapNote}
              />
              {sessionId && <SoapAuditPanel sessionId={sessionId} />}
              {sessionId && <FollowUpCard sessionId={sessionId} />}
            </>
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
                Upload a consultation audio file, then click "Generate SOAP Note"
                to create an AI-assisted clinical note.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Responsive override */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: '1fr 1fr'"],
          div[style*="grid-template-columns"] {
            display: flex !important;
            flex-direction: column !important;
          }
        }
      ` }} />

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
            {meetSessionId && <IntakePreviewPanel sessionId={meetSessionId} />}
            <SoapNoteEditor
              soapNote={meetSoapNote}
              sessionId={meetSessionId}
              onUpdate={setMeetSoapNote}
            />
            {meetSessionId && <SoapAuditPanel sessionId={meetSessionId} />}
            {meetSessionId && <FollowUpCard sessionId={meetSessionId} />}
          </div>
        )}
      </div>

      {/* The intake summary panel for the active Meet processing session
          is rendered inside the SOAP block below; this section is just the
          specialty onboarding card. */}
      {!user?.specialty && (
        <div style={{ marginTop: 32 }}>
          <div
            className="glass-card"
            style={{ padding: '24px 28px' }}
            id="specialty-onboarding"
          >
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>
              Choose your specialty
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              Patients pick a specific doctor when they start a chat. Set your
              specialty so you appear in their picker and chats can be routed
              to you.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                value={specialtyDraft}
                onChange={(e) => setSpecialtyDraft(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 220,
                  background: 'rgba(15,30,60,0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              >
                <option value="">Select a specialty…</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={handleSaveSpecialty}
                disabled={!specialtyDraft || savingSpecialty}
                style={{ padding: '10px 18px', fontSize: '0.85rem' }}
              >
                {savingSpecialty ? 'Saving…' : 'Save specialty'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ── Pre-visit intake summary panel ────────────────────────────────────
   Renders the AI-generated context paragraph the patient's intake form
   produced. Hidden entirely when the patient has not yet submitted (the
   API returns 404 in that case). Collapsible "raw answers" toggle so the
   doctor can verify what was actually said. */
function IntakePreviewPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<IntakeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setData(null);
    (async () => {
      try {
        const res = await getIntakeSummary(sessionId);
        if (!cancelled) setData(res);
      } catch (err) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : 0;
        if (status === 404) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (missing) return null;
  if (loading) {
    return (
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          marginBottom: 16,
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          className="spinner"
          style={{
            width: 14,
            height: 14,
            borderWidth: 2,
            display: 'inline-block',
            verticalAlign: 'middle',
            marginRight: 8,
          }}
        />
        Loading pre-visit intake…
      </div>
    );
  }
  if (!data) return null;

  const summary = data.intake_summary;
  const answers = data.intake_data?.answers || {};
  const submitted = data.submitted_at
    ? new Date(data.submitted_at).toLocaleString()
    : null;

  return (
    <div
      className="glass-card"
      style={{
        padding: '18px 22px',
        marginBottom: 16,
        borderLeft: '4px solid var(--brand-teal)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: collapsed ? 0 : 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              marginBottom: 2,
            }}
          >
            📝 Pre-Visit Intake Summary
            {data.intake_data?.patient_name && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                — {data.intake_data.patient_name}
              </span>
            )}
          </h3>
          {submitted && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Submitted {submitted}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {collapsed ? '▼ Show' : '▲ Hide'}
        </button>
      </div>

      {!collapsed && (
        <div>
          {summary ? (
            <p
              style={{
                fontSize: '0.92rem',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {summary}
            </p>
          ) : (
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                margin: 0,
              }}
            >
              Summary is still generating — refresh in a few seconds, or view
              raw answers below.
            </p>
          )}

          <button
            onClick={() => setShowRaw((s) => !s)}
            style={{
              marginTop: 14,
              background: 'transparent',
              border: 'none',
              color: 'var(--brand-teal)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showRaw ? '▲ Hide raw answers' : '▼ Show raw answers'}
          </button>

          {showRaw && (
            <div
              style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(15,30,60,0.4)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {Object.keys(answers).length === 0 ? (
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  No answers recorded.
                </span>
              ) : (
                Object.entries(answers)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([idx, ans]) => (
                    <div key={idx}>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: 'var(--brand-teal)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          marginBottom: 2,
                        }}
                      >
                        Question {Number(idx) + 1}
                      </div>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {ans || (
                          <em style={{ color: 'var(--text-muted)' }}>
                            (skipped)
                          </em>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
