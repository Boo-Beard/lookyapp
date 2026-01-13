// Portfolio History Chart
const STORAGE_KEY_PORTFOLIO_HISTORY = 'peeek:portfolioHistory';
const MAX_HISTORY_POINTS = 365; // Keep up to 1 year of data

let historyChart = null;
let currentHistoryPeriod = '7d';

// Generate demo data for testing (30 days of simulated portfolio values)
function generateDemoHistoryData() {
  const demoData = [];
  const now = Date.now();
  const baseValue = 150000;
  
  for (let i = 29; i >= 0; i--) {
    const timestamp = now - (i * 24 * 60 * 60 * 1000);
    const randomChange = (Math.random() - 0.5) * 0.15; // ±15% variation
    const trendChange = (29 - i) * 0.01; // Slight upward trend
    const value = baseValue * (1 + randomChange + trendChange);
    
    demoData.push({
      timestamp,
      value: Math.round(value * 100) / 100,
    });
  }
  
  return demoData;
}

// Save portfolio snapshot to history
function savePortfolioHistorySnapshot() {
  try {
    const history = loadPortfolioHistory();
    const now = Date.now();
    const totalValue = Number(state.totalValue || 0) || 0;
    
    console.log('💾 Saving portfolio snapshot:', { totalValue, historyLength: history.length });
    
    // Don't save if value is 0 or invalid
    if (totalValue <= 0) {
      console.warn('⚠️ Skipping snapshot - invalid value:', totalValue);
      return;
    }
    
    // Check if we already have a snapshot from today
    const today = new Date().toDateString();
    const lastSnapshot = history[history.length - 1];
    if (lastSnapshot) {
      const lastDate = new Date(lastSnapshot.timestamp).toDateString();
      if (lastDate === today) {
        // Update today's snapshot instead of creating a new one
        console.log('📝 Updating today\'s snapshot');
        lastSnapshot.value = totalValue;
        lastSnapshot.timestamp = now;
        localStorage.setItem(STORAGE_KEY_PORTFOLIO_HISTORY, JSON.stringify(history));
        
        // Re-render chart if it's currently visible
        const content = document.getElementById('historyChartContent');
        if (content && !content.classList.contains('hidden')) {
          console.log('🔄 Re-rendering chart with updated snapshot');
          renderPortfolioHistoryChart();
        }
        return;
      }
    }
    
    // Add new snapshot
    console.log('✅ Adding new snapshot');
    history.push({
      timestamp: now,
      value: totalValue,
    });
    
    // Keep only the last MAX_HISTORY_POINTS
    if (history.length > MAX_HISTORY_POINTS) {
      history.splice(0, history.length - MAX_HISTORY_POINTS);
    }
    
    localStorage.setItem(STORAGE_KEY_PORTFOLIO_HISTORY, JSON.stringify(history));
    console.log('✅ Portfolio history saved. Total snapshots:', history.length);
    
    // Re-render chart if it's currently visible
    const content = document.getElementById('historyChartContent');
    if (content && !content.classList.contains('hidden')) {
      console.log('🔄 Re-rendering chart with new snapshot');
      renderPortfolioHistoryChart();
    }
  } catch (e) {
    console.error('Failed to save portfolio history:', e);
  }
}

// Load portfolio history from localStorage
function loadPortfolioHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PORTFOLIO_HISTORY);
    if (!raw) {
      console.log('📊 No portfolio history found in localStorage');
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter(p => p && typeof p.timestamp === 'number' && typeof p.value === 'number');
    console.log('📊 Loaded portfolio history:', filtered.length, 'snapshots');
    return filtered;
  } catch (e) {
    console.error('Failed to load portfolio history:', e);
    return [];
  }
}

// Load demo data into localStorage (for testing)
function loadDemoHistoryData() {
  try {
    const demoData = generateDemoHistoryData();
    localStorage.setItem(STORAGE_KEY_PORTFOLIO_HISTORY, JSON.stringify(demoData));
    console.log('✅ Demo data loaded:', demoData.length, 'snapshots');
    renderPortfolioHistoryChart();
  } catch (e) {
    console.error('Failed to load demo data:', e);
  }
}

// Clear all portfolio history
function clearPortfolioHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY_PORTFOLIO_HISTORY);
    console.log('🗑️ Portfolio history cleared');
    renderPortfolioHistoryChart();
  } catch (e) {
    console.error('Failed to clear portfolio history:', e);
  }
}

// Filter history by period
function filterHistoryByPeriod(history, period) {
  if (!Array.isArray(history) || history.length === 0) return [];
  
  const now = Date.now();
  let cutoff = 0;
  
  switch (period) {
    case '7d':
      cutoff = now - (7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      cutoff = now - (30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      cutoff = now - (90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
    default:
      return history;
  }
  
  return history.filter(p => p.timestamp >= cutoff);
}

// Render portfolio history chart
function renderPortfolioHistoryChart() {
  const canvas = document.getElementById('historyChart');
  if (!canvas) return;
  
  const history = loadPortfolioHistory();
  const filteredHistory = filterHistoryByPeriod(history, currentHistoryPeriod);
  
  // Update stats
  updateHistoryStats(filteredHistory);
  
  if (filteredHistory.length === 0) {
    // Clear canvas and show empty state
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = 300;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'var(--text-tertiary)';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No historical data yet. Scan your portfolio to start tracking!', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  // Prepare data
  const values = filteredHistory.map(p => p.value);
  const timestamps = filteredHistory.map(p => p.timestamp);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  
  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 300 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '300px';
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  const width = rect.width;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Get theme colors
  const isDark = document.documentElement.dataset.theme === 'dark';
  const lineColor = isDark ? '#00c2ff' : '#0066cc';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const areaColor = isDark ? 'rgba(0, 194, 255, 0.1)' : 'rgba(0, 102, 204, 0.1)';
  
  // Draw grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }
  
  // Draw Y-axis labels
  ctx.fillStyle = textColor;
  ctx.font = '12px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = maxValue - ((maxValue - minValue) / 5) * i;
    const y = padding.top + (chartHeight / 5) * i;
    ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
  }
  
  // Draw line chart
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  const points = [];
  filteredHistory.forEach((point, i) => {
    const x = padding.left + (chartWidth / (filteredHistory.length - 1 || 1)) * i;
    const normalizedValue = (point.value - minValue) / (maxValue - minValue || 1);
    const y = padding.top + chartHeight - (normalizedValue * chartHeight);
    points.push({ x, y });
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Draw area under line
  if (points.length > 0) {
    ctx.beginPath();
    ctx.fillStyle = areaColor;
    ctx.moveTo(points[0].x, padding.top + chartHeight);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
    ctx.closePath();
    ctx.fill();
  }
  
  // Draw X-axis labels
  ctx.fillStyle = textColor;
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  const labelCount = Math.min(5, filteredHistory.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.floor((filteredHistory.length - 1) * (i / (labelCount - 1 || 1)));
    const point = filteredHistory[index];
    const x = padding.left + (chartWidth / (filteredHistory.length - 1 || 1)) * index;
    const date = new Date(point.timestamp);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.fillText(label, x, height - 10);
  }
}

// Update history stats
function updateHistoryStats(filteredHistory) {
  const currentValueEl = document.getElementById('historyCurrentValue');
  const periodChangeEl = document.getElementById('historyPeriodChange');
  const allTimeHighEl = document.getElementById('historyAllTimeHigh');
  const dataPointsEl = document.getElementById('historyDataPoints');
  
  const currentValue = Number(state.totalValue || 0) || 0;
  const allHistory = loadPortfolioHistory();
  
  if (currentValueEl) {
    currentValueEl.textContent = formatCurrency(currentValue);
  }
  
  if (dataPointsEl) {
    dataPointsEl.textContent = String(allHistory.length);
  }
  
  if (allTimeHighEl && allHistory.length > 0) {
    const ath = Math.max(...allHistory.map(p => p.value));
    allTimeHighEl.textContent = formatCurrency(ath);
  }
  
  if (periodChangeEl && filteredHistory.length > 0) {
    const firstValue = filteredHistory[0].value;
    const change = currentValue - firstValue;
    const changePct = firstValue > 0 ? (change / firstValue) * 100 : 0;
    const sign = change >= 0 ? '+' : '';
    const colorClass = change >= 0 ? 'pnl-positive' : 'pnl-negative';
    periodChangeEl.className = `history-stat-value ${colorClass}`;
    periodChangeEl.textContent = `${sign}${formatCurrency(Math.abs(change))} (${sign}${Math.abs(changePct).toFixed(2)}%)`;
  }
}

// Initialize portfolio history
function initPortfolioHistory() {
  const toggleBtn = document.getElementById('historyChartToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const content = document.getElementById('historyChartContent');
      const card = document.getElementById('historyChartCard');
      if (content && card) {
        const isExpanded = !content.classList.contains('hidden');
        content.classList.toggle('hidden');
        card.classList.toggle('is-collapsed', isExpanded);
        toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
        
        if (!isExpanded) {
          // Render chart when expanded
          setTimeout(() => renderPortfolioHistoryChart(), 100);
        }
      }
    });
  }
  
  // Period buttons
  const periodBtns = document.querySelectorAll('.history-period-btn');
  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      if (!period) return;
      
      currentHistoryPeriod = period;
      
      // Update active state
      periodBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      
      // Re-render chart
      renderPortfolioHistoryChart();
    });
  });
  
  // Load demo data button
  const loadDemoBtn = document.getElementById('loadDemoHistoryBtn');
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', () => {
      loadDemoHistoryData();
    });
  }
  
  // Clear history button
  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all portfolio history?')) {
        clearPortfolioHistory();
      }
    });
  }
  
  // Re-render chart on window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const content = document.getElementById('historyChartContent');
      if (content && !content.classList.contains('hidden')) {
        renderPortfolioHistoryChart();
      }
    }, 250);
  });
}
