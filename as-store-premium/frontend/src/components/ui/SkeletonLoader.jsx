import React, { useState, useEffect } from 'react';
import './SkeletonLoader.css';

/**
 * Custom Hook: useLoadingTimeout
 * UX Rule: Skeleton loaders lose perceived performance value after 3 seconds.
 * Tracks loading time and sets `isSlow` to true if loading exceeds `timeoutMs` (default 3000ms).
 */
export function useLoadingTimeout(isLoading, timeoutMs = 3000) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    let timerId = null;

    if (isLoading) {
      setIsSlow(false); // Reset on new loading session
      timerId = setTimeout(() => {
        setIsSlow(true);
      }, timeoutMs);
    } else {
      setIsSlow(false);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [isLoading, timeoutMs]);

  return isSlow;
}

/**
 * Primitive Skeleton Item
 * Supports custom widths, heights, radii, and variants (text, circular avatar, rectangle, card)
 */
export function SkeletonElement({
  width = '100%',
  height = '16px',
  borderRadius,
  className = '',
  variant = 'text', // 'text' | 'avatar' | 'rect' | 'card'
  style = {}
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'avatar':
        return { width: width || '48px', height: height || '48px', borderRadius: '50%' };
      case 'card':
        return { width: width || '100%', height: height || '200px', borderRadius: '12px' };
      case 'text':
        return { width: width || '100%', height: height || '16px', borderRadius: borderRadius || '4px' };
      case 'rect':
      default:
        return { width: width || '100%', height: height || '100px', borderRadius: borderRadius || '8px' };
    }
  };

  return (
    <div
      className={`skeleton-box skeleton-variant-${variant} ${className}`}
      style={{
        ...getVariantStyles(),
        ...style
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Pre-configured Layout Matcher: Table Row Skeleton
 * Strictly matches a typical data table row height and column distribution to prevent CLS.
 */
export function TableRowSkeleton({ columns = 4, rows = 5 }) {
  return (
    <div className="skeleton-table" role="presentation">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <div key={cIdx} className="skeleton-table-cell">
              <SkeletonElement
                width={cIdx === 0 ? '60%' : cIdx === columns - 1 ? '40%' : '80%'}
                height="14px"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Pre-configured Layout Matcher: Card Skeleton
 * Matches product cards / metric stats cards layout.
 */
export function CardSkeleton({ count = 3 }) {
  return (
    <div className="skeleton-card-grid">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-card-container">
          <SkeletonElement variant="rect" height="140px" borderRadius="12px 12px 0 0" />
          <div className="skeleton-card-body">
            <SkeletonElement variant="text" width="40%" height="12px" />
            <SkeletonElement variant="text" width="85%" height="18px" />
            <SkeletonElement variant="text" width="60%" height="14px" />
            <div className="skeleton-card-footer">
              <SkeletonElement variant="avatar" width="28px" height="28px" />
              <SkeletonElement variant="text" width="30%" height="14px" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Smart Skeleton Wrapper Component
 * Enforces the 3-second UX Fallback Rule.
 */
export default function SmartSkeletonWrapper({
  isLoading = true,
  timeoutMs = 3000,
  skeletonLayout,
  children,
  fallbackMessage = "Just a moment...",
  fallbackSubtext = "We are retrieving fresh data from the server."
}) {
  const isSlow = useLoadingTimeout(isLoading, timeoutMs);

  if (!isLoading) {
    return <>{children}</>;
  }

  // UX Switch: Exceeding 3 seconds switches to clear progress indicator
  if (isSlow) {
    return (
      <div className="skeleton-fallback-wrapper" role="status" aria-live="polite">
        <div className="skeleton-fallback-card">
          <div className="skeleton-spinner-ring">
            <div className="spinner-inner"></div>
          </div>
          <h4 className="skeleton-fallback-title">{fallbackMessage}</h4>
          <p className="skeleton-fallback-subtext">{fallbackSubtext}</p>
        </div>
      </div>
    );
  }

  // Under 3 seconds: render exact matching shimmer wave skeleton layout
  return (
    <div className="skeleton-layout-wrapper" aria-busy="true" aria-label="Loading content">
      {skeletonLayout}
    </div>
  );
}
