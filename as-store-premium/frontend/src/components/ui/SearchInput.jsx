import React, { useState } from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <motion.div 
      initial={false}
      animate={{
        scale: isFocused ? 1.01 : 1,
        boxShadow: isFocused 
          ? '0 12px 30px -10px rgba(6, 182, 212, 0.25), 0 0 0 4px rgba(6, 182, 212, 0.12)' 
          : '0 8px 24px -8px rgba(15, 23, 42, 0.08)'
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`group w-full relative flex items-center gap-3 bg-white/95 border ${
        isFocused ? 'border-cyan-500/80 active-border-beam' : 'border-slate-200/90 hover:border-slate-300'
      } rounded-2xl backdrop-blur-xl transition-colors duration-200 min-h-[54px] px-4 sm:px-5 ${className}`.trim()}
    >
      <motion.div
        animate={{ scale: isFocused ? 1.15 : 1, rotate: isFocused ? [0, -10, 10, 0] : 0 }}
        transition={{ duration: 0.3 }}
      >
        <Search className={`${isFocused ? 'text-cyan-600' : 'text-slate-400 group-hover:text-slate-600'} shrink-0 transition-colors duration-200`} size={20} />
      </motion.div>
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
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
            initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
            whileHover={{ scale: 1.15, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            type="button"
            className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors shrink-0 ml-1"
            onClick={(e) => onChange('', e)}
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

