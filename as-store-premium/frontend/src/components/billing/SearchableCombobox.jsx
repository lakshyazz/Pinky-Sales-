import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Plus, X, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchableCombobox({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  actionText = null,
  onAction = null,
  disabled = false,
  className = '',
  displayKey = 'label',
  valueKey = 'id',
  renderOption = null,
  emptyText = 'No matching items found.',
  leadingIcon = null,
  size = 'md', // 'sm' | 'md' | 'lg'
  buttonClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Selected item object
  const selectedOption = useMemo(() => {
    return options.find((opt) => String(opt[valueKey]) === String(value)) || null;
  }, [options, value, valueKey]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);

    return options.filter((opt) => {
      const textToSearch = [
        opt[displayKey],
        opt.sublabel,
        opt.brand,
        opt.category,
        opt.model,
        opt.colour,
        opt.custom_name,
        opt.mobile,
        opt.gstin,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.every((t) => textToSearch.includes(t));
    });
  }, [options, search, displayKey]);

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex];
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (actionText && onAction) {
        onAction();
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (option) => {
    onChange && onChange(option[valueKey], option);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setSearch('');
          }
        }}
        className={`w-full text-left rounded-lg border transition-all flex items-center justify-between gap-2 text-xs font-medium cursor-pointer ${
          size === 'sm' ? 'h-9 px-2.5' : size === 'lg' ? 'h-11 px-3.5 text-sm' : 'h-10 px-3'
        } ${
          disabled
            ? 'bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white dark:bg-zinc-900 border-violet-500 dark:border-violet-400 ring-2 ring-violet-500/20 shadow-xs text-zinc-900 dark:text-zinc-100'
            : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-2xs'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {leadingIcon && <span className="text-zinc-400 dark:text-zinc-500 shrink-0">{leadingIcon}</span>}
          <div className="truncate">
            {selectedOption ? (
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedOption[displayKey]}
              </span>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-500 font-normal">{placeholder}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 shrink-0">
          {selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange && onChange('', null);
              }}
              className="hover:text-rose-500 dark:hover:text-rose-400 p-0.5 rounded cursor-pointer transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5 shrink-0 stroke-[1.75]" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 shrink-0 stroke-[1.75] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-violet-600 dark:text-violet-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col min-w-[280px]"
          >
            {/* Search Header */}
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/80 flex items-center gap-2">
              <Search className="w-4 h-4 shrink-0 stroke-[1.75] text-zinc-400 ml-1" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full text-xs font-medium bg-transparent border-none outline-hidden text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 shrink-0 stroke-[1.75]" />
                </button>
              )}
            </div>

            {/* Action Trigger at Top (if configured) */}
            {actionText && onAction && (
              <button
                type="button"
                onClick={() => {
                  onAction();
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50/70 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/70 border-b border-violet-100 dark:border-violet-900/50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0 stroke-[1.75]" />
                <span>{actionText}</span>
              </button>
            )}

            {/* Options List */}
            <div ref={listRef} className="max-h-60 overflow-y-auto py-1 divide-y divide-zinc-50 dark:divide-zinc-800/40">
              {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = String(opt[valueKey]) === String(value);
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={opt[valueKey] || idx}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200 font-semibold'
                          : isHighlighted
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      {renderOption ? (
                        renderOption(opt, isSelected)
                      ) : (
                        <div className="truncate flex-1 min-w-0">
                          <div className="font-semibold flex items-center gap-1.5 truncate">
                            {opt.brand && (
                              <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 px-1 py-0.2 rounded">
                                {opt.brand}
                              </span>
                            )}
                            <span className="truncate">{opt[displayKey]}</span>
                            {opt.category && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
                                • {opt.category}
                              </span>
                            )}
                          </div>
                          {opt.sublabel && (
                            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal truncate mt-0.5">
                              {opt.sublabel}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {opt.stock !== undefined && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              Number(opt.stock) > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            Qty: {opt.stock}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0 ml-1 stroke-[2]" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
