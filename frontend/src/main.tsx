import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// DEV-only: window.__topoDebug 노출 (chrome devtools 에서 토폴로지 조작용)
if (import.meta.env.DEV) {
  void import('./dev/topologyDebug');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
