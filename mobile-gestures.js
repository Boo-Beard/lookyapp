// Mobile-First Optimizations: Gestures & Pull-to-Refresh

// Pull-to-Refresh for Holdings Table
let pullToRefreshActive = false;
let pullStartY = 0;
let pullCurrentY = 0;
let isPulling = false;

function initPullToRefresh() {
  const holdingsContent = document.getElementById('holdingsContent');
  if (!holdingsContent) return;

  const threshold = 80; // pixels to trigger refresh
  let pullIndicator = null;

  function createPullIndicator() {
    if (pullIndicator) return pullIndicator;
    
    pullIndicator = document.createElement('div');
    pullIndicator.className = 'pull-to-refresh-indicator';
    pullIndicator.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
    pullIndicator.style.cssText = `
      position: absolute;
      top: -50px;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface);
      border: 2px solid var(--border);
      border-radius: 50%;
      transition: transform 0.2s ease, opacity 0.2s ease;
      opacity: 0;
      z-index: 100;
    `;
    holdingsContent.style.position = 'relative';
    holdingsContent.insertBefore(pullIndicator, holdingsContent.firstChild);
    return pullIndicator;
  }

  function handleTouchStart(e) {
    if (holdingsContent.scrollTop > 0) return;
    pullStartY = e.touches[0].clientY;
    isPulling = false;
  }

  function handleTouchMove(e) {
    if (holdingsContent.scrollTop > 0) return;
    
    pullCurrentY = e.touches[0].clientY;
    const pullDistance = pullCurrentY - pullStartY;

    if (pullDistance > 10 && !isPulling) {
      isPulling = true;
      createPullIndicator();
    }

    if (isPulling && pullDistance > 0) {
      e.preventDefault();
      const indicator = createPullIndicator();
      const progress = Math.min(pullDistance / threshold, 1);
      indicator.style.opacity = progress;
      indicator.style.transform = `translateX(-50%) translateY(${pullDistance * 0.5}px) rotate(${progress * 360}deg)`;
    }
  }

  async function handleTouchEnd(e) {
    if (!isPulling) return;

    const pullDistance = pullCurrentY - pullStartY;
    const indicator = createPullIndicator();

    if (pullDistance >= threshold && !pullToRefreshActive) {
      pullToRefreshActive = true;
      indicator.classList.add('is-refreshing');
      indicator.querySelector('i').classList.add('fa-spin');
      
      try {
        if (typeof hapticFeedback === 'function') hapticFeedback('medium');
        
        // Trigger portfolio refresh
        const portfolioRefreshBtn = document.getElementById('portfolioRefreshBtn');
        if (portfolioRefreshBtn && !portfolioRefreshBtn.disabled) {
          portfolioRefreshBtn.click();
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } finally {
        pullToRefreshActive = false;
        indicator.classList.remove('is-refreshing');
        indicator.querySelector('i').classList.remove('fa-spin');
      }
    }

    // Reset
    indicator.style.opacity = '0';
    indicator.style.transform = 'translateX(-50%) translateY(0) rotate(0)';
    isPulling = false;
    pullStartY = 0;
    pullCurrentY = 0;
  }

  holdingsContent.addEventListener('touchstart', handleTouchStart, { passive: true });
  holdingsContent.addEventListener('touchmove', handleTouchMove, { passive: false });
  holdingsContent.addEventListener('touchend', handleTouchEnd, { passive: true });
}

// Swipe Gestures for Tab Navigation
function initTabSwipeGestures() {
  const inputBody = document.getElementById('inputBody');
  if (!inputBody) return;

  let touchStartX = 0;
  let touchEndX = 0;
  const swipeThreshold = 50;

  const modes = ['portfolio', 'watchlist', 'search'];
  
  function getCurrentModeIndex() {
    if (document.getElementById('portfolioModeBtn')?.classList.contains('is-active')) return 0;
    if (document.getElementById('watchlistModeBtn')?.classList.contains('is-active')) return 1;
    if (document.getElementById('searchModeBtn')?.classList.contains('is-active')) return 2;
    return 0;
  }

  function setMode(mode) {
    if (mode === 'portfolio') document.getElementById('portfolioModeBtn')?.click();
    else if (mode === 'watchlist') document.getElementById('watchlistModeBtn')?.click();
    else if (mode === 'search') document.getElementById('searchModeBtn')?.click();
  }

  function handleSwipe() {
    const swipeDistance = touchEndX - touchStartX;
    
    if (Math.abs(swipeDistance) < swipeThreshold) return;

    const currentIndex = getCurrentModeIndex();
    
    if (swipeDistance > 0) {
      // Swipe right - go to previous tab
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        setMode(modes[prevIndex]);
        if (typeof hapticFeedback === 'function') hapticFeedback('light');
      }
    } else {
      // Swipe left - go to next tab
      const nextIndex = currentIndex + 1;
      if (nextIndex < modes.length) {
        setMode(modes[nextIndex]);
        if (typeof hapticFeedback === 'function') hapticFeedback('light');
      }
    }
  }

  inputBody.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  inputBody.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
}

// Swipe to Hide Token
function initTokenSwipeToHide() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  let swipeStartX = 0;
  let swipeCurrentX = 0;
  let swipeTarget = null;
  let isSwipingToken = false;

  tableBody.addEventListener('touchstart', (e) => {
    const row = e.target.closest('tr.holding-card-row');
    if (!row) return;

    swipeTarget = row;
    swipeStartX = e.touches[0].clientX;
    isSwipingToken = false;
  }, { passive: true });

  tableBody.addEventListener('touchmove', (e) => {
    if (!swipeTarget) return;

    swipeCurrentX = e.touches[0].clientX;
    const swipeDistance = swipeCurrentX - swipeStartX;

    if (Math.abs(swipeDistance) > 20 && !isSwipingToken) {
      isSwipingToken = true;
    }

    if (isSwipingToken && swipeDistance < 0) {
      // Swipe left - show hide action
      const translateX = Math.max(swipeDistance, -100);
      swipeTarget.style.transform = `translateX(${translateX}px)`;
      swipeTarget.style.transition = 'none';
    }
  }, { passive: true });

  tableBody.addEventListener('touchend', (e) => {
    if (!swipeTarget || !isSwipingToken) {
      if (swipeTarget) {
        swipeTarget.style.transform = '';
        swipeTarget.style.transition = '';
      }
      swipeTarget = null;
      return;
    }

    const swipeDistance = swipeCurrentX - swipeStartX;
    
    if (swipeDistance < -60) {
      // Trigger hide action
      const hideBtn = swipeTarget.querySelector('[data-action="holding-hide-toggle"]');
      if (hideBtn) {
        if (typeof hapticFeedback === 'function') hapticFeedback('medium');
        hideBtn.click();
      }
    }

    // Reset
    swipeTarget.style.transform = '';
    swipeTarget.style.transition = 'transform 0.3s ease';
    setTimeout(() => {
      if (swipeTarget) {
        swipeTarget.style.transition = '';
      }
    }, 300);
    
    swipeTarget = null;
    isSwipingToken = false;
  }, { passive: true });
}

// Initialize all mobile gestures
function initMobileGestures() {
  // Gestures disabled per user request
  // Only initialize on mobile devices
  // const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  //   || window.matchMedia('(max-width: 768px)').matches;
  
  // if (!isMobile) return;

  // initPullToRefresh();
  // initTabSwipeGestures();
  // initTokenSwipeToHide();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileGestures);
} else {
  initMobileGestures();
}
