'use client';

import React, { useState } from 'react';
import { INITIAL_MATTERS } from '@/lib/mockMatters';
import { Matter, EvidenceDocument } from '@/types';
import { splitParagraphs, paraReplyLine, diffText, DiffOp } from '@/lib/drafting';
import { findConflicts, mineText } from '@/lib/textmine';
import { BUILTIN_COURT_PROFILES, lintAgainstCourtRules } from '@/lib/docxExport';
import {
  FileText,
  Scale,
  Calendar,
  AlertTriangle,
  FolderOpen,
  CheckCircle2,
  Download,
  BookOpen,
  ArrowRight,
  Shield,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function MattersSection() {
  const [matters, setMatters] = useState<Matter[]>(INITIAL_MATTERS);
  const [selectedMatterId, setSelectedMatterId] = useState<string>(INITIAL_MATTERS[0].id);
  const [activeTab, setActiveTab] = useState<'facts' | 'research' | 'evidence' | 'arguments' | 'drafting'>('facts');

  // Para-wise reply state
  const [plaintInput, setPlaintInput] = useState<string>(
    `1. The Plaintiff is a company incorporated under the Companies Act, 2013 having its registered office in Mumbai.\n2. On 12 January 2025 the parties signed a commercial agreement.\n3. The Defendant received total consideration of Rs. 50,00,000.\n4. Handover was due on 30 November 2025 which was breached.`
  );
  const [stances, setStances] = useState<Record<number, 'admitted' | 'denied' | 'partly' | 'unknown' | 'legal'>>({
    1: 'admitted',
    2: 'admitted',
    3: 'partly',
    4: 'denied',
  });
  const [stanceNotes, setStanceNotes] = useState<Record<number, string>>({
    3: 'received only Rs. 35,00,000 in tranches',
    4: 'delay caused by Plaintiff failure to supply architectural NOC',
  });

  // Court profile & docx export
  const [courtProfileId, setCourtProfileId] = useState<string>(BUILTIN_COURT_PROFILES[0].id);
  const [exportLoading, setExportLoading] = useState(false);

  // Redline Diff preview
  const [diffOld, setDiffOld] = useState<string>('The applicant has fully cooperated with the investigation at all times.');
  const [diffNew, setDiffNew] = useState<string>('The applicant has documented cooperation with the investigating agency and produced all requested records.');

  const selectedMatter = matters.find((m) => m.id === selectedMatterId) || matters[0];

  const handleExportDocx = async () => {
    setExportLoading(true);
    try {
      const sections = [
        { heading: selectedMatter.title.toUpperCase(), body: `IN THE ${selectedMatter.court.toUpperCase()}\nCASE NO: ${selectedMatter.caseNo}` },
        { heading: 'APPLICATION FACTS', body: `Objective: ${selectedMatter.facts.objective}\nRelief Sought: ${selectedMatter.facts.relief}\nLegal Issue: ${selectedMatter.facts.issue}` },
        { heading: 'GROUNDS & ARGUMENTS', body: selectedMatter.arguments.map((a, i) => `${i + 1}. ${a.point}\nSupport: ${a.support}`).join('\n\n') },
        { heading: 'RELIED UPON AUTHORITIES', body: selectedMatter.authorities.map((a) => `• ${a.title} (${a.meta})`).join('\n') },
      ];

      const res = await fetch('/api/docx/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedMatter.caseNo,
          sections,
          profileId: courtProfileId,
          font: 'Times New Roman',
          fontSize: 12,
          lineSpacing: 1.5,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate Word document');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedMatter.caseNo}_Pleading.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error generating export');
    } finally {
      setExportLoading(false);
    }
  };

  // Run inconsistency detection on evidence documents
  const docsForConflict = (selectedMatter.evidenceDocs || []).map((d) => ({
    id: d.id,
    name: d.title,
    text: d.text,
  }));
  const detectedConflicts = findConflicts(docsForConflict);

  // Split plaint into paragraphs
  const parsedParagraphs = splitParagraphs(plaintInput);
  const selectedProfile = BUILTIN_COURT_PROFILES.find((p) => p.id === courtProfileId) || BUILTIN_COURT_PROFILES[0];
  const lintWarnings = lintAgainstCourtRules({ font: 'Times New Roman', size: 12, spacing: 1.5 }, selectedProfile);

  const diffOps: DiffOp[] = diffText(diffOld, diffNew);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', minHeight: '800px' }}>
      {/* Matters Sidebar List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Active Matters</h2>
          <span className="badge badge-blue">{matters.length} matters</span>
        </div>

        {matters.map((m) => {
          const isSelected = m.id === selectedMatterId;
          return (
            <div
              key={m.id}
              onClick={() => setSelectedMatterId(m.id)}
              style={{
                background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.caseNo}</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                  Stage {m.stage + 1}/5
                </span>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.4rem 0', color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>
                {m.title}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.court}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--accent-gold)' }}>
                <Clock size={12} />
                <span>Next: {m.nextHearing.date} ({m.nextHearing.purpose})</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matter Workspace Details */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header Banner */}
        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span className="badge badge-blue">{selectedMatter.area}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lead: {selectedMatter.lead}</span>
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700 }}>{selectedMatter.title}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {selectedMatter.court} · {selectedMatter.caseNo}
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleExportDocx} disabled={exportLoading}>
              <Download size={16} />
              {exportLoading ? 'Generating...' : 'Export Court .docx'}
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
            {(
              [
                { id: 'facts', label: 'Overview & Facts', icon: <FileText size={15} /> },
                { id: 'research', label: 'Authorities & Research', icon: <BookOpen size={15} /> },
                { id: 'evidence', label: 'Evidence & OCR Mining', icon: <FolderOpen size={15} /> },
                { id: 'arguments', label: 'Arguments & Strategy', icon: <Scale size={15} /> },
                { id: 'drafting', label: 'Drafting & Para-wise Reply', icon: <Sparkles size={15} /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: activeTab === t.id ? 'var(--bg-elevated)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                  padding: '0.5rem 0.85rem',
                  color: activeTab === t.id ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Facts */}
        {activeTab === 'facts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Objective</span>
                <p style={{ marginTop: '0.35rem', fontSize: '0.9rem', lineHeight: '1.4' }}>{selectedMatter.facts.objective}</p>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Relief Sought</span>
                <p style={{ marginTop: '0.35rem', fontSize: '0.9rem', lineHeight: '1.4' }}>{selectedMatter.facts.relief}</p>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Core Issue</span>
                <p style={{ marginTop: '0.35rem', fontSize: '0.9rem', lineHeight: '1.4' }}>{selectedMatter.facts.issue}</p>
              </div>
            </div>

            {/* Next Hearing Alert */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Calendar size={28} color="var(--primary)" />
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  Upcoming Hearing: {selectedMatter.nextHearing.date} ({selectedMatter.nextHearing.time})
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedMatter.nextHearing.purpose} — {selectedMatter.nextHearing.court2}
                </p>
              </div>
            </div>

            {/* Checklist */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Litigation Checklist</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedMatter.tasks.map((task, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      background: 'var(--bg-secondary)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <CheckCircle2 size={16} color={task.done ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
                    <span style={{ textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {task.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Research */}
        {activeTab === 'research' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Pinned Authorities & Precedents</h3>
            {selectedMatter.authorities.map((a, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{a.meta}</p>
                </div>
                <span className="badge badge-blue">Pinned Precedent</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Evidence & OCR Text Mining */}
        {activeTab === 'evidence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Inconsistency Detection Banner */}
            {detectedConflicts.length > 0 && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)', fontWeight: 600 }}>
                  <AlertTriangle size={18} />
                  <span>Cross-Document Fact Inconsistency Detected ({detectedConflicts.length})</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  The OCR text mining engine flagged conflicting dates or rupee amounts across documents for the same event key.
                </p>
                {detectedConflicts.map((c, i) => (
                  <div key={i} style={{ marginTop: '0.5rem', background: 'var(--bg-card)', padding: '0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                    <strong style={{ color: 'var(--accent-gold)' }}>Event: {c.label} ({c.type})</strong>
                    {c.docs.map((d, di) => (
                      <div key={di} style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        • <strong>{d.docName}</strong>: {d.items.map((it) => it.raw).join(', ')}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Document list with extracted facts */}
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Indexed Evidence Documents (Confidential Client-Side)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(selectedMatter.evidenceDocs || []).map((doc) => {
                const mined = mineText(doc.text);
                return (
                  <div key={doc.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-blue">Annexure {doc.annexure}</span>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{doc.title}</h4>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{doc.date}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0' }}>{doc.summary}</p>

                    {/* Mined tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {mined.dates.map((d, di) => (
                        <span key={di} className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                          📅 {d.raw} {d.eventLabel ? `(${d.eventLabel})` : ''}
                        </span>
                      ))}
                      {mined.amounts.map((a, ai) => (
                        <span key={ai} className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                          ₹ {a.raw} {a.eventLabel ? `(${a.eventLabel})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Arguments */}
        {activeTab === 'arguments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Legal Grounds & Precedent Stress Testing</h3>
            {selectedMatter.arguments.map((arg, i) => (
              <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Ground {i + 1}: {arg.point}
                  </h4>
                  <span className="badge badge-emerald">Strength: {arg.strength}%</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  <strong>Evidentiary Basis:</strong> {arg.support}
                </p>
                {arg.stressTest && (
                  <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--bg-card)', borderLeft: '3px solid var(--primary)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Shield size={14} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: '-2px' }} />
                    <strong>Precedent Stress Test:</strong> {arg.stressTest}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Drafting, Para-wise Replies, Court Rules & Redline Diff */}
        {activeTab === 'drafting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Court Profile Linting */}
            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Court Formatting Profile Linter</h4>
                <select
                  className="form-select"
                  style={{ width: '220px' }}
                  value={courtProfileId}
                  onChange={(e) => setCourtProfileId(e.target.value)}
                >
                  {BUILTIN_COURT_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.paper})
                    </option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Paper: {selectedProfile.paper} · Left binding margin: {selectedProfile.margins.left}cm · Top/Bottom: {selectedProfile.margins.top}cm
              </p>
            </div>

            {/* Para-wise Reply Tool */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Para-Wise Reply Builder (Plaint / Notice)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Paste the opponent’s plaint or notice below. The engine numbers each paragraph and formats procedural legal stances.
              </p>
              <textarea
                className="form-textarea"
                rows={4}
                value={plaintInput}
                onChange={(e) => setPlaintInput(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1rem' }}>
                {parsedParagraphs.paragraphs.map((p) => {
                  const currentStance = stances[p.n] || 'denied';
                  return (
                    <div key={p.n} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          Paragraph {p.n}: &ldquo;{p.text}&rdquo;
                        </span>
                        <select
                          className="form-select"
                          style={{ width: '180px', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                          value={currentStance}
                          onChange={(e) => setStances({ ...stances, [p.n]: e.target.value as any })}
                        >
                          <option value="admitted">Admitted</option>
                          <option value="denied">Denied</option>
                          <option value="partly">Partly admitted</option>
                          <option value="unknown">No knowledge</option>
                          <option value="legal">Legal submission</option>
                        </select>
                      </div>

                      {/* Substance Note Input if partly admitted */}
                      {currentStance === 'partly' && (
                        <input
                          type="text"
                          className="form-input"
                          placeholder="State what is admitted (the rest remains denied)..."
                          value={stanceNotes[p.n] || ''}
                          onChange={(e) => setStanceNotes({ ...stanceNotes, [p.n]: e.target.value })}
                          style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}
                        />
                      )}

                      {/* Generated output line */}
                      <p style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', marginTop: '0.4rem', fontFamily: 'JetBrains Mono, monospace' }}>
                        &rarr; {paraReplyLine({ n: p.n, stance: currentStance, note: stanceNotes[p.n] }, { doc: 'plaint', as: 'the Defendant', other: 'the Plaintiff' })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Word-level Redline Diffing Tool */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Draft Revisions Redline Diff</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Version 1 (Old)</span>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={diffOld}
                    onChange={(e) => setDiffOld(e.target.value)}
                    style={{ fontSize: '0.8rem' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Version 2 (New)</span>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={diffNew}
                    onChange={(e) => setDiffNew(e.target.value)}
                    style={{ fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              {/* Rendered Redline */}
              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', lineHeight: '1.6' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Word-Level Redline Output:</span>
                {diffOps.map((op, i) => {
                  if (op.t === 'del') {
                    return (
                      <span key={i} style={{ textDecoration: 'line-through', color: 'var(--accent-rose)', backgroundColor: 'rgba(244, 63, 94, 0.15)', padding: '0 2px' }}>
                        {op.text}
                      </span>
                    );
                  }
                  if (op.t === 'ins') {
                    return (
                      <span key={i} style={{ color: 'var(--accent-emerald)', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '0 2px', fontWeight: 600 }}>
                        {op.text}
                      </span>
                    );
                  }
                  return <span key={i}>{op.text}</span>;
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
