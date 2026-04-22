// Import env config first to define process for browser compatibility
import './config/env.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.processed.css';
import { initializeOfflineSync } from './services/offlineSync.js';

// Register service worker for PWA with update detection
if ('serviceWorker' in navigator) {
  const onWindowLoad = (): void => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        // Check for updates every hour
        const updateInterval = setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
        const onBeforeUnload = (): void => {
          clearInterval(updateInterval);
        };
        window.addEventListener('beforeunload', onBeforeUnload, { once: true });

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              showUpdatePrompt();
            }
          });
        });

        // Listen for controller change (user refreshed after update)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      })
      .catch(() => {
        /* registration optional */
      });
  };
  if (document.readyState === 'complete') {
    onWindowLoad();
  } else {
    window.addEventListener('load', onWindowLoad, { once: true });
  }
}

// Show update prompt
function showUpdatePrompt(): void {
  const existing = document.getElementById('sw-update-banner');
  if (existing != null) {
    return;
  }
  // Create update banner
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.className = 'fixed bottom-4 right-4 z-50 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg';
  banner.innerHTML = `
    <div class="flex items-center gap-4">
      <span class="text-blue-900 dark:text-blue-100">New version available!</span>
      <button id="sw-update-btn" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">Update Now</button>
      <button id="sw-update-dismiss" class="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors">Dismiss</button>
    </div>
  `;
  document.body.appendChild(banner);

  // Handle update button click
  document.getElementById('sw-update-btn')?.addEventListener('click', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    banner.remove();
  }, { once: true });

  // Handle dismiss button click
  document.getElementById('sw-update-dismiss')?.addEventListener('click', () => {
    banner.remove();
  }, { once: true });
}

// Initialize offline sync
initializeOfflineSync();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


