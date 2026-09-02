import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { ChevronDown, Search, Check, Plus, X, Layers, Box, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ProductThumbnail from './ProductThumbnail';

function SearchableCombobox({
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
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const deferredSearch = useDeferredValue(search);

  // Normalize options array into [{ id, name, keywords, brand, category, quality, model, image_url, stock, coloursCount, price }]
  const normalizedOptions = useMemo(() => {
    return options
      .map((opt) => {
        if (Array.isArray(opt)) {
          const [id, name, extra] = opt;
          if (id === '' || id === null || id === undefined) return null;
          return { 
            id, 
            name: String(name || id),
            keywords: typeof extra === 'string' ? extra : (extra?.keywords || ''),
            brand: extra?.brand || '',
            category: extra?.category || '',
            image_url: extra?.image_url || '',
            stock: extra?.stock,
            coloursCount: extra?.coloursCount,
          };
        }
        if (opt && typeof opt === 'object') {
          return {
            id: opt.id ?? opt.name ?? opt.value,
            name: String(opt.name ?? opt.label ?? opt.id ?? ''),
            keywords: opt.keywords ?? opt.searchableText ?? '',
            brand: opt.brand ?? '',
            category: opt.category ?? opt.part_category ?? '',
            quality: opt.quality ?? opt.quality_variant ?? '',
            model: opt.model ?? opt.full_model_list ?? '',
            image_url: opt.image_url || opt.imageUrl || '',
            stock: opt.stock ?? opt.stockQty,
            coloursCount: opt.coloursCount ?? (Array.isArray(opt.colours) ? opt.colours.length : undefined),
            retailPrice: opt.retailPrice,
            wholesalePrice: opt.wholesalePrice,
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

  // Multi-field normalized case-insensitive search filter - only computed when isOpen is true
  const filteredOptions = useMemo(() => {
    if (!isOpen) return [];
    const rawSearch = deferredSearch.trim().toLowerCase();
    if (!rawSearch) return normalizedOptions;

    const normalize = (str = '') => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanQuery = normalize(rawSearch);
    const terms = rawSearch.split(/\s+/).filter(Boolean);

    return normalizedOptions.filter((opt) => {
      const fieldsToSearch = [
        opt.name,
        opt.keywords,
        opt.brand,
        opt.category,
        opt.quality,
        opt.model,
      ].filter(Boolean).join(' ').toLowerCase();

      // 1. Direct multi-term match (e.g., "viv v27", "v27 oled")
      const termMatch = terms.every((term) => fieldsToSearch.includes(term));
      if (termMatch) return true;

      // 2. Full query substring match
      if (fieldsToSearch.includes(rawSearch)) return true;

      // 3. Normalized alphanumeric match (e.g. "v 27" -> "v27", "ip 7g" -> "ip7g", "v27" in "vivv27full")
      if (cleanQuery) {
        const normalizedFields = normalize(fieldsToSearch);
        if (normalizedFields.includes(cleanQuery)) return true;

        const cleanTerms = terms.map(normalize).filter(Boolean);
        if (cleanTerms.length > 1 && cleanTerms.every((ct) => normalizedFields.includes(ct))) return true;
      }

      return false;
    });
  }, [normalizedOptions, deferredSearch, isOpen]);

  // Render top 50 items to keep DOM small and fast
  const visibleOptions = useMemo(() => filteredOptions.slice(0, 50), [filteredOptions]);

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
    <div 
      className={`relative select-none ${isOpen ? 'z-[9999]' : 'z-auto'} ${className}`} 
      ref={containerRef} 
      onKeyDown={handleKeyDown}
      style={{ zIndex: isOpen ? 9999 : undefined }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[40px] h-10 px-3 py-1.5 bg-white dark:bg-slate-850 border rounded-xl flex items-center justify-between gap-2 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen
            ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-2xs'
        }`}
      >
        <div className="flex-1 truncate flex items-center gap-2">
          {selectedOption ? (
            <>
              {selectedOption.category && (
                <ProductThumbnail 
                  src={selectedOption.image_url} 
                  category={selectedOption.category} 
                  size={24} 
                  showZoom={false} 
                  rounded="6px"
                />
              )}
              <span className="text-xs font-bold text-slate-800 dark:text-white truncate">
                {selectedOption.name}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {allowClear && selectedOption && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
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
            className="absolute z-[9999] left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            style={{
              maxHeight: '360px',
              backgroundColor: '#ffffff',
              boxShadow: '0 20px 40px -12px rgba(15, 23, 42, 0.2), 0 8px 16px -4px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            }}
          >
            {/* Sticky Search Header */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 shrink-0">
              <div className="relative flex items-center w-full">
                <svg
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  style={{ paddingLeft: '34px', paddingRight: search ? '32px' : '10px', height: '34px' }}
                  className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer z-10"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Options List */}
            <div
              ref={listRef}
              className="overflow-y-auto max-h-64 py-1 space-y-0.5 bg-white dark:bg-slate-900"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent',
              }}
            >
              {visibleOptions.length > 0 ? (
                <>
                  {visibleOptions.map((option, idx) => {
                    const isSelected = String(option.id) === String(value);
                    const isHighlighted = idx === highlightedIndex;
                    const isProduct = Boolean(option.brand || option.category || option.stock !== undefined);

                    return (
                      <div
                        key={option.id}
                        onClick={() => handleSelect(option.id)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`px-3 py-2 text-xs rounded-xl mx-1 transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800'
                            : isHighlighted
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                            : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {isProduct && (
                            <ProductThumbnail
                              src={option.image_url}
                              category={option.category}
                              size={32}
                              showZoom={false}
                              rounded="8px"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 dark:text-white truncate text-xs leading-tight">
                              {option.name}
                            </div>
                            {(option.brand || option.category || option.quality) && (
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {option.brand && (
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                    {option.brand}
                                  </span>
                                )}
                                {option.category && (
                                  <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded">
                                    {option.category}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Stock & Colours Meta */}
                        <div className="flex items-center gap-1.5 shrink-0 text-right">
                          {option.stock !== undefined && (
                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                              Number(option.stock) > 0 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              Stock: {option.stock}
                            </span>
                          )}
                          {option.coloursCount !== undefined && Number(option.coloursCount) > 1 && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                              {option.coloursCount} Colors
                            </span>
                          )}
                          {isSelected && (
                            <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 ml-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredOptions.length > 50 && (
                    <div className="px-3 py-1.5 text-[10.5px] text-center font-bold text-slate-500 bg-slate-50 border-t border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                      Showing top 50 of {filteredOptions.length} results · Type to refine
                    </div>
                  )}
                </>
              ) : (
                <div className="px-4 py-4 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
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

export default React.memo(SearchableCombobox);
