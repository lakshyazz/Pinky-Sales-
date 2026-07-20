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
    <div className={`group searchbox w-full relative flex items-center bg-slate-50/50 hover:bg-slate-50 focus-within:bg-white border border-slate-200/80 focus-within:border-teal-500 rounded-2xl shadow-sm focus-within:shadow-xl focus-within:shadow-teal-500/5 min-h-[52px] px-4 transition-all duration-300 ease-in-out ${className}`.trim()}>
      <Search className="text-slate-400 group-focus-within:text-teal-600 group-focus-within:scale-105 shrink-0 mr-3 transition-all duration-300" size={20} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        className="w-full bg-transparent border-0 outline-none text-sm font-semibold text-slate-800 placeholder-slate-400 py-3"
      />
    </div>
  );
}
