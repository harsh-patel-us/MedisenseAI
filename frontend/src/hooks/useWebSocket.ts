/**
 * useWebSocket.ts — Generic WebSocket hook for MediSense AI
 * Manages connection lifecycle, reconnect logic, and message dispatching.
 * Used by useAudioRecorder for real-time transcript streaming.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseWebSocketOptions {
  /** Called when the connection opens */
  onOpen?: () => void;
  /** Called on incoming JSON messages */
  onMessage?: (msg: Record<string, unknown>) => void;
  /** Called on connection error */
  onError?: (event: Event) => void;
  /** Called when the socket closes */
  onClose?: () => void;
}

interface UseWebSocketReturn {
  status: WsStatus;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  sendJson: (data: Record<string, unknown>) => void;
  sendBinary: (data: ArrayBuffer | Blob) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref fresh without re-creating callbacks
  useEffect(() => {
    optionsRef.current = options;
  });

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const connect = useCallback(
    (url: string): Promise<void> => {
      disconnect();
      setStatus('connecting');

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          optionsRef.current.onOpen?.();
          resolve();
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string) as Record<string, unknown>;
            optionsRef.current.onMessage?.(msg);
          } catch {
            // Non-JSON frame — ignore
          }
        };

        ws.onerror = (event: Event) => {
          setStatus('error');
          optionsRef.current.onError?.(event);
          reject(new Error('WebSocket connection failed'));
        };

        ws.onclose = () => {
          setStatus('disconnected');
          optionsRef.current.onClose?.();
        };

        // Timeout if open takes too long
        const timeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            reject(new Error('WebSocket connection timed out after 6 seconds'));
          }
        }, 6000);

        ws.addEventListener('open', () => clearTimeout(timeout), { once: true });
      });
    },
    [disconnect]
  );

  const sendJson = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return { status, connect, disconnect, sendJson, sendBinary };
}
