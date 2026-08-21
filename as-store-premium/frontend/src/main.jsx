import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import './index.css';
import './components/ui/SkeletonLoader.css';

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', fontFamily: 'monospace', whiteSpace: 'pre-wrap', border: '2px solid #e53935', borderRadius: '8px', margin: '20px' }}>
          <h2>Something went wrong in the UI.</h2>
          <details open style={{ marginTop: '10px' }}>
            <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Error Details</summary>
            <pre style={{ marginTop: '10px', overflowX: 'auto', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
              {this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}
            </pre>
          </details>
          <button onClick={() => window.location.reload()} style={{ marginTop: '15px', padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reload Page</button>
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
