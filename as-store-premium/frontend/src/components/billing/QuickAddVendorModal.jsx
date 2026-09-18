import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, X, Check, Loader2, AlertCircle } from 'lucide-react';

export default function QuickAddVendorModal({
  isOpen,
  onClose,
  onVendorCreated,
  api,
  setGlobalToast,
}) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter vendor name.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await api('/reference-data/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          mobile: mobile.trim() || undefined,
          gstin: gstin.trim() || undefined,
          address: address.trim() || undefined,
          opening_balance: openingBalance ? parseFloat(openingBalance) : 0,
        }),
      });

      setGlobalToast?.({
        type: 'success',
        message: `Vendor "${res.name}" created successfully!`,
      });

      onVendorCreated && onVendorCreated(res);
      onClose();
    } catch (err) {
      console.error('Failed to create vendor:', err);
      setError(err.message || 'Failed to create vendor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.14 }}
          className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                <Building2 size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Add New Vendor</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">Create supplier profile directly on the bill</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-medium text-xs">
                <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                Vendor / Supplier Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navkar Enterprises, Prime Electronics"
                autoFocus
                required
                className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                  Mobile / Phone
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                  GSTIN (Optional)
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="24AAAAA0000A1Z5"
                  className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                Address / City
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Surat, Gujarat"
                className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                Opening Balance (₹) (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
              />
            </div>

            {/* Footer */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-xl transition-all shadow-md shadow-violet-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Create &amp; Select</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

