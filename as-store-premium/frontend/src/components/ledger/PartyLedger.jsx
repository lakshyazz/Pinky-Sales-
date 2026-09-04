import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, ChevronDown, ChevronUp, Download, X, Calendar,
  TrendingUp, TrendingDown, Minus, RefreshCw, User, FileText,
  AlertCircle, ArrowUpRight, ArrowDownRight, ChevronsRight
} from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const fmt = (v) => money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currency = (v) => `₹${fmt(v)}`;

const today = () => new Date().toISOString().slice(0, 10);
const formatDMY = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d;
};

const TYPE_STYLES = {
  opening_balance: { label: 'Opening', color: '#6366f1', bg: '#eef2ff' },
  sale:            { label: 'Invoice',  color: '#0284c7', bg: '#e0f2fe' },
  payment:         { label: 'Payment',  color: '#16a34a', bg: '#dcfce7' },
  reversal:        { label: 'Reversal', color: '#b91c1c', bg: '#fee2e2' },
  credit_note:     { label: 'Cr. Note', color: '#dc2626', bg: '#fee2e2' },
  purchase_bill:   { label: 'Bill',     color: '#9333ea', bg: '#f3e8ff' },
  bill_payment:    { label: 'Payment',  color: '#16a34a', bg: '#dcfce7' },
  debit_note:      { label: 'Dr. Note', color: '#ea580c', bg: '#ffedd5' },
};

function TypeBadge({ type }) {
  const s = TYPE_STYLES[type] || { label: type, color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {s.label}
    </span>
  );
}

export default function PartyLedger({ session, api, setGlobalToast, customers = [], suppliers = [] }) {
  const [mode, setMode] = useState('customer'); // 'customer' | 'vendor'
  const [selectedId, setSelectedId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today());
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const partyList = mode === 'customer' ? customers : suppliers;

  const fetchLedger = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'customer'
        ? `/ledger/customer/${selectedId}`
        : `/ledger/vendor/${selectedId}`;
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const data = await api(`${endpoint}?${params}`);
      setLedger(data);
    } catch (e) {
      setError(e.message || 'Failed to load ledger.');
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load ledger' });
    } finally {
      setLoading(false);
    }
  }, [selectedId, mode, fromDate, toDate, api]);

  useEffect(() => {
    if (selectedId) fetchLedger();
    else setLedger(null);
  }, [selectedId, mode]);

  const handleExportCSV = () => {
    if (!ledger?.rows?.length) return;
    const partyName = ledger.customer?.name || ledger.supplier?.name || 'party';
    const header = 'Date,Ref No,Type,Description,Debit,Credit,Balance\n';
    const rows = ledger.rows.map(r =>
      [formatDMY(r.entry_date), r.ref_no, r.entry_type, `"${r.description}"`, r.debit, r.credit, r.running_balance].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `ledger_${partyName.replace(/\s+/g, '_')}_${today()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!ledger?.rows?.length) return;
    try {
      const { generateLedgerPDFDoc } = await import('../../utils/pdfAndShareService.js');
      const partyName = ledger.customer?.name || ledger.supplier?.name || 'party';
      const doc = await generateLedgerPDFDoc(ledger);
      doc.save(`ledger_${partyName.replace(/\s+/g, '_')}_${today()}.pdf`);
    } catch (err) {
      setGlobalToast && setGlobalToast({ type: 'error', message: 'Failed to generate PDF: ' + (err.message || 'Unknown error') });
    }
  };

  const totalDebit  = ledger?.rows?.reduce((s, r) => s + money(r.debit), 0) || 0;
  const totalCredit = ledger?.rows?.reduce((s, r) => s + money(r.credit), 0) || 0;
  const closingBal  = ledger?.closing_balance || 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
        }}>
          <BookOpen size={18} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>Party Ledger</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Customer & Vendor running balance statement</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 2px 12px rgba(15,23,42,0.06)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          {/* Mode toggle */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Party Type</label>
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
              {['customer', 'vendor'].map(m => (
                <button key={m} onClick={() => { setMode(m); setSelectedId(''); setLedger(null); }}
                  style={{
                    padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: mode === m ? '#6366f1' : 'transparent',
                    color: mode === m ? '#fff' : '#475569',
                    transition: 'all 0.2s'
                  }}>
                  {m === 'customer' ? 'Customer' : 'Vendor'}
                </button>
              ))}
            </div>
          </div>

          {/* Party selector */}
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {mode === 'customer' ? 'Customer' : 'Vendor'}
            </label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                fontSize: 13, fontWeight: 600, background: '#f8fafc', cursor: 'pointer', color: '#0f172a'
              }}>
              <option value="">— Select {mode === 'customer' ? 'customer' : 'vendor'} —</option>
              {partyList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }} />
          </div>

          <button onClick={fetchLedger} disabled={!selectedId || loading}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: selectedId ? 'pointer' : 'not-allowed',
              background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 7, opacity: selectedId ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(99,102,241,0.35)'
            }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Load'}
          </button>

          {ledger?.rows?.length > 0 && (
            <>
              <button onClick={handleExportCSV}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer'
                }}>
                <Download size={14} /> CSV
              </button>
              <button onClick={handleExportPDF}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#6366f1', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer'
                }}>
                <FileText size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Summary cards */}
      {ledger && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Debit (Dr)', value: totalDebit, icon: <ArrowUpRight size={16} />, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Total Credit (Cr)', value: totalCredit, icon: <ArrowDownRight size={16} />, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Closing Balance', value: closingBal, icon: <ChevronsRight size={16} />, color: closingBal > 0 ? '#b45309' : '#16a34a', bg: closingBal > 0 ? '#fef3c7' : '#dcfce7' },
            ...(Number(ledger.advance_balance || 0) > 0 ? [{ label: 'Advance Credit', value: Number(ledger.advance_balance), icon: <TrendingDown size={16} />, color: '#2563eb', bg: '#eff6ff' }] : []),
            { label: 'Transactions', value: ledger.rows?.length || 0, icon: <FileText size={16} />, color: '#6366f1', bg: '#eef2ff', isCnt: true },
          ].map(c => (
            <div key={c.label} style={{
              background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
              padding: '14px 18px', boxShadow: '0 2px 8px rgba(15,23,42,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</span>
                <span style={{ color: c.color, background: c.bg, borderRadius: 8, padding: '3px 6px', display: 'flex' }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: c.isCnt ? 22 : 18, fontWeight: 800, color: c.color, letterSpacing: -0.5 }}>
                {c.isCnt ? c.value : currency(c.value)}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Ledger table */}
      {ledger?.rows?.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          {/* Party header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={16} color="#6366f1" />
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              {ledger.customer?.name || ledger.supplier?.name}
            </strong>
            {ledger.customer?.mobile && <span style={{ fontSize: 12, color: '#64748b' }}>· {ledger.customer.mobile}</span>}
            {(fromDate || toDate) && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} />
                {fromDate ? formatDMY(fromDate) : 'Beginning'} — {formatDMY(toDate)}
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date', 'Ref No', 'Type', 'Description', 'Debit (Dr)', 'Credit (Cr)', 'Balance'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Debit (Dr)' || h === 'Credit (Cr)' || h === 'Balance' ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((row, i) => {
                  const descParts = String(row.description || '').split(' → ');
                  const mainDesc = descParts[0];
                  const breakdown = row.allocation_breakdown || (descParts.length > 1 ? descParts[1].replace(' [REVERSED]', '') : null);

                  return (
                    <tr key={i} style={{ 
                      borderBottom: '1px solid #f1f5f9', 
                      background: row.entry_type === 'reversal' ? '#fffbeb' : '#fff',
                      transition: 'background 0.15s' 
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = row.entry_type === 'reversal' ? '#fef3c7' : '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = row.entry_type === 'reversal' ? '#fffbeb' : '#fff'}>
                      <td style={{ padding: '10px 14px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDMY(row.entry_date)}</td>
                      <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{row.ref_no}</td>
                      <td style={{ padding: '10px 14px' }}><TypeBadge type={row.entry_type} /></td>
                      <td style={{ padding: '10px 14px', color: '#334155', maxWidth: 320 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{
                            textDecoration: row.reversed ? 'line-through' : 'none',
                            color: row.reversed ? '#94a3b8' : '#0f172a',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap'
                          }}>
                            <span>{mainDesc}</span>
                            {row.reversed && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fee2e2',
                                border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: 4, textDecoration: 'none'
                              }}>
                                REVERSED
                              </span>
                            )}
                          </div>
                          {breakdown && (
                            <div style={{
                              fontSize: 11, color: '#4338ca', background: '#eef2ff',
                              borderRadius: 6, padding: '3px 8px', border: '1px solid #c7d2fe',
                              width: 'fit-content', lineHeight: 1.3
                            }}>
                              ↳ {breakdown}
                            </div>
                          )}
                        </div>
                      </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: money(row.debit) > 0 ? '#dc2626' : '#94a3b8', fontWeight: 700 }}>
                      {money(row.debit) > 0 ? currency(row.debit) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: money(row.credit) > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                      {money(row.credit) > 0 ? currency(row.credit) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: money(row.running_balance) > 0 ? '#b45309' : money(row.running_balance) < 0 ? '#16a34a' : '#64748b', whiteSpace: 'nowrap' }}>
                      {currency(Math.abs(money(row.running_balance)))}
                      <span style={{ fontSize: 10, marginLeft: 3, color: '#94a3b8' }}>
                        {money(row.running_balance) > 0 ? 'Dr' : money(row.running_balance) < 0 ? 'Cr' : ''}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a', fontSize: 13 }}>TOTALS</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 14 }}>{currency(totalDebit)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: 14 }}>{currency(totalCredit)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: closingBal > 0 ? '#b45309' : '#16a34a' }}>
                    {currency(Math.abs(closingBal))} <span style={{ fontSize: 11 }}>{closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      ) : selectedId && !loading && !error ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700 }}>No transactions found for this period.</div>
        </div>
      ) : !selectedId ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <User size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700 }}>Select a {mode === 'customer' ? 'customer' : 'vendor'} to view their ledger.</div>
        </div>
      ) : null}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6366f1', fontSize: 14 }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>Loading ledger…</div>
        </div>
      )}
    </div>
  );
}
