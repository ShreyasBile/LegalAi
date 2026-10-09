'use client';

import React, { useState } from 'react';
import { RULES, GROUPS, computeLimitation, CalculationOutput } from '@/lib/limitation';
import { Calendar, Clock, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

export default function LimitationSection() {
  const [selectedGroup, setSelectedGroup] = useState<string>(GROUPS[0]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(RULES[0].id);
  const [startDate, setStartDate] = useState<string>('2026-08-01');
  const [excludeDays, setExcludeDays] = useState<number>(14);
  const [satClosure, setSatClosure] = useState<'none' | 'all' | 'alt'>('alt');
  const [vacationFrom, setVacationFrom] = useState<string>('');
  const [vacationTo, setVacationTo] = useState<string>('');
  const [vacationLabel, setVacationLabel] = useState<string>('');

  const filteredRules = RULES.filter((r) => r.group === selectedGroup);
  const activeRule = RULES.find((r) => r.id === selectedRuleId) || filteredRules[0] || RULES[0];

  const closures =
    vacationFrom && vacationTo
      ? [{ from: vacationFrom, to: vacationTo, label: vacationLabel || 'Court Vacation' }]
      : [];

  const calculation: CalculationOutput = computeLimitation({
    ruleId: activeRule.id,
    start: startDate,
    excludeDays,
    weekly: { saturday: satClosure },
    closures,
    today: '2026-09-11',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem' }}>
      {/* Parameter Selection Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>Statutory Limitation Engine</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Calculates filing deadlines under Limitation Act 1963, CPC, NI Act, and court rules.
          </p>
        </div>

        {/* Group Selector */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
          <select
            className="form-select"
            style={{ marginTop: '0.3rem' }}
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              const firstInGroup = RULES.find((r) => r.group === e.target.value);
              if (firstInGroup) setSelectedRuleId(firstInGroup.id);
            }}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Rule Selector */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Procedure / Limitation Period</label>
          <select
            className="form-select"
            style={{ marginTop: '0.3rem' }}
            value={selectedRuleId}
            onChange={(e) => setSelectedRuleId(e.target.value)}
          >
            {filteredRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Statute: <strong>{activeRule.source}</strong>
          </p>
        </div>

        {/* Trigger Date Input */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Trigger Event Date ({activeRule.trigger})
          </label>
          <input
            type="date"
            className="form-input"
            style={{ marginTop: '0.3rem' }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            *Day of event is excluded under Limitation Act s.12(1).
          </p>
        </div>

        {/* Certified Copy Exclusion */}
        {activeRule.copy && (
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Certified Copy Time Excluded (Days)
            </label>
            <input
              type="number"
              className="form-input"
              style={{ marginTop: '0.3rem' }}
              min={0}
              max={365}
              value={excludeDays}
              onChange={(e) => setExcludeDays(Number(e.target.value))}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '0.25rem' }}>
              ✓ Excluded under Section 12(2) for appeals and reviews.
            </p>
          </div>
        )}

        {/* Court Saturday Rules */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Court Saturday Closures</label>
          <select
            className="form-select"
            style={{ marginTop: '0.3rem' }}
            value={satClosure}
            onChange={(e) => setSatClosure(e.target.value as any)}
          >
            <option value="alt">2nd & 4th Saturdays closed (High Courts / District)</option>
            <option value="all">All Saturdays closed</option>
            <option value="none">Open Saturdays</option>
          </select>
        </div>

        {/* Court Vacation Closure */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Add Court Vacation / Closure Range
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.3rem' }}>
            <input
              type="date"
              className="form-input"
              placeholder="From"
              value={vacationFrom}
              onChange={(e) => setVacationFrom(e.target.value)}
            />
            <input
              type="date"
              className="form-input"
              placeholder="To"
              value={vacationTo}
              onChange={(e) => setVacationTo(e.target.value)}
            />
          </div>
          <input
            type="text"
            className="form-input"
            placeholder="Label (e.g. Diwali Vacation)"
            value={vacationLabel}
            onChange={(e) => setVacationLabel(e.target.value)}
            style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}
          />
        </div>
      </div>

      {/* Output & Statutory Steps Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {calculation.error ? (
          <div style={{ color: 'var(--accent-rose)', padding: '1rem', background: 'rgba(244, 63, 94, 0.1)', borderRadius: 'var(--radius-sm)' }}>
            {calculation.error}
          </div>
        ) : (
          <>
            {/* Primary Result Headline */}
            <div
              style={{
                background: calculation.rolled ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                border: calculation.rolled ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Final Calculated Deadline (Last Date to File)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginTop: '0.35rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {calculation.lastDate}
                </h1>
                {calculation.daysLeft !== null && calculation.daysLeft !== undefined && (
                  <span
                    className={`badge ${
                      calculation.daysLeft < 0 ? 'badge-rose' : calculation.daysLeft <= 7 ? 'badge-amber' : 'badge-emerald'
                    }`}
                  >
                    {calculation.daysLeft < 0
                      ? `Expired ${-calculation.daysLeft} days ago`
                      : `${calculation.daysLeft} days remaining`}
                  </span>
                )}
              </div>

              {calculation.rolled && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--accent-gold)' }}>
                  ⚠️ Rolled over to next court opening day because the natural last date was a closed holiday/Sunday.
                </p>
              )}
            </div>

            {/* Step-by-Step Legal Rationale */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} color="var(--primary)" />
                Statutory Calculation Steps
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(calculation.steps || []).map((step, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-secondary)',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                      borderLeft: '3px solid var(--primary)',
                    }}
                  >
                    <strong style={{ color: 'var(--text-primary)', marginRight: '0.4rem' }}>Step {i + 1}:</strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warnings or Section 5 Condonation */}
            {(calculation.warnings || []).length > 0 && (
              <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--accent-rose)', fontWeight: 600, fontSize: '0.9rem' }}>
                  <AlertTriangle size={16} />
                  <span>Statutory Notes & Delay Condonation Alert</span>
                </div>
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {calculation.warnings?.map((w, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      • {w}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
