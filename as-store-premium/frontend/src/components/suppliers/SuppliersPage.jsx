import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Tags, Search, AlertCircle, Check, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

export default function SuppliersPage({
  session,
  setGlobalToast,
  api,
  data = {},
  onBrandChange, // reused for reference changes notification
  Empty = ({ title }) => (
    <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
      {title || 'No records found'}
    </div>
  )
}) {
  const [internalSearch, setInternalSearch] = useState('');

  // Add/Edit Supplier Modal state
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null); // { id, name }
  const [supplierFormName, setSupplierFormName] = useState('');
  const [supplierFormActive, setSupplierFormActive] = useState(true);
  const [deletingSupplier, setDeletingSupplier] = useState(null); // { id, name }
  const [actionSaving, setActionSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [supplierFormError, setSupplierFormError] = useState(null);

  const searchVal = internalSearch;
  const isSuperAdmin = session?.role === 'superadmin' || session?.role === 'owner';
  const isShopkeeper = session?.role === 'shopkeeper' || session?.role === 'admin';
  const canManageSuppliers = isSuperAdmin || isShopkeeper;

  // Retrieve suppliers list from reference data
  const supplierList = React.useMemo(() => {
    const refs = data.reference?.suppliers || [];
    return refs
      .map((s) => ({
        id: s.id,
        rawName: s.name,
        name: s.name,
        is_active: s.is_active !== undefined ? Boolean(s.is_active) : true,
      }))
      .filter((s) => !searchVal || s.name.toLowerCase().includes(searchVal.toLowerCase()));
  }, [data.reference?.suppliers, searchVal]);

  // Add / Edit Supplier submission
  const handleSaveSupplier = async (e) => {
    if (e) e.preventDefault();
    const cleanName = supplierFormName.trim();
    if (!cleanName) {
      setSupplierFormError('Enter a valid supplier name');
      return;
    }
    setActionSaving(true);
    setSupplierFormError(null);
    try {
      if (editingSupplier) {
        const supplierId = editingSupplier.id;
        await api(`/reference-data/suppliers/${encodeURIComponent(supplierId)}`, {
          method: 'PUT',
          body: JSON.stringify({ name: cleanName, is_active: supplierFormActive }),
        });
        if (setGlobalToast) setGlobalToast(`Supplier renamed to "${cleanName}"`, 'success');
      } else {
        await api('/reference-data/suppliers', {
          method: 'POST',
          body: JSON.stringify({ name: cleanName }),
        });
        if (setGlobalToast) setGlobalToast(`Supplier "${cleanName}" created successfully`, 'success');
      }
      setShowAddSupplierModal(false);
      setEditingSupplier(null);
      setSupplierFormName('');
      if (onBrandChange) await onBrandChange();
    } catch (err) {
      setSupplierFormError(err.message || 'Unable to save supplier');
      if (setGlobalToast) setGlobalToast(err.message || 'Unable to save supplier', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // Toggle Active/Inactive status directly
  const handleToggleStatus = async (item, e) => {
    if (e) e.stopPropagation();
    if (!canManageSuppliers) {
      if (setGlobalToast) setGlobalToast('You do not have permission to update status', 'error');
      return;
    }
    const newStatus = !item.is_active;
    try {
      setActionSaving(true);
      await api(`/reference-data/suppliers/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: item.rawName, is_active: newStatus }),
      });
      if (setGlobalToast) setGlobalToast(`Supplier "${item.name}" set to ${newStatus ? 'Active' : 'Inactive'}`, 'success');
      if (onBrandChange) await onBrandChange();
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Unable to toggle status', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // Delete Supplier confirmation
  const handleConfirmDeleteSupplier = async () => {
    if (!deletingSupplier) return;
    setActionSaving(true);
    setModalError(null);
    try {
      const supplierId = deletingSupplier.id;
      await api(`/reference-data/suppliers/${encodeURIComponent(supplierId)}`, {
        method: 'DELETE',
      });
      if (setGlobalToast) setGlobalToast(`Supplier "${deletingSupplier.name}" removed successfully`, 'success');
      setDeletingSupplier(null);
      if (onBrandChange) await onBrandChange();
    } catch (err) {
      setModalError(err.message || 'Unable to delete supplier');
      if (setGlobalToast) setGlobalToast(err.message || 'Unable to delete supplier', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-teal-600">
            {isShopkeeper ? `${session?.shop_name || 'Branch'} Workspace` : 'Inventory Sourcing'}
          </span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">
            {isShopkeeper ? 'Branch Suppliers Registry' : 'Suppliers Registry'}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {isShopkeeper 
              ? 'Manage and maintain your branch-specific parts suppliers independently.' 
              : 'Manage global parts suppliers and trace which vendor supplied spare parts batches.'}
          </p>
        </div>
        {canManageSuppliers && (
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-xs border border-teal-200/60">
              {supplierList.length} Suppliers
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingSupplier(null);
                setSupplierFormName('');
                setSupplierFormActive(true);
                setSupplierFormError(null);
                setShowAddSupplierModal(true);
              }}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/25 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '580px' }}>
        <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#64748b', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search supplier name..."
          value={searchVal}
          onChange={(e) => setInternalSearch(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: '48px',
            paddingRight: searchVal ? '40px' : '20px',
            paddingTop: '13px',
            paddingBottom: '13px',
            backgroundColor: '#ffffff',
            border: '2px solid #cbd5e1',
            borderRadius: '20px',
            fontSize: '15px',
            fontWeight: '600',
            color: '#0f172a',
            outline: 'none',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.06)'
          }}
        />
        {searchVal && (
          <button
            type="button"
            onClick={() => setInternalSearch('')}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {supplierList.map((item) => (
          <motion.div
            key={item.id}
            whileHover={{ y: -4, scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={`p-5 rounded-3xl bg-white/95 border shadow-xl shadow-slate-200/40 backdrop-blur-xl flex flex-col justify-between cursor-pointer group transition-all relative overflow-hidden ${item.is_active ? 'border-slate-200/90 hover:border-teal-300' : 'border-rose-100 bg-rose-50/10 hover:border-rose-200'}`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-2xl border transition-all ${item.is_active ? 'bg-teal-50 border-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                  <Tags className="w-5 h-5" />
                </div>
                
                <div className="flex items-center gap-1.5">
                  {/* Status toggle button */}
                  <button
                    type="button"
                    title={item.is_active ? 'Set Inactive' : 'Set Active'}
                    onClick={(e) => handleToggleStatus(item, e)}
                    disabled={!canManageSuppliers}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${item.is_active ? 'bg-slate-100 hover:bg-rose-50 text-emerald-600 hover:text-rose-600 border-slate-200 hover:border-rose-200' : 'bg-rose-50 hover:bg-emerald-50 text-rose-600 hover:text-emerald-600 border-rose-200 hover:border-emerald-200'}`}
                  >
                    {item.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>

                  {canManageSuppliers && (
                    <>
                      <button
                        type="button"
                        title={`Rename supplier ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSupplier(item);
                          setSupplierFormName(item.rawName || item.name);
                          setSupplierFormActive(item.is_active);
                          setSupplierFormError(null);
                          setShowAddSupplierModal(true);
                        }}
                        className="p-2 rounded-xl bg-slate-100/80 hover:bg-teal-50 text-slate-500 hover:text-teal-600 border border-slate-200/60 hover:border-teal-200 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title={`Delete supplier ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingSupplier(item);
                          setModalError(null);
                        }}
                        className="p-2 rounded-xl bg-slate-100/80 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <h3 className={`text-lg font-black ${item.is_active ? 'text-slate-900 group-hover:text-teal-700' : 'text-slate-600'} transition-all`}>{item.name}</h3>
                {!item.is_active && (
                  <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {supplierList.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white/80 border border-slate-200/80 rounded-3xl">
            <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No suppliers found</p>
            <p className="text-xs text-slate-400 mt-1">Click "+ Add Supplier" above to register a new spares parts or catalog supplier.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      <AnimatePresence>
        {showAddSupplierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-teal-100 text-teal-700 border border-teal-200">
                    <Tags className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {editingSupplier ? 'Rename or adjust settings for this supplier.' : 'Register a new spares parts supplier.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSupplierModal(false);
                    setEditingSupplier(null);
                    setSupplierFormName('');
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
                {supplierFormError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{supplierFormError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Chinese Supplier ABC, Delhi Wholesale..."
                    value={supplierFormName}
                    onChange={(e) => setSupplierFormName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 text-sm font-bold text-slate-900 outline-none transition-all"
                  />
                  <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                    This will appear in the stock updating panel to tag supplier source.
                  </p>
                </div>

                {editingSupplier && (
                  <div className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      id="supplier-active-chk"
                      checked={supplierFormActive}
                      onChange={(e) => setSupplierFormActive(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
                    />
                    <label htmlFor="supplier-active-chk" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Mark as Active Supplier
                    </label>
                  </div>
                )}

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddSupplierModal(false);
                      setEditingSupplier(null);
                      setSupplierFormName('');
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionSaving || !supplierFormName.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {actionSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Supplier Confirmation Modal */}
      <AnimatePresence>
        {deletingSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-3xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto shadow-inner">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Delete Supplier "{deletingSupplier.name}"?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
                    This supplier will be permanently deleted if it is not in use. If it is linked to any stock records, the delete will be blocked and you should mark it inactive instead.
                  </p>
                </div>

                {modalError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold text-left flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="pt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDeletingSupplier(null)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionSaving}
                    onClick={handleConfirmDeleteSupplier}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {actionSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" /> Delete Supplier
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
