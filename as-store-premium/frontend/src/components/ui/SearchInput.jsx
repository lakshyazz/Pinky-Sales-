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
    <div className={`searchbox w-full relative flex items-center bg-white/95 border border-slate-200/90 focus-within:border-cyan-500 rounded-3xl shadow-xl shadow-slate-200/40 backdrop-blur-xl transition-all duration-300 min-h-[58px] px-5 focus-within:ring-4 focus-within:ring-cyan-500/10 ${className}`.trim()}>
      <Search className="text-cyan-500 shrink-0 mr-3.5 transition-colors duration-300" size={22} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        className="w-full bg-transparent border-0 outline-none text-base font-bold text-slate-800 placeholder-slate-400 py-4.5"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
            type="button"
            className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all shrink-0 ml-2"
            onClick={(e) => onChange('', e)}
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
