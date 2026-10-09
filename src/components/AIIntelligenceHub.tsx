'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Shield,
  Search,
  Scale,
  FileText,
  Clock,
  Building,
  MessageCircle,
  AlertTriangle,
  Send,
  Copy,
  Check,
  Key,
  Flame,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface AIIntelligenceHubProps {
  initialKey?: string;
}

export default function AIIntelligenceHub({ initialKey = '' }: AIIntelligenceHubProps) {
  const [apiKey, setApiKey] = useState(initialKey);
  const [selectedFeature, setSelectedFeature] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Load API key from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('legalai_openrouter_key');
    if (saved) setApiKey(saved);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('legalai_openrouter_key', key);
  };

  // Pre-configured state for feature test runners
  const [f1Title, setF1Title] = useState('Sharma v. State of Maharashtra');
  const [f1Court, setF1Court] = useState('Bombay High Court');
  const [f1Args, setF1Args] = useState(
    JSON.stringify(
      [
        { point: 'The applicant has cooperated at every stage of investigation.', support: 'Attended two 41A notices voluntarily.' },
        { point: 'The dispute is commercial in nature arising from contractual supply.', support: 'Dispute relates to MoU dated 12 Jan 2025.' }
      ],
      null,
      2
    )
  );

  const [f2Text, setF2Text] = useState(
    'The applicant is entitled to protection in view of Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1 and Siddharam Satlingappa Mhetre v. State of Maharashtra (2011) 1 SCC 694. Custodial interrogation is unwarranted.'
  );

  const [f4Averment, setF4Averment] = useState('The Defendant received total consideration of Rs. 50,00,000 on 12 June 2025.');
  const [f4Stance, setF4Stance] = useState('partly');
  const [f4Facts, setF4Facts] = useState('Received only Rs. 35,00,000 in tranches; supply was defective.');

  const [f5Fir, setF5Fir] = useState('FIR No. 211/2026 registered at Andheri PS under Sections 420, 406 IPC alleging failure to supply goods.');
  const [f5Applicant, setF5Applicant] = useState('Rohan Sharma, resident of Andheri West, business proprietor.');

  const [f6Query, setF6Query] = useState('builder delayed flat possession in monsoon, need temporary injunction');

  const [f7Order, setF7Order] = useState(
    'Heard learned counsel for the parties. Issue notice to respondent returnable in four weeks. Meanwhile, ad-interim relief in terms of prayer clause (c) is granted subject to the petitioner depositing Rs. 10 Lakh within 2 weeks in court registry. Stand over to 18 October 2026.'
  );

  const [f8Dispute, setF8Dispute] = useState(
    'Development agreement signed on 12 June 2025 with handover fixed for 30 November 2025. Defendant failed to deliver and sent notice of refusal on 15 December 2025.'
  );

  const [f10Vernacular, setF10Vernacular] = useState(
    'तक्रारदार यांनी दिलेल्या फिर्यादीवरून गुन्हा रजिस्टर नंबर २११/२०२६ कलम ४२०, ४०६ भा.दं.वि. अन्वये दाखल करण्यात आला. आरोपीने मालाचा पुरवठा केला नाही असा आरोप आहे. जप्ती पंचनामा करण्यात आला.'
  );

  const [f11Draft, setF11Draft] = useState(
    '1. Paragraph 1 is matter of record.\n2. The contents of paragraph 2 are denied in general. The Plaintiff is put to strict proof thereof.\n3. The Defendant denies that any breach occurred.'
  );

  const [f13Client, setF13Client] = useState('Rohan Sharma');
  const [f13Outcome, setF13Outcome] = useState('Interim bail protection granted; next date 18 October 2026');
  const [f13Lang, setF13Lang] = useState<'English' | 'Hindi' | 'Marathi'>('Hindi');

  const [f14Court, setF14Court] = useState('City Civil Court, Mumbai');
  const [f14Caveator, setF14Caveator] = useState('Aarohi Estates Pvt. Ltd.');
  const [f14Opponent, setF14Opponent] = useState('Suresh Patel');
  const [f14Subject, setF14Subject] = useState('Development rights of Plot 12, Andheri West');

  const runAgent = async () => {
    setLoading(true);
    setResult(null);
    try {
      let action = '';
      let payload: any = {};

      switch (selectedFeature) {
        case 1:
          action = 'devils-advocate';
          payload = { matterTitle: f1Title, court: f1Court, argumentsList: JSON.parse(f1Args) };
          break;
        case 2:
          action = 'citation-guard';
          payload = { draftText: f2Text };
          break;
        case 3:
          action = 'timeline-deposition';
          payload = {
            documents: [
              { title: 'Agreement', text: 'Agreement signed on 12 Jan 2025 for supply of goods.' },
              { title: 'FIR', text: 'FIR No. 211/2026 registered on 14 Feb 2026 alleging cheating.' },
              { title: 'Cooperation Memo', text: 'Applicant attended police station on 24 Feb 2026.' }
            ]
          };
          break;
        case 4:
          action = 'pleading-completer';
          payload = { paraNumber: 3, opponentAverment: f4Averment, stance: f4Stance, matterFacts: f4Facts };
          break;
        case 5:
          action = 'bail-drafter';
          payload = { firDetails: f5Fir, applicantDetails: f5Applicant };
          break;
        case 6:
          action = 'semantic-query';
          payload = { rawQuery: f6Query };
          break;
        case 7:
          action = 'order-digest';
          payload = { orderText: f7Order };
          break;
        case 8:
          action = 'limitation-classifier';
          payload = { disputeSummary: f8Dispute };
          break;
        case 9:
          action = 'court-rules-fixer';
          payload = { draftContent: 'APPLICATION FOR INJUNCTION\nPlaintiff seeks stay on construction.', courtName: 'Bombay High Court' };
          break;
        case 10:
          action = 'vernacular-summarizer';
          payload = { vernacularText: f10Vernacular };
          break;
        case 11:
          action = 'vulnerability-audit';
          payload = { draftPleading: f11Draft };
          break;
        case 12:
          action = 'ecourts-predictor';
          payload = {
            caseType: 'Commercial Suit',
            history: [
              { hearingDate: '2026-06-10', purpose: 'Appearance' },
              { hearingDate: '2026-08-12', purpose: 'Written Statement' },
              { hearingDate: '2026-09-18', purpose: 'Hearing on Injunction' }
            ]
          };
          break;
        case 13:
          action = 'client-briefing';
          payload = { clientName: f13Client, matterTitle: 'Sharma v. State', hearingOutcome: f13Outcome, language: f13Lang };
          break;
        case 14:
          action = 'interim-caveat';
          payload = { court: f14Court, caveator: f14Caveator, opponent: f14Opponent, subjectMatter: f14Subject, type: 'Caveat §148A' };
          break;
        case 15:
          action = 'witness-matrix';
          payload = {
            witnessStatements: [
              { witnessName: 'Complainant (Informant)', statement: 'Accused promised delivery in Mumbai on 14 Feb 2026 and took cash.' },
              { witnessName: 'Bank Officer', statement: 'Transactions were electronic wire transfers; no cash transactions recorded.' }
            ]
          };
          break;
      }

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, apiKey })
      });

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message || 'Execution error' });
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    if (!result) return;
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const FEATURES = [
    { id: 1, name: "Opposing Counsel Devil's Advocate", category: 'Litigation Strategy', icon: <Flame size={15} /> },
    { id: 2, name: 'Citation Hallucination Guard', category: 'Verification', icon: <Shield size={15} /> },
    { id: 3, name: 'Master Timeline & Deposition Qs', category: 'Trial Prep', icon: <Clock size={15} /> },
    { id: 4, name: 'Pleading Substance Completer', category: 'Drafting', icon: <FileText size={15} /> },
    { id: 5, name: 'FIR to Anticipatory Bail Drafter', category: 'Criminal Defense', icon: <Scale size={15} /> },
    { id: 6, name: 'Semantic Case-Law Query Rewriter', category: 'Research', icon: <Search size={15} /> },
    { id: 7, name: 'Dense Court Order Digest', category: 'Judicial Orders', icon: <Layers size={15} /> },
    { id: 8, name: 'Limitation Article Classifier', category: 'Statutory Math', icon: <Clock size={15} /> },
    { id: 9, name: 'Court Rules Auto-Fixer', category: 'Registry Compliance', icon: <Sparkles size={15} /> },
    { id: 10, name: 'Vernacular Doc Summarizer (Hindi/Marathi)', category: 'Translation', icon: <Building size={15} /> },
    { id: 11, name: 'Judicial Vulnerability Auditor (O.8 R.5 CPC)', category: 'Civil Procedure', icon: <AlertTriangle size={15} /> },
    { id: 12, name: 'eCourts Stage Predictor', category: 'Court Automation', icon: <Building size={15} /> },
    { id: 13, name: 'Client WhatsApp Briefing', category: 'Client Communication', icon: <MessageCircle size={15} /> },
    { id: 14, name: 'Urgent Interim Relief & Caveat Drafter', category: 'Urgent Filings', icon: <Scale size={15} /> },
    { id: 15, name: 'Cross-Witness Contradiction Matrix', category: 'Cross-Examination', icon: <Layers size={15} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & API Key Input */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
              Gemini 3.8 Flash Powered
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              OpenRouter Model: <code style={{ color: 'var(--primary)' }}>google/gemini-3.8-flash</code>
            </span>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.35rem' }}>
            AI Legal Intelligence Studio (15 Autonomous Agents)
          </h2>
        </div>

        {/* API Key configuration input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Key size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
            <input
              type="password"
              className="form-input"
              placeholder="OpenRouter API Key (Optional)..."
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '0.8rem' }}
            />
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        {/* Left: 15 Features Selector */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '800px', overflowY: 'auto' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Select AI Capability (15 Total)
          </span>

          {FEATURES.map((f) => {
            const isSelected = f.id === selectedFeature;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFeature(f.id);
                  setResult(null);
                }}
                style={{
                  background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                  border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.65rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  color: isSelected ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.id}. {f.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.category}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Interactive Workbench & Execution Result */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Agent Configuration Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-blue">Feature #{selectedFeature}</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.3rem' }}>
                  {FEATURES.find((f) => f.id === selectedFeature)?.name}
                </h3>
              </div>

              <button className="btn btn-primary" onClick={runAgent} disabled={loading}>
                <Sparkles size={16} />
                {loading ? 'Executing Gemini 3.8 Flash...' : 'Execute AI Agent'}
              </button>
            </div>

            {/* Dynamic Inputs based on selected feature */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              {selectedFeature === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <input className="form-input" placeholder="Matter Title" value={f1Title} onChange={(e) => setF1Title(e.target.value)} />
                    <input className="form-input" placeholder="Court" value={f1Court} onChange={(e) => setF1Court(e.target.value)} />
                  </div>
                  <textarea className="form-textarea" rows={4} value={f1Args} onChange={(e) => setF1Args(e.target.value)} />
                </div>
              )}

              {selectedFeature === 2 && (
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Draft text containing case citations to verify:</label>
                  <textarea className="form-textarea" rows={3} style={{ marginTop: '0.3rem' }} value={f2Text} onChange={(e) => setF2Text(e.target.value)} />
                </div>
              )}

              {selectedFeature === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <input className="form-input" value={f4Averment} onChange={(e) => setF4Averment(e.target.value)} placeholder="Opponent averment" />
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.5rem' }}>
                    <select className="form-select" value={f4Stance} onChange={(e) => setF4Stance(e.target.value)}>
                      <option value="admitted">Admitted</option>
                      <option value="denied">Denied</option>
                      <option value="partly">Partly Admitted</option>
                      <option value="legal">Legal submission</option>
                    </select>
                    <input className="form-input" value={f4Facts} onChange={(e) => setF4Facts(e.target.value)} placeholder="Matter facts" />
                  </div>
                </div>
              )}

              {selectedFeature === 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <textarea className="form-textarea" rows={2} value={f5Fir} onChange={(e) => setF5Fir(e.target.value)} placeholder="FIR Allegations" />
                  <input className="form-input" value={f5Applicant} onChange={(e) => setF5Applicant(e.target.value)} placeholder="Applicant bona fides" />
                </div>
              )}

              {selectedFeature === 6 && (
                <input className="form-input" value={f6Query} onChange={(e) => setF6Query(e.target.value)} placeholder="Colloquial search query" />
              )}

              {selectedFeature === 7 && (
                <textarea className="form-textarea" rows={4} value={f7Order} onChange={(e) => setF7Order(e.target.value)} placeholder="Court order text" />
              )}

              {selectedFeature === 8 && (
                <textarea className="form-textarea" rows={3} value={f8Dispute} onChange={(e) => setF8Dispute(e.target.value)} placeholder="Dispute summary" />
              )}

              {selectedFeature === 10 && (
                <textarea className="form-textarea" rows={3} value={f10Vernacular} onChange={(e) => setF10Vernacular(e.target.value)} placeholder="Hindi / Marathi text" />
              )}

              {selectedFeature === 11 && (
                <textarea className="form-textarea" rows={4} value={f11Draft} onChange={(e) => setF11Draft(e.target.value)} placeholder="Draft written statement" />
              )}

              {selectedFeature === 13 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0.5rem' }}>
                    <input className="form-input" value={f13Client} onChange={(e) => setF13Client(e.target.value)} placeholder="Client Name" />
                    <select className="form-select" value={f13Lang} onChange={(e) => setF13Lang(e.target.value as any)}>
                      <option value="Hindi">Hindi</option>
                      <option value="English">English</option>
                      <option value="Marathi">Marathi</option>
                    </select>
                  </div>
                  <input className="form-input" value={f13Outcome} onChange={(e) => setF13Outcome(e.target.value)} placeholder="Court Outcome" />
                </div>
              )}

              {selectedFeature === 14 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="form-input" value={f14Caveator} onChange={(e) => setF14Caveator(e.target.value)} placeholder="Caveator" />
                    <input className="form-input" value={f14Opponent} onChange={(e) => setF14Opponent(e.target.value)} placeholder="Opponent" />
                  </div>
                  <input className="form-input" value={f14Subject} onChange={(e) => setF14Subject(e.target.value)} placeholder="Subject matter" />
                </div>
              )}
            </div>
          </div>

          {/* AI Result Card */}
          <div className="card" style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Agent Response & Structured Intelligence
              </span>
              {result && (
                <button className="btn btn-secondary" onClick={copyResult} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {loading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-muted)' }}>
                <Sparkles size={28} className="spin" color="var(--primary)" />
                <p style={{ fontSize: '0.9rem' }}>Gemini 3.8 Flash reasoning across Indian law...</p>
              </div>
            )}

            {!loading && !result && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Click &ldquo;Execute AI Agent&rdquo; above to run this capability with Gemini 3.8 Flash.
              </div>
            )}

            {!loading && result && (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1.25rem',
                  fontFamily: typeof result === 'string' || result.petitioners ? 'inherit' : 'JetBrains Mono, monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  overflowY: 'auto',
                  maxHeight: '500px',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {typeof result === 'string'
                  ? result
                  : result.petitionDraft || result.draft || result.completedReply || result.briefing || JSON.stringify(result, null, 2)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
