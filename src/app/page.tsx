'use client';

import React, { useState } from 'react';
import MattersSection from '@/components/MattersSection';
import LimitationSection from '@/components/LimitationSection';
import ECourtsSection from '@/components/ECourtsSection';
import CaseLawSection from '@/components/CaseLawSection';
import WhatsAppSection from '@/components/WhatsAppSection';
import AIIntelligenceHub from '@/components/AIIntelligenceHub';
import {
  FolderKanban,
  Clock,
  Building,
  Search,
  MessageCircle,
  Sparkles,
} from 'lucide-react';

export default function Home() {
  const [activeView, setActiveView] = useState<'matters' | 'limitation' | 'ecourts' | 'caselaw' | 'whatsapp' | 'ai'>('ai');

  return (
    <div className="app-container">
      {/* Top Application Bar */}
      <header className="top-nav">
        <div className="nav-brand">
          <div className="brand-badge">LEGAL AI</div>
          <div>
            <h1 className="brand-title">Advocate Litigation Workspace</h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Next.js & TypeScript · OpenRouter Gemini 3.8 Flash Engine
            </span>
          </div>
        </div>

        {/* Global Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeView === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveView('ai')}
          >
            <Sparkles size={16} color={activeView === 'ai' ? '#ffffff' : '#f59e0b'} />
            AI Intelligence Studio (15 Agents)
          </button>
          <button
            className={`nav-tab-btn ${activeView === 'matters' ? 'active' : ''}`}
            onClick={() => setActiveView('matters')}
          >
            <FolderKanban size={16} />
            Matters Workspace
          </button>
          <button
            className={`nav-tab-btn ${activeView === 'limitation' ? 'active' : ''}`}
            onClick={() => setActiveView('limitation')}
          >
            <Clock size={16} />
            Limitation & Deadlines
          </button>
          <button
            className={`nav-tab-btn ${activeView === 'ecourts' ? 'active' : ''}`}
            onClick={() => setActiveView('ecourts')}
          >
            <Building size={16} />
            eCourts Portal
          </button>
          <button
            className={`nav-tab-btn ${activeView === 'caselaw' ? 'active' : ''}`}
            onClick={() => setActiveView('caselaw')}
          >
            <Search size={16} />
            Case-Law Search
          </button>
          <button
            className={`nav-tab-btn ${activeView === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveView('whatsapp')}
          >
            <MessageCircle size={16} />
            WhatsApp Reminders
          </button>
        </nav>

        {/* Top Right Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
            Gemini 3.8 Flash Ready
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {activeView === 'ai' && <AIIntelligenceHub />}
        {activeView === 'matters' && <MattersSection />}
        {activeView === 'limitation' && <LimitationSection />}
        {activeView === 'ecourts' && <ECourtsSection />}
        {activeView === 'caselaw' && <CaseLawSection />}
        {activeView === 'whatsapp' && <WhatsAppSection />}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.25rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
          marginTop: 'auto',
          background: 'var(--bg-secondary)',
        }}
      >
        <div>
          <span>LegalAI Platform · 15 Advanced Autonomous Agent Workflows Operational</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span>Limitation Act, 1963</span>
          <span>CPC Order VIII</span>
          <span>BNSS §482</span>
          <span>OpenRouter google/gemini-3.8-flash</span>
        </div>
      </footer>
    </div>
  );
}
