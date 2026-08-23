import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchableCombobox({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  onAddNew,
  addNewLabel = '+ Add New...',
  disabled = false,
  allowClear = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options array into [{ id, name }]
  const normalizedOptions = useMemo(() => {
    return options
      .map((opt) => {
        if (Array.isArray(opt)) {
          const [id, name] = opt;
          if (id === '' || id === null || id === undefined) return null;
          return { id, name: String(name || id) };
        }
        if (opt && typeof opt === 'object') {
          return {
            id: opt.id ?? opt.name ?? opt.value,
            name: String(opt.name ?? opt.label ?? opt.id ?? ''),
          };
        }
        if (typeof opt === 'string' || typeof opt === 'number') {
          if (opt === '') return null;
          return { id: opt, name: String(opt) };
        }
        return null;
      })
      .filter(Boolean);
  }, [options]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (value === '' || value === null || value === undefined) return null;
    return normalizedOptions.find((opt) => String(opt.id) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();
    if (!cleanSearch) return normalizedOptions;
    return normalizedOptions.filter((opt) =>
      opt.name.toLowerCase().includes(cleanSearch)
    );
  }, [normalizedOptions, search]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(-1);
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus({ preventScroll: true });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex];
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].id);
        } else if (filteredOptions.length === 1) {
          handleSelect(filteredOptions[0].id);
        } else if (filteredOptions.length === 0 && onAddNew && search.trim()) {
          onAddNew();
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  };

  const handleSelect = (optionId) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={`relative select-none ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[48px] px-4 py-3 bg-white dark:bg-slate-850 border rounded-xl flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen
            ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-xs'
        }`}
      >
        <div className="flex-1 truncate">
          {selectedOption ? (
            <span className="text-base font-semibold text-slate-900 dark:text-white">
              {selectedOption.name}
            </span>
          ) : (
            <span className="text-base font-medium text-slate-400 dark:text-slate-500">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {allowClear && selectedOption && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-1 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </span>
          )}
          <ChevronDown
            className={`w-5 h-5 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-teal-600 dark:text-teal-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-150 dark:border-slate-800 overflow-hidden flex flex-col"
            style={{
              maxHeight: '340px',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
            }}
          >
            {/* Sticky Search Header */}
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-850/90 shrink-0">
              <div className="relative flex items-center w-full">
                <Search className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  style={{ paddingLeft: '40px', paddingRight: '32px' }}
                  className="w-full pl-10 pr-8 py-2.5 text-base font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 placeholder:text-base focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Options List */}
            <div
              ref={listRef}
              className="overflow-y-auto max-h-56 py-1.5 space-y-0.5"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent',
              }}
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, idx) => {
                  const isSelected = String(option.id) === String(value);
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={option.id}
                      onClick={() => handleSelect(option.id)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-4 py-3 text-base rounded-xl mx-1.5 transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-bold'
                          : isHighlighted
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                          : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-medium'
                      }`}
                    >
                      <span className="truncate">{option.name}</span>
                      {isSelected && (
                        <Check className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400 shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-5 text-center text-base font-medium text-slate-400 dark:text-slate-500">
                  No matches for "{search}"
                </div>
              )}
            </div>

            {/* Pinned Action Footer */}
            {onAddNew && (
              <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 p-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    onAddNew();
                  }}
                  className="w-full px-4 py-3 text-base font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60 hover:text-teal-700 dark:hover:text-teal-300 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-4.5 h-4.5" />
                  <span>{addNewLabel}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
