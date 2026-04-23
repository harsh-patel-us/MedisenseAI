import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptSegment } from '../types/doctor.types';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  transcript: TranscriptSegment[];
  sessionId: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setDuration(0);

    try {
      // Request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // Open WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8000`;
      const ws = new WebSocket(`${wsHost}/doctor/stream-audio`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session_start') {
          setSessionId(msg.session_id);
        } else if (msg.type === 'transcript_segment') {
          setTranscript((prev) => [...prev, msg.data as TranscriptSegment]);
        } else if (msg.type === 'session_complete') {
          console.log('Session complete', msg);
        } else if (msg.type === 'error') {
          setError(msg.message);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection failed. Is the backend running?');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
      };

      // Wait for WS to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
        ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WS error')); }, { once: true });
      });

      // Create a function to cycle MediaRecorders so each chunk has a valid WebM header
      const recordChunk = () => {
        if (!isRecordingRef.current) return;
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        });
        
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(event.data);
          }
        };
        
        mediaRecorder.start();
        
        // Stop after 4 seconds to yield exactly one full valid webm file
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          if (isRecordingRef.current) {
            recordChunk();
          }
        }, 4000);
      };

      isRecordingRef.current = true;
      setIsRecording(true);
      recordChunk();

      // Duration timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to start recording');
      console.error('Recording error:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Send stop signal to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }));
      setTimeout(() => wsRef.current?.close(), 1000);
    }

    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setDuration(0);
    setSessionId(null);
    setError(null);
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    transcript,
    sessionId,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}
