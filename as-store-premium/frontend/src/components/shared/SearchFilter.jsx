import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchFilter({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  debounceMs = 180,
}) {
  const [localValue, setLocalValue] = useState(value || '');
  const isFirstMount = useRef(true);
  const debounceTimerRef = useRef(null);

  // Sync internal state when external value changes from parent (e.g. filters reset)
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value || '');
    }
  }, [value]);

  // Debounce the notification to parent onChange
  const handleInputChange = (e) => {
    const nextVal = e.target.value;
    setLocalValue(nextVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (onChange) {
        onChange(nextVal);
      }
    }, debounceMs);
  };

  // Instant clear handler
  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLocalValue('');
    if (onChange) {
      onChange('');
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={`group w-full relative flex items-center gap-3 bg-slate-50/50 hover:bg-slate-50 focus-within:bg-white border border-slate-200/80 focus-within:border-teal-500 rounded-2xl shadow-sm focus-within:shadow-xl focus-within:shadow-teal-500/5 min-h-[50px] px-4 transition-all duration-200 ease-in-out ${className}`.trim()}>
      <Search className="text-slate-400 group-focus-within:text-teal-600 group-focus-within:scale-105 shrink-0 transition-transform duration-200" size={18} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={localValue}
        onChange={handleInputChange}
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
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          title="Clear search"
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
