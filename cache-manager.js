// Cache Manager - Client-side caching utilities
class CacheManager {
  constructor() {
    this.PRICE_CACHE_KEY = 'peeek:priceCache';
    this.PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.lastUpdateTimestamp = null;
    this.updateTimerInterval = null;
  }

  // Initialize cache manager
  init() {
    this.startUpdateTimer();
    this.registerServiceWorker();
    this.setupOnlineOfflineHandlers();
  }

  // Register Service Worker
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[Cache] Service Worker not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      console.log('[Cache] Service Worker registered:', registration.scope);

      // Handle updates - disabled per user request
      // registration.addEventListener('updatefound', () => {
      //   const newWorker = registration.installing;
      //   console.log('[Cache] New Service Worker found');

      //   newWorker.addEventListener('statechange', () => {
      //     if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      //       // New service worker available
      //       this.showUpdateNotification();
      //     }
      //   });
      // });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_COMPLETE') {
          console.log('[Cache] Background sync completed');
          this.handleBackgroundSync();
        }
      });

    } catch (error) {
      console.error('[Cache] Service Worker registration failed:', error);
    }
  }

  // Show update notification
  showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-notification-content">
        <span>New version available!</span>
        <button class="btn btn-sm btn-primary" onclick="window.cacheManager.updateApp()">Update</button>
      </div>
    `;
    document.body.appendChild(notification);

    // Auto-show
    setTimeout(() => notification.classList.add('show'), 100);
  }

  // Update app (reload with new service worker)
  async updateApp() {
    if (!navigator.serviceWorker.controller) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    } catch (error) {
      console.error('[Cache] Update failed:', error);
    }
  }

  // Setup online/offline handlers
  setupOnlineOfflineHandlers() {
    window.addEventListener('online', () => {
      console.log('[Cache] Back online');
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      console.log('[Cache] Gone offline');
      this.handleOffline();
    });

    // Check initial state
    if (!navigator.onLine) {
      this.handleOffline();
    }
  }

  // Handle online event
  handleOnline() {
    this.showConnectionStatus('online');
    
    // Trigger background sync if supported
    if ('sync' in navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        return registration.sync.register('sync-portfolio');
      }).catch((err) => {
        console.log('[Cache] Background sync registration failed:', err);
      });
    }

    // Refresh data
    setTimeout(() => {
      const refreshBtn = document.getElementById('portfolioRefreshBtn');
      if (refreshBtn && !refreshBtn.disabled) {
        console.log('[Cache] Auto-refreshing after coming online');
        // Don't auto-click, just notify user
      }
    }, 1000);
  }

  // Handle offline event
  handleOffline() {
    this.showConnectionStatus('offline');
  }

  // Show connection status
  showConnectionStatus(status) {
    const existingStatus = document.querySelector('.connection-status');
    if (existingStatus) existingStatus.remove();

    const statusEl = document.createElement('div');
    statusEl.className = `connection-status connection-status-${status}`;
    statusEl.innerHTML = `
      <i class="fa-solid ${status === 'online' ? 'fa-wifi' : 'fa-wifi-slash'}" aria-hidden="true"></i>
      <span>${status === 'online' ? 'Back online' : 'Offline mode'}</span>
    `;
    document.body.appendChild(statusEl);

    setTimeout(() => statusEl.classList.add('show'), 100);
    
    if (status === 'online') {
      setTimeout(() => {
        statusEl.classList.remove('show');
        setTimeout(() => statusEl.remove(), 300);
      }, 3000);
    }
  }

  // Handle background sync completion
  handleBackgroundSync() {
    console.log('[Cache] Handling background sync');
    this.updateLastUpdateTimestamp();
  }

  // Cache token prices
  cacheTokenPrices(prices) {
    try {
      const cacheData = {
        prices,
        timestamp: Date.now()
      };
      localStorage.setItem(this.PRICE_CACHE_KEY, JSON.stringify(cacheData));
      this.updateLastUpdateTimestamp();
    } catch (error) {
      console.error('[Cache] Failed to cache prices:', error);
    }
  }

  // Get cached token prices
  getCachedTokenPrices() {
    try {
      const cached = localStorage.getItem(this.PRICE_CACHE_KEY);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;

      if (age > this.PRICE_CACHE_TTL) {
        console.log('[Cache] Price cache expired');
        return null;
      }

      console.log('[Cache] Using cached prices (age:', Math.round(age / 1000), 's)');
      return cacheData.prices;
    } catch (error) {
      console.error('[Cache] Failed to get cached prices:', error);
      return null;
    }
  }

  // Update last update timestamp
  updateLastUpdateTimestamp() {
    this.lastUpdateTimestamp = Date.now();
    this.updateLastUpdateDisplay();
  }

  // Start update timer
  startUpdateTimer() {
    this.updateLastUpdateDisplay();
    
    if (this.updateTimerInterval) {
      clearInterval(this.updateTimerInterval);
    }

    this.updateTimerInterval = setInterval(() => {
      this.updateLastUpdateDisplay();
    }, 30000); // Update every 30 seconds
  }

  // Update "last updated" display
  updateLastUpdateDisplay() {
    const displayEl = document.getElementById('lastUpdatedDisplay');
    if (!displayEl) return;

    if (!this.lastUpdateTimestamp) {
      displayEl.textContent = '';
      displayEl.classList.add('hidden');
      return;
    }

    const age = Date.now() - this.lastUpdateTimestamp;
    const minutes = Math.floor(age / 60000);
    const seconds = Math.floor((age % 60000) / 1000);

    let text = '';
    if (minutes > 0) {
      text = `Updated ${minutes}m ago`;
    } else if (seconds > 5) {
      text = `Updated ${seconds}s ago`;
    } else {
      text = 'Just updated';
    }

    displayEl.textContent = text;
    displayEl.classList.remove('hidden');
  }

  // Clear all caches
  async clearAllCaches() {
    try {
      // Clear localStorage cache
      localStorage.removeItem(this.PRICE_CACHE_KEY);
      
      // Clear Service Worker caches
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      }

      console.log('[Cache] All caches cleared');
    } catch (error) {
      console.error('[Cache] Failed to clear caches:', error);
    }
  }

  // Get cache status
  getCacheStatus() {
    const priceCache = this.getCachedTokenPrices();
    const hasPriceCache = priceCache !== null;
    const isOnline = navigator.onLine;
    const hasServiceWorker = 'serviceWorker' in navigator && navigator.serviceWorker.controller;

    return {
      online: isOnline,
      serviceWorker: hasServiceWorker,
      priceCache: hasPriceCache,
      lastUpdate: this.lastUpdateTimestamp
    };
  }
}

// Create global instance
window.cacheManager = new CacheManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.cacheManager.init();
  });
} else {
  window.cacheManager.init();
}
