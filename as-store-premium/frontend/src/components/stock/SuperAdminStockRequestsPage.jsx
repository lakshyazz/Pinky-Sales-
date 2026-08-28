import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Search, 
  Filter, 
  Boxes, 
  Package, 
  Building2, 
  Calendar, 
  User, 
  Check, 
  X, 
  Eye, 
  Send, 
  Truck, 
  ChevronRight,
  RefreshCw,
  TrendingUp,
  FileCheck
} from 'lucide-react';

export default function SuperAdminStockRequestsPage({
  authedFetch,
  showToast,
  shops = [],
  data = {},
  onRefresh,
}) {
  const [requests, setRequests] = useState(Array.isArray(data.requests) ? data.requests : []);
  const [loading, setLoading] = useState(!Array.isArray(data.requests) || data.requests.length === 0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'completed' | 'rejected'
  const [shopFilter, setShopFilter] = useState('all');

  // Active Review Modal State
  const [activeRequest, setActiveRequest] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await authedFetch('/stock-requests');
      const loaded = Array.isArray(res) ? res : [];
      setRequests(loaded);
      if (typeof onRefresh === 'function') {
        onRefresh(loaded);
      }
    } catch (error) {
      showToast(error.message || 'Unable to load stock requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (Array.isArray(data.requests) && data.requests.length > 0 && requests.length === 0) {
      setRequests(data.requests);
      setLoading(false);
    }
  }, [data.requests]);

  // Filtered Requisitions
  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((req) => {
      const status = String(req.status || '').toLowerCase().trim();
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !['pending', 'open'].includes(status)) return false;
        if (statusFilter === 'completed' && !['completed', 'approved', 'dispatched'].includes(status)) return false;
        if (statusFilter === 'rejected' && status !== 'rejected') return false;
      }

      if (shopFilter !== 'all' && String(req.shop_id) !== String(shopFilter)) {
        return false;
      }

      if (!q) return true;

      const reqNum = (req.request_number || `REQ-${req.id}`).toLowerCase();
      const shopName = (req.shop_name || '').toLowerCase();
      const creator = (req.created_by_name || '').toLowerCase();
      const itemNames = (req.items || []).map((i) => (i.product_name || '').toLowerCase()).join(' ');

      return reqNum.includes(q) || shopName.includes(q) || creator.includes(q) || itemNames.includes(q);
    });
  }, [requests, search, statusFilter, shopFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const pending = requests.filter((r) => ['pending', 'open'].includes(String(r.status || '').toLowerCase().trim()));
    const completed = requests.filter((r) => ['completed', 'approved', 'dispatched'].includes(String(r.status || '').toLowerCase().trim()));
    const rejected = requests.filter((r) => String(r.status || '').toLowerCase().trim() === 'rejected');
    const totalUnitsRequested = requests.reduce((sum, r) => sum + Number(r.total_quantity || r.quantity || 0), 0);

    return {
      pendingCount: pending.length,
      completedCount: completed.length,
      rejectedCount: rejected.length,
      totalUnitsRequested,
    };
  }, [requests]);

  // Approve Requisition Handler
  const handleApproveRequest = async (request) => {
    try {
      setIsApproving(true);
      const res = await authedFetch(`/admin/stock-requests/${request.id}/approve`, {
        method: 'PUT',
      });
      showToast(res.message || 'Stock requisition approved and transferred to branch!');
      setActiveRequest(null);
      await loadRequests();
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (error) {
      showToast(error.message || 'Unable to approve stock requisition');
    } finally {
      setIsApproving(false);
    }
  };

  // Reject Requisition Handler
  const handleRejectRequest = async () => {
    if (!activeRequest) return;
    try {
      setIsRejecting(true);
      const res = await authedFetch(`/admin/stock-requests/${activeRequest.id}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      showToast(res.message || 'Stock requisition marked as rejected');
      setRejectionModalOpen(false);
      setRejectionReason('');
      setActiveRequest(null);
      await loadRequests();
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (error) {
      showToast(error.message || 'Unable to reject requisition');
    } finally {
      setIsRejecting(false);
    }
  };

  const getStatusBadge = (rawStatus) => {
    const status = String(rawStatus || '').toLowerCase().trim();
    switch (status) {
      case 'completed':
      case 'approved':
      case 'dispatched':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={14} className="text-emerald-600" />
            Approved & Dispatched
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={14} className="text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
            <Clock size={14} className="text-amber-600" />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-teal-50 text-teal-700 text-xs font-black border border-teal-200 mb-1.5">
            <Boxes size={14} />
            Central Warehouse Fulfillment Hub
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Branch Stock Requisitions
          </h1>
          <p className="text-xs text-slate-500">
            Review, allocate, and dispatch stock orders requested by branch managers in real time.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRequests}
          className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-50 shadow-xs cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh List
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-amber-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 block">
              Pending Requisitions
            </span>
            <span className="text-2xl font-black text-slate-900">{metrics.pendingCount}</span>
            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Requires approval</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white border border-emerald-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 block">
              Fulfilled Orders
            </span>
            <span className="text-2xl font-black text-slate-900">{metrics.completedCount}</span>
            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Transferred to branches</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Truck size={24} />
          </div>
        </div>

        <div className="bg-white border border-rose-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 block">
              Rejected Requests
            </span>
            <span className="text-2xl font-black text-slate-900">{metrics.rejectedCount}</span>
            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Declined or closed</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle size={24} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
              Total Units Requested
            </span>
            <span className="text-2xl font-black text-slate-900">{metrics.totalUnitsRequested} pcs</span>
            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Across all branches</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-700 flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'pending', label: `Pending (${metrics.pendingCount})` },
            { id: 'completed', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Branch Select */}
        <div className="flex flex-wrap items-center gap-3 flex-1 justify-end min-w-[300px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search request #, branch, product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:border-teal-500 focus:outline-hidden bg-slate-50/50"
            />
          </div>

          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white focus:border-teal-500 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Branches</option>
            {shops
              .filter((s) => s.location_type !== 'warehouse')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Package size={44} className="mx-auto text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">No Stock Requisitions Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              There are currently no branch requisitions matching the selected status or filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-5">Requisition #</th>
                  <th className="py-3.5 px-4">Branch</th>
                  <th className="py-3.5 px-4">Requested By</th>
                  <th className="py-3.5 px-4">Items Breakdown</th>
                  <th className="py-3.5 px-4">Total Units</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const isPending = ['pending', 'open'].includes(req.status);
                  const itemsCount = req.total_items || (req.items?.length || 1);
                  const totalUnits = req.total_quantity || req.quantity || 1;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-5 font-mono font-black text-indigo-700">
                        {req.request_number || `REQ-${req.id}`}
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={14} className="text-slate-400" />
                          <span>{req.shop_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-600 font-medium">
                        {req.created_by_name || 'Branch Staff'}
                      </td>
                      <td className="py-4 px-4">
                        {req.items && req.items.length > 0 ? (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800">
                              {req.items[0]?.product_short_name || req.items[0]?.product_name}
                              {req.items.length > 1 && ` + ${req.items.length - 1} more`}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-medium">
                              {itemsCount} line items
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-700 font-bold">{req.model_name || 'Standard Product'}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-black text-slate-900">
                        {totalUnits} pcs
                      </td>
                      <td className="py-4 px-4 text-slate-500">
                        {new Date(req.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(req.status)}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveRequest(req)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                        >
                          <Eye size={13} />
                          {isPending ? 'Review & Dispatch' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Fulfillment Modal */}
      {activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={() => setActiveRequest(null)} />
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200">
                    {activeRequest.request_number || `REQ-${activeRequest.id}`}
                  </span>
                  {getStatusBadge(activeRequest.status)}
                </div>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Requisition Order from {activeRequest.shop_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveRequest(null)}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Order Meta Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/70 text-xs">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Requesting Shop</span>
                  <span className="font-bold text-slate-900">{activeRequest.shop_name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Requested By</span>
                  <span className="font-bold text-slate-900">{activeRequest.created_by_name || 'Branch Staff'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Request Date</span>
                  <span className="font-bold text-slate-900">
                    {new Date(activeRequest.created_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Total Volume</span>
                  <span className="font-black text-slate-900">
                    {activeRequest.total_quantity || activeRequest.quantity || 1} pcs
                  </span>
                </div>
              </div>

              {/* Notes */}
              {activeRequest.notes && (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-0.5">
                  <span className="font-black uppercase text-[10px] tracking-wider block">Branch Notes:</span>
                  <p>{activeRequest.notes}</p>
                </div>
              )}

              {/* Line Items & Live Warehouse Inventory Verification */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block">
                  Requested Items & Warehouse Stock Verification
                </span>

                <div className="space-y-3">
                  {(activeRequest.items || []).map((item, idx) => {
                    let colors = [];
                    try {
                      colors = typeof item.color_breakdown === 'string' ? JSON.parse(item.color_breakdown) : (item.color_breakdown || []);
                    } catch {}

                    const whAvailable = Number(item.warehouse_stock || 0);
                    const requested = Number(item.requested_qty || 1);
                    const isSufficient = whAvailable >= requested;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all space-y-3 ${
                          isSufficient ? 'bg-white border-slate-200/90' : 'bg-rose-50/30 border-rose-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-black text-slate-900">
                              {item.product_short_name || item.product_name}
                            </h4>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {item.brand && <span>Brand: {item.brand} • </span>}
                              {item.quality_grade && <span>Variant: {item.quality_grade}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                                Requested
                              </span>
                              <span className="text-sm font-black text-slate-900">{requested} pcs</span>
                            </div>

                            <div className="text-right pl-3 border-l border-slate-200">
                              <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                                Warehouse Live Stock
                              </span>
                              <span className={`text-sm font-black ${isSufficient ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {whAvailable} pcs
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Color Variant Breakdown Tags */}
                        {colors.length > 0 && (
                          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">
                              Color Breakdown:
                            </span>
                            {colors.map((c, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs"
                              >
                                {c.color}: <strong className="text-teal-700">{c.qty}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer / Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                {activeRequest.status === 'completed' && (
                  <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={15} />
                    Stock was transferred to {activeRequest.shop_name} on{' '}
                    {activeRequest.approved_at ? new Date(activeRequest.approved_at).toLocaleDateString('en-IN') : 'Approval'}
                  </span>
                )}
                {activeRequest.status === 'rejected' && (
                  <span className="text-xs text-rose-700 font-bold flex items-center gap-1.5">
                    <XCircle size={15} />
                    This order was rejected. Reason: {activeRequest.rejection_reason || 'Declined by Admin'}
                  </span>
                )}
              </div>

              {['pending', 'open'].includes(activeRequest.status) && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRejectionModalOpen(true)}
                    className="px-4 py-2.5 rounded-2xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs cursor-pointer transition-all"
                  >
                    Reject Requisition
                  </button>

                  <button
                    type="button"
                    disabled={isApproving}
                    onClick={() => handleApproveRequest(activeRequest)}
                    className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-teal-600/20 disabled:opacity-50 transition-all"
                  >
                    <Check size={16} />
                    {isApproving ? 'Transferring Stock...' : 'Approve & Dispatch Stock'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectionModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setRejectionModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl z-10 space-y-4">
            <h3 className="text-base font-black text-slate-900">Decline Requisition</h3>
            <p className="text-xs text-slate-500">
              Please enter the reason for rejecting this stock request. The branch manager will see this explanation.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Stock reserved for upcoming flagship branch opening..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:border-rose-500 focus:outline-hidden bg-slate-50"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectionModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleRejectRequest}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
