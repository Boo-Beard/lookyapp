// Animations & Micro-interactions Library

// Number Count-Up Animation
class NumberAnimator {
  constructor() {
    this.activeAnimations = new Map();
  }

  // Animate a number from current value to target value
  animateNumber(element, targetValue, options = {}) {
    if (!element) return;

    const {
      duration = 1000,
      easing = 'easeOutQuart',
      formatter = (val) => val.toLocaleString(),
      onComplete = null,
      decimals = 0
    } = options;

    // Cancel any existing animation for this element
    if (this.activeAnimations.has(element)) {
      cancelAnimationFrame(this.activeAnimations.get(element));
    }

    const startValue = this.parseNumber(element.textContent) || 0;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Apply easing
      const easedProgress = this.easingFunctions[easing](progress);
      
      // Calculate current value
      const currentValue = startValue + (targetValue - startValue) * easedProgress;
      
      // Format and display
      const displayValue = decimals > 0 
        ? currentValue.toFixed(decimals)
        : Math.round(currentValue);
      
      element.textContent = formatter(parseFloat(displayValue));

      if (progress < 1) {
        const animationId = requestAnimationFrame(animate);
        this.activeAnimations.set(element, animationId);
      } else {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    };

    const animationId = requestAnimationFrame(animate);
    this.activeAnimations.set(element, animationId);
  }

  // Parse number from formatted string
  parseNumber(str) {
    if (typeof str === 'number') return str;
    const cleaned = String(str).replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  }

  // Easing functions
  easingFunctions = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - (--t) * t * t * t,
    easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    easeOutElastic: (t) => {
      const p = 0.3;
      return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    }
  };

  // Cancel all animations
  cancelAll() {
    this.activeAnimations.forEach((animationId) => {
      cancelAnimationFrame(animationId);
    });
    this.activeAnimations.clear();
  }
}

// Loading Skeleton Generator
class SkeletonLoader {
  // Create skeleton for table rows
  static createTableSkeleton(columns = 6, rows = 5) {
    const skeletonRows = [];
    
    for (let i = 0; i < rows; i++) {
      const cells = [];
      for (let j = 0; j < columns; j++) {
        const width = j === 0 ? '120px' : j === columns - 1 ? '80px' : '60px';
        cells.push(`<td><div class="skeleton skeleton-text" style="width: ${width}"></div></td>`);
      }
      skeletonRows.push(`<tr class="skeleton-row">${cells.join('')}</tr>`);
    }
    
    return skeletonRows.join('');
  }

  // Create skeleton for card
  static createCardSkeleton() {
    return `
      <div class="skeleton-card">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text" style="width: 80%"></div>
        <div class="skeleton skeleton-button"></div>
      </div>
    `;
  }

  // Create skeleton for summary cards
  static createSummaryCardSkeleton() {
    return `
      <div class="summary-card skeleton-card">
        <div class="skeleton skeleton-circle"></div>
        <div class="summary-content">
          <div class="skeleton skeleton-text" style="width: 80px"></div>
          <div class="skeleton skeleton-text" style="width: 120px; height: 32px"></div>
          <div class="skeleton skeleton-text" style="width: 60px"></div>
        </div>
      </div>
    `;
  }

  // Create skeleton for holdings table
  static createHoldingsTableSkeleton(count = 10) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(`
        <tr class="skeleton-row holding-card-row">
          <td colspan="6">
            <div class="holding-card skeleton-card">
              <div class="holding-card-header">
                <div class="holding-card-header-left">
                  <div class="skeleton skeleton-circle" style="width: 40px; height: 40px"></div>
                  <div class="token-info">
                    <div class="skeleton skeleton-text" style="width: 80px"></div>
                    <div class="skeleton skeleton-text" style="width: 120px"></div>
                  </div>
                </div>
                <div class="skeleton skeleton-text" style="width: 100px"></div>
              </div>
              <div class="holding-card-metrics">
                ${Array(8).fill('<div class="holding-metric"><div class="skeleton skeleton-text" style="width: 60px"></div><div class="skeleton skeleton-text" style="width: 80px"></div></div>').join('')}
              </div>
            </div>
          </td>
        </tr>
      `);
    }
    return rows.join('');
  }

  // Show skeleton in element
  static show(element, type = 'table', options = {}) {
    if (!element) return;

    const { columns = 6, rows = 5, count = 10 } = options;
    
    let skeletonHTML = '';
    switch (type) {
      case 'table':
        skeletonHTML = this.createTableSkeleton(columns, rows);
        break;
      case 'card':
        skeletonHTML = this.createCardSkeleton();
        break;
      case 'summary':
        skeletonHTML = this.createSummaryCardSkeleton();
        break;
      case 'holdings':
        skeletonHTML = this.createHoldingsTableSkeleton(count);
        break;
      default:
        skeletonHTML = this.createTableSkeleton(columns, rows);
    }

    element.innerHTML = skeletonHTML;
    element.classList.add('is-loading-skeleton');
  }

  // Hide skeleton
  static hide(element) {
    if (!element) return;
    element.classList.remove('is-loading-skeleton');
  }
}

// Micro-interactions
class MicroInteractions {
  // Add ripple effect to element
  static addRipple(element, event) {
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    element.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  }

  // Add shake animation
  static shake(element) {
    if (!element) return;
    element.classList.add('shake-animation');
    setTimeout(() => element.classList.remove('shake-animation'), 500);
  }

  // Add bounce animation
  static bounce(element) {
    if (!element) return;
    element.classList.add('bounce-animation');
    setTimeout(() => element.classList.remove('bounce-animation'), 600);
  }

  // Add pulse animation
  static pulse(element) {
    if (!element) return;
    element.classList.add('pulse-animation');
    setTimeout(() => element.classList.remove('pulse-animation'), 1000);
  }

  // Add fade in animation
  static fadeIn(element, duration = 300) {
    if (!element) return;
    element.style.opacity = '0';
    element.style.transition = `opacity ${duration}ms ease`;
    
    requestAnimationFrame(() => {
      element.style.opacity = '1';
    });
  }

  // Add slide in animation
  static slideIn(element, direction = 'up', duration = 300) {
    if (!element) return;
    
    const transforms = {
      up: 'translateY(20px)',
      down: 'translateY(-20px)',
      left: 'translateX(20px)',
      right: 'translateX(-20px)'
    };
    
    element.style.opacity = '0';
    element.style.transform = transforms[direction];
    element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    
    requestAnimationFrame(() => {
      element.style.opacity = '1';
      element.style.transform = 'translate(0, 0)';
    });
  }

  // Stagger animation for multiple elements
  static stagger(elements, animation = 'fadeIn', delay = 50) {
    if (!elements || elements.length === 0) return;
    
    elements.forEach((element, index) => {
      setTimeout(() => {
        if (typeof animation === 'function') {
          animation(element);
        } else {
          this[animation](element);
        }
      }, index * delay);
    });
  }
}

// Chart Animations
class ChartAnimator {
  // Animate donut chart segments
  static animateDonutSegments(segments, duration = 800) {
    segments.forEach((segment, index) => {
      segment.style.transition = 'none';
      segment.style.strokeDashoffset = '1000';
      
      setTimeout(() => {
        segment.style.transition = `stroke-dashoffset ${duration}ms ease ${index * 100}ms`;
        segment.style.strokeDashoffset = '0';
      }, 50);
    });
  }

  // Animate bar chart bars
  static animateBars(bars, duration = 600) {
    bars.forEach((bar, index) => {
      const targetHeight = bar.dataset.height || bar.style.height;
      bar.style.height = '0';
      bar.style.transition = `height ${duration}ms ease ${index * 50}ms`;
      
      setTimeout(() => {
        bar.style.height = targetHeight;
      }, 50);
    });
  }

  // Animate line chart path
  static animatePath(path, duration = 1000) {
    if (!path) return;
    
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.transition = `stroke-dashoffset ${duration}ms ease`;
    
    setTimeout(() => {
      path.style.strokeDashoffset = '0';
    }, 50);
  }
}

// Global instances
window.numberAnimator = new NumberAnimator();
window.SkeletonLoader = SkeletonLoader;
window.MicroInteractions = MicroInteractions;
window.ChartAnimator = ChartAnimator;

// Auto-initialize ripple effects on buttons
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.btn, .mode-toggle-btn, .holding-action');
    if (button && !button.disabled) {
      MicroInteractions.addRipple(button, e);
    }
  });
});

console.log('[Animations] Animation library loaded');
