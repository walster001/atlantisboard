// Import env config first to define process for browser compatibility
import './config/env.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.processed.css';
import { initializeOfflineSync } from './services/offlineSync.js';

// Register service worker for PWA with update detection
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);

        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

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
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

// Show update prompt
function showUpdatePrompt(): void {
  // Create update banner
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.className = 'fixed bottom-4 right-4 z-50 alert alert-info shadow-lg';
  banner.innerHTML = `
    <div class="flex items-center gap-4">
      <span>New version available!</span>
      <button id="sw-update-btn" class="btn btn-sm btn-primary">Update Now</button>
      <button id="sw-update-dismiss" class="btn btn-sm btn-ghost">Dismiss</button>
    </div>
  `;
  document.body.appendChild(banner);

  // Handle update button click
  document.getElementById('sw-update-btn')?.addEventListener('click', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    banner.remove();
  });

  // Handle dismiss button click
  document.getElementById('sw-update-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
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


