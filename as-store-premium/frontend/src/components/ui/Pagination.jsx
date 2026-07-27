import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Pagination({
  meta,
  loading,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  totalLabel = 'total',
}) {
  if (!meta?.loaded) return null;

  const page = Number(meta.page || 1);
  const pageSize = Number(meta.limit || 50);
  const totalPages = Math.max(Number(meta.totalPages || 1), 1);
  const total = Number(meta.total || 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="pagination-bar panel glass-card-premium"
    >
      <div className="pagination-copy flex items-center gap-3">
        <motion.span 
          key={total}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="status-badge stock-ok glow-pill font-bold"
        >
          {total.toLocaleString('en-IN')} {totalLabel}
        </motion.span>
        
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <span>Page</span>
          <AnimatePresence mode="wait">
            <motion.strong
              key={page}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 6, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-slate-900 font-extrabold text-sm px-1.5 py-0.5 rounded bg-slate-100/80"
            >
              {page}
            </motion.strong>
          </AnimatePresence>
          <span>of {totalPages}</span>
        </div>

        {onPageSizeChange && (
          <label className="pagination-size">
            <span>Rows</span>
            <select
              value={pageSize}
              disabled={loading}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        
        {loading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 text-xs text-cyan-600 font-bold ml-2"
          >
            <Loader2 size={14} className="animate-spin text-cyan-500" />
            <span>Updating...</span>
          </motion.div>
        )}
      </div>

      <div className="pagination-actions flex items-center gap-2">
        <motion.button 
          whileHover={{ scale: page <= 1 || loading ? 1 : 1.05 }}
          whileTap={{ scale: page <= 1 || loading ? 1 : 0.95 }}
          className="soft" 
          type="button" 
          disabled={loading || page <= 1} 
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} /> Previous
        </motion.button>

        <motion.button 
          whileHover={{ scale: page >= totalPages || loading ? 1 : 1.05 }}
          whileTap={{ scale: page >= totalPages || loading ? 1 : 0.95 }}
          className="soft" 
          type="button" 
          disabled={loading || page >= totalPages} 
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight size={16} />
        </motion.button>
      </div>
    </motion.div>
  );
}

