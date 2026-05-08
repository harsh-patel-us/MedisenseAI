import { useEffect, useState } from 'react';
import type { EmergencyAlert as EmergencyAlertData } from '../../types/patientChatbot.types';

const KEYFRAMES_ID = 'medisense-emergency-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes medisense-emergency-pulse {
      0%, 100% {
        box-shadow:
          0 0 0 0 rgba(220, 38, 38, 0.7),
          inset 0 0 0 2px rgba(255, 255, 255, 0.18);
      }
      50% {
        box-shadow:
          0 0 0 14px rgba(220, 38, 38, 0),
          inset 0 0 0 2px rgba(255, 255, 255, 0.28);
      }
    }
    @keyframes medisense-emergency-icon-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.18); }
    }
  `;
  document.head.appendChild(style);
}

const SEVERITY_COPY: Record<string, string> = {
  immediate_911: 'Call emergency services right now.',
  urgent_er: 'Get to the nearest emergency room immediately.',
  see_doctor_today: 'See a doctor today.',
};

function severityLine(severity: string): string {
  return SEVERITY_COPY[severity] || 'Seek medical care immediately.';
}

function formatContactLabel(key: string): string {
  if (key === 'emergency') return 'Emergency';
  if (key === 'ambulance') return 'Ambulance';
  if (key === 'poison_control') return 'Poison Control';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface EmergencyAlertProps {
  alert: EmergencyAlertData;
}

export default function EmergencyAlert({ alert }: EmergencyAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  if (dismissed) return null;

  const contacts = Object.entries(alert.contacts || {});

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        width: '100%',
        background: 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)',
        border: '2px solid #ef4444',
        borderRadius: 14,
        padding: '20px 22px',
        color: '#ffffff',
        margin: '4px 0 14px',
        animation: 'medisense-emergency-pulse 1.6s ease-in-out infinite',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          aria-hidden="true"
          style={{
            fontSize: 38,
            lineHeight: 1,
            animation: 'medisense-emergency-icon-pulse 1.4s ease-in-out infinite',
            display: 'inline-block',
          }}
        >
          🚨
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            ⚠️ Seek Emergency Care Now
          </div>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              opacity: 0.95,
              marginTop: 2,
            }}
          >
            {severityLine(String(alert.severity || ''))}
          </div>
        </div>
      </div>

      {/* Message */}
      {alert.emergency_message && (
        <div
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.55,
            background: 'rgba(0,0,0,0.18)',
            borderRadius: 10,
            padding: '10px 14px',
          }}
        >
          {alert.emergency_message}
        </div>
      )}

      {/* Contacts as tap-to-call buttons */}
      {contacts.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          {contacts.map(([key, number]) => (
            <a
              key={key}
              href={`tel:${number}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '12px 14px',
                background: '#ffffff',
                color: '#7f1d1d',
                borderRadius: 12,
                textDecoration: 'none',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.3px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
              }}
            >
              <span
                style={{
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  opacity: 0.7,
                }}
              >
                {formatContactLabel(key)}
              </span>
              <span style={{ fontSize: '1.25rem' }}>📞 {number}</span>
            </a>
          ))}
        </div>
      )}

      {/* Detected symptoms */}
      {alert.detected_symptoms?.length > 0 && (
        <div
          style={{
            fontSize: '0.82rem',
            background: 'rgba(0,0,0,0.18)',
            borderRadius: 10,
            padding: '8px 14px',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              opacity: 0.8,
              marginBottom: 4,
            }}
          >
            Why we're flagging this
          </div>
          {alert.detected_symptoms.join(', ')}
        </div>
      )}

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{
          alignSelf: 'flex-end',
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#ffffff',
          padding: '8px 16px',
          borderRadius: 999,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
        }}
      >
        I understand — I'm already seeking help
      </button>
    </div>
  );
}
