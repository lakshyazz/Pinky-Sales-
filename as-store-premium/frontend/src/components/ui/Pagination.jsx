import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="pagination-bar panel"
    >
      <div className="pagination-copy">
        <span className="status-badge stock-ok">{total.toLocaleString('en-IN')} {totalLabel}</span>
        <small>Page {page} of {totalPages}</small>
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
          <motion.small 
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            Loading...
          </motion.small>
        )}
      </div>
      <div className="pagination-actions">
        <motion.button 
          whileHover={{ scale: page <= 1 || loading ? 1 : 1.03 }}
          whileTap={{ scale: page <= 1 || loading ? 1 : 0.97 }}
          className="soft" 
          type="button" 
          disabled={loading || page <= 1} 
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} /> Previous
        </motion.button>
        <motion.button 
          whileHover={{ scale: page >= totalPages || loading ? 1 : 1.03 }}
          whileTap={{ scale: page >= totalPages || loading ? 1 : 0.97 }}
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
