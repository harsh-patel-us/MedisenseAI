import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CallControls from '../components/consultation/CallControls';
import ConsultationTranscript from '../components/consultation/ConsultationTranscript';
import PostCallSummary from '../components/consultation/PostCallSummary';
import VideoGrid from '../components/consultation/VideoGrid';
import type {
  CallStatus,
  ConsultationRole,
  ConsultationTranscriptSegment,
  PostCallData,
} from '../types/consultation.types';
import { createConsultationWebSocket } from '../api/consultationApi';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function ConsultationRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = (searchParams.get('role') || 'patient') as ConsultationRole;

  // ── Media + network refs (not state — don't need re-renders) ──
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteStream = useRef(new MediaStream()).current;

  // ── UI state ──
  const [callStatus, setCallStatus] = useState<CallStatus>('waiting');
  const [transcript, setTranscript] = useState<ConsultationTranscriptSegment[]>([]);
  const [postCallData, setPostCallData] = useState<PostCallData | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [roomInfo, setRoomInfo] = useState<{
    doctor_name: string;
    patient_name: string;
    session_id: string;
  } | null>(null);

  // ── Media helpers ──────────────────────────────────────────────────────────

  const initLocalMedia = (): Promise<MediaStream> => {
    if (mediaPromiseRef.current) return mediaPromiseRef.current;
    const p = navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        return stream;
      });
    mediaPromiseRef.current = p;
    return p;
  };

  const createPeer = (stream: MediaStream, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    };

    pc.onicecandidate = e => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'ice-candidate', candidate: e.candidate.toJSON() }),
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallStatus('active');
      if (pc.connectionState === 'failed') setError('WebRTC connection failed. Check your network.');
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer).then(() => offer))
        .then(offer => {
          wsRef.current?.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        })
        .catch(err => setError(`Offer failed: ${err.message}`));
    }
  };

  const startAudioCapture = (stream: MediaStream) => {
    const ws = wsRef.current;
    if (!ws) return;
    const audioStream = new MediaStream(stream.getAudioTracks());
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(audioStream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = e => {
      if (e.data.size > 100 && ws.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => ws.send(buf));
      }
    };
    recorder.start(4000);
  };

  // ── WebSocket setup ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return;

    const ws = createConsultationWebSocket(roomId, role);
    wsRef.current = ws;

    ws.onmessage = async event => {
      if (typeof event.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const type = msg.type as string;

      switch (type) {
        case 'connected':
          setRoomInfo({
            doctor_name: msg.doctor_name as string,
            patient_name: msg.patient_name as string,
            session_id: msg.session_id as string,
          });
          setStatusMsg(
            role === 'doctor'
              ? 'Waiting for patient to join...'
              : 'Connected. Waiting for doctor...',
          );
          break;

        case 'peer-ready':
          setCallStatus('connecting');
          setStatusMsg('Both participants connected — establishing video call...');
          if (role === 'doctor') {
            // Doctor initiates: get media, create peer, generate offer
            const stream = await initLocalMedia();
            createPeer(stream, true);
            startAudioCapture(stream);
          } else {
            // Patient: get media ready, wait for offer
            const stream = await initLocalMedia();
            startAudioCapture(stream);
          }
          break;

        case 'offer':
          if (role === 'patient') {
            const stream = await initLocalMedia();
            if (!peerRef.current) createPeer(stream, false);
            const pc = peerRef.current!;
            await pc.setRemoteDescription(
              new RTCSessionDescription({ type: 'offer', sdp: msg.sdp as string }),
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
            setCallStatus('active');
          }
          break;

        case 'answer':
          if (role === 'doctor' && peerRef.current) {
            await peerRef.current.setRemoteDescription(
              new RTCSessionDescription({ type: 'answer', sdp: msg.sdp as string }),
            );
          }
          break;

        case 'ice-candidate':
          if (peerRef.current && msg.candidate) {
            try {
              await peerRef.current.addIceCandidate(
                new RTCIceCandidate(msg.candidate as RTCIceCandidateInit),
              );
            } catch (e) {
              console.warn('ICE candidate error:', e);
            }
          }
          break;

        case 'transcript_segment':
          setTranscript(prev => [...prev, msg.data as ConsultationTranscriptSegment]);
          break;

        case 'processing':
          setCallStatus('ending');
          setStatusMsg((msg.message as string) || 'Generating AI notes...');
          break;

        case 'post-call-ready':
          setPostCallData(msg as unknown as PostCallData);
          setCallStatus('ended');
          setStatusMsg('');
          break;

        case 'call-ended':
          setCallStatus('ending');
          setStatusMsg('Call ended by the other participant. Processing notes...');
          break;

        case 'peer-disconnected':
          setError(`The ${msg.role as string} has left the call.`);
          if (callStatus !== 'ended') setCallStatus('ended');
          break;

        case 'error':
          setError((msg.message as string) || 'An error occurred');
          break;

        default:
          break;
      }
    };

    ws.onerror = () => setError('Connection error. Please refresh and try again.');
    ws.onclose = () => {
      if (callStatus !== 'ended') setError('Connection closed unexpectedly.');
    };

    return () => {
      recorderRef.current?.stop();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerRef.current?.close();
      ws.close();
    };
  }, [roomId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Call controls ──────────────────────────────────────────────────────────

  const handleEndCall = () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop-audio' }));
      setTimeout(() => ws.send(JSON.stringify({ type: 'end-call' })), 800);
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    peerRef.current?.close();
    setCallStatus('ending');
    setStatusMsg('Ending call and generating AI notes...');
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsVideoOff(v => !v);
  };

  // ── Labels ────────────────────────────────────────────────────────────────

  const localLabel = role === 'doctor'
    ? (roomInfo?.doctor_name || 'Doctor')
    : (roomInfo?.patient_name || 'Patient');
  const remoteLabel = role === 'doctor'
    ? (roomInfo?.patient_name || 'Patient')
    : (roomInfo?.doctor_name || 'Doctor');

  // ── Render ────────────────────────────────────────────────────────────────

  if (callStatus === 'ended' && postCallData) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }}>
        <PostCallSummary
          data={postCallData}
          role={role}
          roomId={roomId!}
          roomInfo={roomInfo}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '20px' }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{
            fontSize: '1.4rem', fontWeight: 800,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            🎥 Video Consultation
          </h1>
          {roomInfo && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Dr. {roomInfo.doctor_name} · {roomInfo.patient_name} · Room: <strong style={{ color: '#60a5fa', letterSpacing: '1px' }}>{roomId}</strong>
            </p>
          )}
        </div>
        <button
          className="btn-secondary"
          onClick={() => navigate(role === 'doctor' ? '/doctor' : '/')}
          style={{ fontSize: '0.8rem', padding: '6px 14px' }}
        >
          ← Leave
        </button>
      </div>

      {/* Status / error banner */}
      {error && (
        <div style={{
          marginBottom: '12px', padding: '10px 16px',
          background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: '10px', color: '#fca5a5', fontSize: '0.85rem',
        }}>
          ⚠ {error}
        </div>
      )}
      {statusMsg && !error && (
        <div style={{
          marginBottom: '12px', padding: '10px 16px',
          background: 'rgba(23,89,176,0.1)', border: '1px solid rgba(23,89,176,0.2)',
          borderRadius: '10px', color: '#93c5fd', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {callStatus === 'ending' && (
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
          )}
          {statusMsg}
        </div>
      )}

      {/* Main layout: video | transcript */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', alignItems: 'start' }}>
        {/* Left: video + controls */}
        <div>
          <VideoGrid
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            callStatus={callStatus}
            role={role}
            roomId={roomId!}
            localLabel={localLabel}
            remoteLabel={remoteLabel}
          />
          <CallControls
            callStatus={callStatus}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onEndCall={handleEndCall}
          />
        </div>

        {/* Right: live transcript */}
        <div style={{ height: '100%' }}>
          <ConsultationTranscript transcript={transcript} callStatus={callStatus} />
        </div>
      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: '1fr 340px'"] {
            display: flex !important;
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}
