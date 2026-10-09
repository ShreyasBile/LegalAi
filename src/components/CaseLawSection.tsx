'use client';

import React, { useState, useEffect } from 'react';
import { CaseLawItem } from '@/lib/caselaw';
import { Search, BookOpen, Scale, Award, ArrowUpRight } from 'lucide-react';

export default function CaseLawSection() {
  const [query, setQuery] = useState('anticipatory bail');
  const [courtFilter, setCourtFilter] = useState('');
  const [results, setResults] = useState<CaseLawItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchCaseLaw = async (q: string, court: string) => {
    setLoading(true);
    try {
      const url = new URL('/api/caselaw/search', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (court) url.searchParams.set('court', court);
      const res = await fetch(url.toString());
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseLaw('bail', '');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search Header Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Indian Case-Law Catalogue & Research Search</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Search judgments across the Supreme Court and 25 High Courts by party name, legal subject, neutral citation, or headnote.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search e.g. Maneka Gandhi, anticipatory bail, commercial contract, Article 21..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCaseLaw(query, courtFilter)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: '220px' }}
            value={courtFilter}
            onChange={(e) => {
              setCourtFilter(e.target.value);
              fetchCaseLaw(query, e.target.value);
            }}
          >
            <option value="">All Courts</option>
            <option value="Supreme Court">Supreme Court of India</option>
            <option value="Bombay High Court">Bombay High Court</option>
          </select>
          <button className="btn btn-primary" onClick={() => fetchCaseLaw(query, courtFilter)} disabled={loading}>
            <Search size={16} />
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Suggested queries:</span>
          {['Maneka Gandhi', 'Sushila Aggarwal', 'commercial suit', 'privacy'].map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setQuery(tag);
                fetchCaseLaw(tag, courtFilter);
              }}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Found {total} relevant judgment{total === 1 ? '' : 's'}
          </span>
        </div>

        {results.map((c) => (
          <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-blue" style={{ marginBottom: '0.35rem' }}>
                  {c.court} ({c.year})
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--primary)' }}>{c.title}</h3>
              </div>
              {c.citingCount && (
                <span className="badge badge-amber" title="Citation graph citation frequency">
                  ★ Cited in {c.citingCount} judgments
                </span>
              )}
            </div>

            {/* Citations row */}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {c.neutralCitation && <span>Neutral Cit: <strong>{c.neutralCitation}</strong></span>}
              {c.scrCitation && <span>S.C.R.: <strong>{c.scrCitation}</strong></span>}
              {c.outcome && <span style={{ color: 'var(--accent-emerald)' }}>Outcome: <strong>{c.outcome}</strong></span>}
            </div>

            {/* Headnote */}
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {c.headnote}
            </p>

            {c.judges && c.judges.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                Bench: {c.judges.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
