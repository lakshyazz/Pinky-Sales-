import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import './index.css';
import './components/ui/SkeletonLoader.css';

// Auto-recover when a new version is deployed and old chunks fail to load
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Preload error caught (new deployment detected). Reloading to fetch latest bundle...', event);
  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem('last_chunk_reload') || 0);
  if (now - lastReload > 10_000) {
    sessionStorage.setItem('last_chunk_reload', String(now));
    window.location.reload();
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    const msg = String(error?.message || error || '');
    if (msg.includes('dynamically imported module') || msg.includes('Failed to fetch dynamically') || error?.name === 'ChunkLoadError') {
      const now = Date.now();
      const lastReload = Number(sessionStorage.getItem('last_chunk_reload') || 0);
      if (now - lastReload > 10_000) {
        sessionStorage.setItem('last_chunk_reload', String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = String(this.state.error?.message || '').includes('dynamically imported module') || this.state.error?.name === 'ChunkLoadError';
      return (
        <div style={{ padding: '24px', maxWidth: '600px', margin: '40px auto', background: '#fff', color: '#1e293b', fontFamily: 'system-ui, -apple-system, sans-serif', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isChunkError ? '#ecfdf5' : '#fef2f2', color: isChunkError ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>
            {isChunkError ? '🔄' : '⚠️'}
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px', color: '#0f172a' }}>
            {isChunkError ? 'New Update Available' : 'Something went wrong in the UI'}
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.5' }}>
            {isChunkError 
              ? 'A fresh version of Pinky Sales was just deployed. Please reload to load the latest application assets.'
              : 'An unexpected display error occurred. Please reload the page to continue.'}
          </p>
          <button 
            onClick={() => {
              sessionStorage.setItem('last_chunk_reload', String(Date.now()));
              window.location.reload();
            }} 
            style={{ padding: '10px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)' }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <App />
        <Analytics />
      </ErrorBoundary>
    </MotionConfig>
  </React.StrictMode>,
);
