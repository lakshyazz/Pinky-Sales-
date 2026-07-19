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
    <div className={`searchbox w-full relative flex items-center bg-white border-2 border-slate-300 focus-within:border-cyan-500 rounded-2xl shadow-md min-h-[54px] px-4 ${className}`.trim()}>
      <Search className="text-slate-400 shrink-0 mr-3" size={22} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        className="w-full bg-transparent border-0 outline-none text-base font-bold text-slate-900 placeholder-slate-400 py-3"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
            type="button"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 ml-2"
            onClick={(e) => onChange('', e)}
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
