import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, AlertCircle, Loader2, Tags, Layers, Truck, Sparkles } from 'lucide-react';

const CONFIG = {
  brand: {
    title: 'Add New Brand',
    subtitle: 'Register a phone brand for products and catalog models',
    label: 'Brand Name',
    placeholder: 'e.g. Google, Nothing, Motorola, OnePlus',
    icon: Tags,
    badgeText: 'Brand',
    helperText: 'This brand will be immediately selectable in the Brand dropdown.',
    buttonText: 'Add Brand',
  },
  'manufacturing-brand': {
    title: 'Add Manufacturing Brand',
    subtitle: 'Register a screen / part maker or OEM manufacturer',
    label: 'Manufacturing Brand Name',
    placeholder: 'e.g. Foxconn, RJ, GX, JK, OLED-PRO',
    icon: Layers,
    badgeText: 'Mfg Brand',
    helperText: 'Used to track screen and display part manufacturers across stock.',
    buttonText: 'Add Mfg Brand',
  },
  supplier: {
    title: 'Add New Supplier',
    subtitle: 'Register a wholesale vendor or inventory supplier',
    label: 'Supplier Name',
    placeholder: 'e.g. Star Parts Delhi, Supreme Spares, RK Electronics',
    icon: Truck,
    badgeText: 'Supplier',
    helperText: 'Supplier will be linked to inventory additions and purchase records.',
    buttonText: 'Add Supplier',
  },
};

export default function QuickAddReferenceModal({
  isOpen,
  onClose,
  type = 'brand',
  existingItems = [],
  onSave,
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const currentConfig = CONFIG[type] || CONFIG.brand;
  const IconComponent = currentConfig.icon;

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Focus management without triggering scroll jump
  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
      setSaving(false);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanName = name.trim();

    if (!cleanName) {
      setError(`Please enter a valid ${currentConfig.label.toLowerCase()}`);
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      return;
    }

    // Duplicate check against existing items
    const isDuplicate = existingItems.some((item) => {
      const existingName = typeof item === 'string' ? item : item?.name || item?.brand || '';
      return existingName.trim().toLowerCase() === cleanName.toLowerCase();
    });

    if (isDuplicate) {
      setError(`"${cleanName}" already exists in your list.`);
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (onSave) {
        await onSave(cleanName);
      }
      onClose();
    } catch (err) {
      setError(err?.message || `Unable to add ${currentConfig.label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => {
              e.preventDefault();
              if (!saving) onClose();
            }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800/80 flex items-center justify-center shrink-0 shadow-xs">
                  <IconComponent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">
                    {currentConfig.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {currentConfig.subtitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onClose();
                }}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg p-1.5 transition cursor-pointer disabled:opacity-50"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">{error}</div>
                </motion.div>
              )}

              <div>
                <label className="text-xs font-semibold tracking-wider text-slate-600 dark:text-slate-300 uppercase mb-1.5 block">
                  {currentConfig.label} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={currentConfig.placeholder}
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all disabled:opacity-60"
                  />
                  {name && !saving && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setName('');
                        if (inputRef.current) inputRef.current.focus({ preventScroll: true });
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>{currentConfig.helperText}</span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end items-center gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                  }}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="px-5 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> {currentConfig.buttonText}
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
