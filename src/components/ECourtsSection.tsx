'use client';

import React, { useState } from 'react';
import { ECourtsIndexedCase } from '@/lib/ecourts';
import { Search, Building2, User, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ECourtsSection() {
  const [cnrQuery, setCnrQuery] = useState('MHCC010012342026');
  const [lookupResult, setLookupResult] = useState<ECourtsIndexedCase | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Search mode state
  const [searchMode, setSearchMode] = useState<'party' | 'filing' | 'fir' | 'advocate'>('party');
  const [searchTerm, setSearchTerm] = useState('Sharma');
  const [searchResults, setSearchResults] = useState<ECourtsIndexedCase[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleCnrLookup = async () => {
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/ecourts/cases/${encodeURIComponent(cnrQuery.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.found) {
        setLookupError(data.detail || data.message || 'Case not found for CNR');
      } else {
        setLookupResult(data.data);
      }
    } catch {
      setLookupError('Network error connecting to eCourts service');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSearch = async () => {
    setSearchLoading(true);
    try {
      const url = new URL('/api/ecourts/search', window.location.origin);
      url.searchParams.set('mode', searchMode);
      if (searchMode === 'party') url.searchParams.set('name', searchTerm);
      if (searchMode === 'filing') url.searchParams.set('filingNumber', searchTerm);
      if (searchMode === 'fir') url.searchParams.set('firNumber', searchTerm);
      if (searchMode === 'advocate') url.searchParams.set('advocate', searchTerm);

      const res = await fetch(url.toString());
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Left Column: CNR Lookup */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>National CNR Case Status</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Enter the 16-character Case Number Record (CNR) for instant status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. MHCC010012342026"
            value={cnrQuery}
            onChange={(e) => setCnrQuery(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCnrLookup} disabled={lookupLoading}>
            {lookupLoading ? 'Fetching...' : 'Lookup CNR'}
          </button>
        </div>

        {/* CNR Result Box */}
        {lookupError && (
          <div style={{ padding: '0.75rem', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
            <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: '-3px' }} />
            {lookupError}
          </div>
        )}

        {lookupResult && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '1rem', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="badge badge-emerald">Verified CNR</span>
              <span className="badge badge-blue">{lookupResult.status.toUpperCase()}</span>
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)' }}>
              {lookupResult.caseType} ({lookupResult.registrationNumber || lookupResult.filingNumber})
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Court:</strong> {lookupResult.courtComplex} ({lookupResult.district}, {lookupResult.state})
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Petitioner:</strong> {lookupResult.petitioners.map((p) => p.name).join(', ')}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Respondent:</strong> {lookupResult.respondents.map((r) => r.name).join(', ')}
            </p>
            {lookupResult.nextHearingDate && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                📅 <strong>Next Hearing:</strong> {lookupResult.nextHearingDate} ({lookupResult.purpose || 'Listed'})
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Column: Multi-mode Search */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>eCourts Multi-Mode Search</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Search cases across courts by party name, filing number, FIR, or counsel.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            className="form-select"
            style={{ width: '150px' }}
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as any)}
          >
            <option value="party">Party Name</option>
            <option value="filing">Filing No.</option>
            <option value="fir">FIR No.</option>
            <option value="advocate">Advocate</option>
          </select>
          <input
            type="text"
            className="form-input"
            placeholder={`Enter ${searchMode}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={searchLoading}>
            <Search size={16} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
          {searchResults.map((c) => (
            <div
              key={c.cnr}
              onClick={() => {
                setCnrQuery(c.cnr);
                setLookupResult(c);
              }}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>{c.cnr}</span>
                <span className="badge badge-blue">{c.courtComplex}</span>
              </div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.2rem' }}>
                {c.petitioners[0]?.name} v. {c.respondents[0]?.name}
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.caseType} · Filing: {c.filingNumber}</p>
            </div>
          ))}
          {searchResults.length === 0 && !searchLoading && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>
              No cases matching query. Try &ldquo;Sharma&rdquo;, &ldquo;Patel&rdquo;, or &ldquo;1234&rdquo;.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
