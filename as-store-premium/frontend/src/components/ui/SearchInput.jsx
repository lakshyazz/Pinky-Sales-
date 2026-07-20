import React from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}) {
  return (
    <div className={`group w-full relative flex items-center gap-3 bg-white/95 border border-slate-200/90 focus-within:border-cyan-500 rounded-2xl shadow-lg shadow-slate-200/30 backdrop-blur-xl transition-all duration-300 min-h-[54px] px-4 sm:px-5 focus-within:ring-4 focus-within:ring-cyan-500/10 ${className}`.trim()}>
      <Search className="text-slate-400 group-focus-within:text-cyan-600 shrink-0 transition-colors duration-200" size={20} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        style={{
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          outline: 'none',
          padding: 0,
          margin: 0,
          minHeight: 'unset',
        }}
        className="w-full text-base font-bold text-slate-800 placeholder-slate-400 focus:ring-0 focus:outline-none py-3"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
            type="button"
            className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all shrink-0 ml-1"
            onClick={(e) => onChange('', e)}
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
