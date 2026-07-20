import React from 'react';
import { Search } from 'lucide-react';

export default function SearchFilter({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}) {
  return (
    <div className={`group w-full relative flex items-center gap-3 bg-slate-50/50 hover:bg-slate-50 focus-within:bg-white border border-slate-200/80 focus-within:border-teal-500 rounded-2xl shadow-sm focus-within:shadow-xl focus-within:shadow-teal-500/5 min-h-[52px] px-4 transition-all duration-300 ease-in-out ${className}`.trim()}>
      <Search className="text-slate-400 group-focus-within:text-teal-600 group-focus-within:scale-105 shrink-0 transition-all duration-300" size={20} />
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
        className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 focus:ring-0 focus:outline-none py-2"
      />
    </div>
  );
}
