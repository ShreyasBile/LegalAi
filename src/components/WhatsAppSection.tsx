'use client';

import React, { useState } from 'react';
import { buildWhatsAppLink, cleanIndianMobile } from '@/lib/reminders';
import { MessageSquare, ExternalLink, Send, ShieldCheck, Check } from 'lucide-react';

export default function WhatsAppSection() {
  const [clientName, setClientName] = useState('Rohan Sharma');
  const [phone, setPhone] = useState('9820123456');
  const [matterTitle, setMatterTitle] = useState('Sharma v. State of Maharashtra');
  const [court, setCourt] = useState('Bombay High Court, Courtroom 52');
  const [hearingDate, setHearingDate] = useState('11 September 2026');
  const [hearingTime, setHearingTime] = useState('10:30 AM');
  const [purpose, setPurpose] = useState('Anticipatory Bail Hearing');
  const [consentConfirmed, setConsentConfirmed] = useState(true);

  const { link, message, validPhone } = buildWhatsAppLink({
    phone,
    clientName,
    matterTitle,
    hearingDate,
    hearingTime,
    court,
    purpose,
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Configuration Form */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Client WhatsApp Reminder Generator</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Generates compliant, pre-filled WhatsApp links. You retain complete control and press send manually.
          </p>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Name</label>
          <input
            type="text"
            className="form-input"
            style={{ marginTop: '0.3rem' }}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Client WhatsApp Mobile Number (India)
          </label>
          <input
            type="text"
            className="form-input"
            style={{ marginTop: '0.3rem' }}
            placeholder="e.g. 9820123456 or +91 9820123456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {validPhone ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '0.2rem', display: 'block' }}>
              ✓ Valid Indian mobile (+{cleanIndianMobile(phone)})
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', marginTop: '0.2rem', display: 'block' }}>
              ⚠️ Please enter a 10-digit Indian mobile number
            </span>
          )}
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hearing Date & Time</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.3rem' }}>
            <input
              type="text"
              className="form-input"
              value={hearingDate}
              onChange={(e) => setHearingDate(e.target.value)}
            />
            <input
              type="text"
              className="form-input"
              value={hearingTime}
              onChange={(e) => setHearingTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Court & Bench</label>
          <input
            type="text"
            className="form-input"
            style={{ marginTop: '0.3rem' }}
            value={court}
            onChange={(e) => setCourt(e.target.value)}
          />
        </div>

        {/* Client Consent Checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
          <input
            type="checkbox"
            id="consent"
            checked={consentConfirmed}
            onChange={(e) => setConsentConfirmed(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="consent" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Client has provided consent to receive litigation hearing reminders via WhatsApp.
          </label>
        </div>
      </div>

      {/* WhatsApp Message Preview */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <MessageSquare size={18} color="#25D366" />
              WhatsApp Message Preview
            </h3>
            <span className="badge badge-emerald">Confidential Client Communication</span>
          </div>

          <div
            style={{
              background: '#0b141a',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              marginTop: '1rem',
              border: '1px solid #1f2c34',
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.9rem',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.5',
              color: '#e9edef',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {message}
          </div>
        </div>

        <div>
          <a
            href={consentConfirmed && validPhone ? link : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              width: '100%',
              background: consentConfirmed && validPhone ? '#25D366' : 'var(--bg-elevated)',
              color: '#ffffff',
              padding: '0.75rem',
              pointerEvents: consentConfirmed && validPhone ? 'auto' : 'none',
              opacity: consentConfirmed && validPhone ? 1 : 0.5,
            }}
          >
            <Send size={18} />
            Open Pre-Filled WhatsApp ({validPhone ? `+${cleanIndianMobile(phone)}` : 'Enter Number'})
            <ExternalLink size={16} />
          </a>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
            *Clicking opens WhatsApp Web / Mobile with the pre-formatted text. You verify and click send.
          </p>
        </div>
      </div>
    </div>
  );
}
