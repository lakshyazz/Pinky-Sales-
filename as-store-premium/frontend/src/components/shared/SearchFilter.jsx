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
    <div className={`searchbox w-full relative flex items-center bg-white border-2 border-slate-300 focus-within:border-cyan-500 rounded-2xl shadow-md min-h-[54px] px-4 ${className}`.trim()}>
      <Search className="text-slate-400 shrink-0 mr-3" size={22} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        className="w-full bg-transparent border-0 outline-none text-base font-bold text-slate-900 placeholder-slate-400 py-3"
      />
    </div>
  );
}
