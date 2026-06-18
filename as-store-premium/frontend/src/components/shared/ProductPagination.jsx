import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProductPagination({ meta, loading, onPageChange }) {
  if (!meta?.loaded) return null;

  const page = Number(meta.page || 1);
  const totalPages = Math.max(Number(meta.totalPages || 1), 1);
  const total = Number(meta.total || 0);

  return (
    <div className="pagination-bar panel">
      <div className="pagination-copy">
        <span className="status-badge stock-ok">{total.toLocaleString('en-IN')} total</span>
        <small>Page {page} of {totalPages}</small>
        {loading && <small>Loading...</small>}
      </div>
      <div className="pagination-actions">
        <button className="soft" type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} /> Previous
        </button>
        <button className="soft" type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
