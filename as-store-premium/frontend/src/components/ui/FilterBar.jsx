import React from 'react';
import { motion } from 'framer-motion';

export default function FilterBar({
  options = [],
  activeOption,
  onChange,
  label,
  className = '',
  layoutId = 'activeFilterPillBackground',
}) {
  return (
    <div className={`filter-bar flex items-center gap-3 py-1.5 overflow-x-auto custom-scrollbar ${className}`.trim()}>
      {label && <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 select-none shrink-0">{label}</span>}
      <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/50 backdrop-blur-md shrink-0">
        {options.map((option) => {
          const isSelected = option.value === activeOption;
          return (
            <motion.button
              key={option.value}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => onChange(option.value)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors select-none ${
                isSelected 
                  ? 'text-cyan-950 font-extrabold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-slate-200/80 active-border-beam"
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

