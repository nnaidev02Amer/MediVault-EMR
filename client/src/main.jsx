import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// This app is not a PWA. Browsers keep service workers and caches per origin
// (localhost:5173), so a worker registered by another project that used the same
// port keeps intercepting requests here and asks for a manifest / sw entry file
// that does not exist (404 / "manifest syntax error"). Remove any such leftovers.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      if (!registrations.length) return;
      await Promise.all(registrations.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // reload once so the page is no longer controlled by the removed worker
      try {
        if (!sessionStorage.getItem('sw-cleaned')) {
          sessionStorage.setItem('sw-cleaned', '1');
          window.location.reload();
        }
      } catch {
        /* storage unavailable: nothing more to do */
      }
    })
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);