import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, RefreshCw, Download, AlertCircle, TrendingUp, Users, Truck } from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const BUCKETS = [
  { key: 'current_bucket', label: 'Not Yet Due', color: '#16a34a', bg: '#dcfce7', desc: 'Current' },
  { key: 'd1_30',          label: '1–30 Days',   color: '#ca8a04', bg: '#fef9c3', desc: '1-30' },
  { key: 'd31_60',         label: '31–60 Days',  color: '#ea580c', bg: '#ffedd5', desc: '31-60' },
  { key: 'd61_90',         label: '61–90 Days',  color: '#dc2626', bg: '#fee2e2', desc: '61-90' },
  { key: 'd90_plus',       label: '90+ Days',    color: '#7c3aed', bg: '#ede9fe', desc: '90+' },
  { key: 'total_outstanding', label: 'Total',   color: '#0f172a', bg: '#f1f5f9', desc: 'Total' },
];

function BucketBar({ row, max }) {
  const pct = max > 0 ? (money(row.total_outstanding) / max) * 100 : 0;
  return (
    <div style={{ height: 4, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: '#6366f1', borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export default function AgingReport({ session, api, setGlobalToast }) {
  const [mode, setMode] = useState('ar'); // 'ar' | 'ap'
  const [asOfDate, setAsOfDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('total_outstanding');
  const [sortDir, setSortDir] = useState('desc');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'ar' ? '/reports/ar-aging' : '/reports/ap-aging';
      const data = await api(`${endpoint}?as_of=${asOfDate}`);
      setReport(data);
    } catch (e) {
      setError(e.message || 'Failed to load aging report.');
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load aging report' });
    } finally {
      setLoading(false);
    }
  }, [mode, asOfDate, api]);

  useEffect(() => { fetchReport(); }, [mode]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedRows = report?.rows ? [...report.rows].sort((a, b) => {
    const va = money(a[sortKey]); const vb = money(b[sortKey]);
    const nameA = a.customer_name || a.supplier_name || '';
    const nameB = b.customer_name || b.supplier_name || '';
    if (sortKey === 'name') return sortDir === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    return sortDir === 'asc' ? va - vb : vb - va;
  }) : [];

  const maxTotal = sortedRows.reduce((m, r) => Math.max(m, money(r.total_outstanding)), 0);

  const handleExportCSV = () => {
    if (!sortedRows.length) return;
    const nameKey = mode === 'ar' ? 'customer_name' : 'supplier_name';
    const header = 'Name,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total\n';
    const rows = sortedRows.map(r =>
      [`"${r[nameKey]}"`, r.current_bucket, r.d1_30, r.d31_60, r.d61_90, r.d90_plus, r.total_outstanding].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${mode}_aging_${asOfDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const SortIcon = ({ k }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 12px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg,#ea580c,#dc2626)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}>
          <Clock size={18} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>
            {mode === 'ar' ? 'Accounts Receivable' : 'Accounts Payable'} Aging
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Overdue analysis by aging buckets</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
        padding: '16px 20px', marginBottom: 20, boxShadow: '0 2px 12px rgba(15,23,42,0.06)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Report Type</label>
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
              {[['ar', <Users size={13}/>, 'Receivables (AR)'], ['ap', <Truck size={13}/>, 'Payables (AP)']].map(([m, ic, lbl]) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: mode === m ? (m === 'ar' ? '#6366f1' : '#ea580c') : 'transparent',
                    color: mode === m ? '#fff' : '#475569', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                  }}>
                  {ic}{lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>As Of Date</label>
            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }} />
          </div>
          <button onClick={fetchReport} disabled={loading}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: mode === 'ar' ? '#6366f1' : '#ea580c', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {sortedRows.length > 0 && (
            <button onClick={handleExportCSV}
              style={{
                padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer'
              }}>
              <Download size={14} /> CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Summary Buckets */}
      {report?.summary && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
          {BUCKETS.map(b => (
            <div key={b.key} style={{
              background: '#fff', borderRadius: 14, border: `1.5px solid ${b.color}22`,
              padding: '14px 16px', boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
              borderLeft: `4px solid ${b.color}`
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{b.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: b.color, letterSpacing: -0.5 }}>
                {currency(report.summary[b.key] || 0)}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Table */}
      {sortedRows.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th onClick={() => handleSort('name')} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {mode === 'ar' ? 'Customer' : 'Vendor'}<SortIcon k="name" />
                  </th>
                  {BUCKETS.slice(0, -1).map(b => (
                    <th key={b.key} onClick={() => handleSort(b.key)}
                      style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: b.color, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {b.desc}<SortIcon k={b.key} />
                    </th>
                  ))}
                  <th onClick={() => handleSort('total_outstanding')}
                    style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Total<SortIcon k="total_outstanding" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => {
                  const name = row.customer_name || row.supplier_name || '—';
                  const sub = row.mobile || '';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{name}</div>
                        {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
                        <div style={{ marginTop: 4 }}><BucketBar row={row} max={maxTotal} /></div>
                      </td>
                      {BUCKETS.slice(0, -1).map(b => (
                        <td key={b.key} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: money(row[b.key]) > 0 ? 700 : 400, color: money(row[b.key]) > 0 ? b.color : '#94a3b8' }}>
                          {money(row[b.key]) > 0 ? currency(row[b.key]) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
                        {currency(row.total_outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {report.summary && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a' }}>TOTALS ({sortedRows.length})</td>
                    {BUCKETS.slice(0, -1).map(b => (
                      <td key={b.key} style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: b.color, fontSize: 13 }}>
                        {money(report.summary[b.key]) > 0 ? currency(report.summary[b.key]) : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: 15 }}>
                      {currency(report.summary.total || 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </motion.div>
      ) : !loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <TrendingUp size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>No outstanding balances found.</div>
        </div>
      ) : null}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
