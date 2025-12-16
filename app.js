// Looky - Modern Crypto Portfolio Viewer
// Enhanced UI with smooth animations and better UX

const $ = (id) => document.getElementById(id);

const state = {
  wallets: [],
  holdings: [],
  scanning: false,
  totalValue: 0,
};

// Telegram Integration
const TG = (() => {
  try { return window.Telegram?.WebApp || null; } catch { return null; }
})();

const isTelegram = () => !!TG && typeof TG.ready === 'function';

function applyTelegramTheme() {
  if (!isTelegram()) return;
  
  const p = TG.themeParams || {};
  const root = document.documentElement;
  
  if (p.bg_color) root.style.setProperty('--bg-primary', p.bg_color);
  if (p.text_color) root.style.setProperty('--text-primary', p.text_color);
  if (p.hint_color) root.style.setProperty('--text-secondary', p.hint_color);
  if (p.link_color) root.style.setProperty('--text-accent', p.link_color);
  
  try {
    TG.setHeaderColor?.('secondary_bg_color');
    TG.setBackgroundColor?.(p.bg_color || '#0A0B14');
  } catch {}
}

// Haptic Feedback
function hapticFeedback(type = 'light') {
  if (!isTelegram() || !TG.HapticFeedback) return;
  
  try {
    if (type === 'success') TG.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') TG.HapticFeedback.notificationOccurred('error');
    else TG.HapticFeedback.impactOccurred(type);
  } catch {}
}


// Ultra-simple eye following with no extra features
// Eye Following System - No blinking
// Enhanced Eye Tracking System - Looks at cursor AND typing position
function setupEyeTracking() {
  const pupils = document.querySelectorAll('.pupil');
  if (!pupils.length) return;
  
  // State
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let typingTargetX = null;
  let typingTargetY = null;
  let isTyping = false;
  let typingTimeout = null;
  
  // Track mouse movement
  document.addEventListener('mousemove', (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    isTyping = false;
  });
  
  // Track touch movement
  document.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
      cursorX = e.touches[0].clientX;
      cursorY = e.touches[0].clientY;
      isTyping = false;
    }
  });
  
  // Track textarea for typing
  const addressInput = $('addressInput');
  if (addressInput) {
    // Focus/blur events
    addressInput.addEventListener('focus', () => {
      isTyping = true;
      updateTypingTarget(addressInput);
    });
    
    addressInput.addEventListener('blur', () => {
      isTyping = false;
      typingTargetX = null;
      typingTargetY = null;
    });

    // Track every keypress for animation
    addressInput.addEventListener('input', () => {
      isTyping = true;

      // Calculate caret position
      const caretPos = addressInput.selectionStart;
      updateTypingTarget(addressInput, caretPos);

      // Reset typing flag after pause
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
      }, 1000);
    });

    // Track cursor movement in textarea (for arrow keys, clicking)
    addressInput.addEventListener('click', (e) => {
      isTyping = true;
      const rect = addressInput.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      // Estimate character position based on click
      const text = addressInput.value;
      const avgCharWidth = getAverageCharWidth(addressInput);
      const estimatedPos = Math.floor(clickX / avgCharWidth);

      updateTypingTarget(addressInput, Math.min(estimatedPos, text.length));
    });

    addressInput.addEventListener('keyup', (e) => {
      // Track arrow keys, home, end
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        isTyping = true;
        updateTypingTarget(addressInput, addressInput.selectionStart);
      }
    });
  }

  // Calculate average character width in the textarea
  function getAverageCharWidth(textarea) {
    const testText = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(textarea);

    context.font = computedStyle.font;
    const metrics = context.measureText(testText);

    return metrics.width / testText.length;
  }

  // Update target based on typing position
  function updateTypingTarget(textarea, caretPosition = null) {
    if (!textarea) return;

    const rect = textarea.getBoundingClientRect();
    const text = textarea.value;

    // If no caret position provided, use end of text
    if (caretPosition === null) {
      caretPosition = text.length;
    }

    // Get text up to caret position
    const textBeforeCaret = text.substring(0, caretPosition);

    // Calculate approximate X position
    const avgCharWidth = getAverageCharWidth(textarea);
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight);

    // Count lines in text before caret
    const lines = textBeforeCaret.split('\n');
    const currentLine = lines.length - 1;
    const charsInCurrentLine = lines[currentLine].length;

    // Calculate position
    const xOffset = charsInCurrentLine * avgCharWidth;
    const yOffset = currentLine * lineHeight;

    // Set target position (with some padding)
    typingTargetX = rect.left + 70 + xOffset; // 70px for line numbers + padding
    typingTargetY = rect.top + 16 + yOffset; // 16px padding
  }
  
  // Smooth animation with personality
  function animateEyes() {
    // Choose target based on mode
    let targetX, targetY;
    
    if (isTyping && typingTargetX && typingTargetY) {
      // Look at typing position
      targetX = typingTargetX;
      targetY = typingTargetY;
    } else {
      // Look at cursor
      targetX = cursorX;
      targetY = cursorY;
    }
    
    pupils.forEach((pupil, index) => {
      const eye = pupil.closest('.eye');
      if (!eye) return;
      
      const rect = eye.getBoundingClientRect();
      const eyeX = rect.left + rect.width / 2;
      const eyeY = rect.top + rect.height / 2;
      
      const dx = targetX - eyeX;
      const dy = targetY - eyeY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // More dynamic movement based on distance
      const maxMove = 8;
      const moveFactor = Math.min(distance / 100, 1);
      const moveDistance = maxMove * moveFactor;
      
      // Add some randomness to make it feel alive
      const jitter = isTyping ? 0.1 : 0.3; // Less jitter when typing
      const jitterX = (Math.random() - 0.5) * jitter;
      const jitterY = (Math.random() - 0.5) * jitter;
      
      // Calculate direction
      const angle = Math.atan2(dy, dx);
      const moveX = Math.cos(angle) * moveDistance + jitterX;
      const moveY = Math.sin(angle) * moveDistance + jitterY;
      
      // Apply with smooth easing
      const currentTransform = pupil.style.transform || 'translate(-50%, -50%)';
      const match = currentTransform.match(/translate\(calc\(-50%\s*\+\s*([-\d.]+)px\),\s*calc\(-50%\s*\+\s*([-\d.]+)px\)\)/);
      
      if (match) {
        const currentX = parseFloat(match[1]) || 0;
        const currentY = parseFloat(match[2]) || 0;
        
        // Smooth interpolation
        const smoothing = isTyping ? 0.3 : 0.15; // Faster when typing
        const newX = currentX + (moveX - currentX) * smoothing;
        const newY = currentY + (moveY - currentY) * smoothing;
        
        pupil.style.transform = `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px))`;
      } else {
        pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
      }
      
    });
    
    requestAnimationFrame(animateEyes);
  }
  
  // Start animation
  animateEyes();
  
  // Add eye "excitement" when scanning starts
  const scanButton = $('scanButton');
  if (scanButton) {
    scanButton.addEventListener('click', () => {
      // Make eyes widen briefly
      pupils.forEach(pupil => {
        const eye = pupil.closest('.eye');
        if (eye) {
          eye.style.transform = 'scale(1.2)';
          setTimeout(() => {
            eye.style.transform = '';
          }, 300);
        }
      });
    });
  }
}

// Address Classification
// Simple base58 validation function
function isValidBase58(str) {
  // Base58 alphabet (Bitcoin style)
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Check all characters are in the base58 alphabet
  for (let i = 0; i < str.length; i++) {
    if (alphabet.indexOf(str[i]) === -1) {
      return false;
    }
  }
  
  // Additional: check it's not all the same character (common error)
  const firstChar = str[0];
  const allSame = str.split('').every(char => char === firstChar);

  return !allSame;
}

function classifyAddress(address) {
  const addr = (address || '').trim();

  if (!addr) return { type: 'empty' };

  const cleanAddr = addr.toLowerCase();

  // EVM: 0x + 40 hex chars
  if (/^0x[a-f0-9]{40}$/i.test(addr)) {
    return { type: 'evm', value: cleanAddr };
  }

  // Solana: Check if it looks like a valid base58 public key
  if (addr.length >= 32 && addr.length <= 44) {
    if (isValidBase58(addr)) {
      // Quick sanity check: decode first byte to ensure it's a valid public key
      // (optional, more advanced)
      return { type: 'solana', value: addr };
    }
  }

  // Try to extract address from common formats
  // e.g., "solana:7BP4ZiR5HipSJBQ5Yk6RYf8R23gZJkKVjL1iSoYPQ6ax" or just the address part
  const solanaMatch = addr.match(/(?:solana:)?([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (solanaMatch && isValidBase58(solanaMatch[1])) {
    return { type: 'solana', value: solanaMatch[1] };
  }

  // Also check for Solana domain names (optional)
  if (addr.endsWith('.sol')) {
    return { type: 'solana-domain', value: addr };
  }

  return { type: 'unknown', value: addr };
}

let _addressStatsRaf = 0;
function scheduleAddressStatsUpdate() {
  if (_addressStatsRaf) return;
  _addressStatsRaf = requestAnimationFrame(() => {
    _addressStatsRaf = 0;
    updateAddressStats();
  });
}

function updateAddressStats() {
  const textarea = $('addressInput');
  if (!textarea) return;

  const lines = textarea.value.split('\n').filter(line => line.trim());

  let solana = 0, evm = 0;
  const lineNumbers = [];

  lines.forEach((line, index) => {
    const classified = classifyAddress(line);
    lineNumbers.push(`${index + 1}.`);

    switch (classified.type) {
      case 'solana': solana++; break;
      case 'evm': evm++; break;
    }
  });

  // Update counts
  const solCount = $('solCount');
  const evmCount = $('evmCount');
  if (solCount) solCount.textContent = solana;
  if (evmCount) evmCount.textContent = evm;

  // Update line numbers
  const lineNumbersEl = $('lineNumbers');
  if (lineNumbersEl) lineNumbersEl.innerHTML = lineNumbers.join('<br>');
}

// Scan Process
async function scanWallets() {
  if (state.scanning) return;

  const textarea = $('addressInput');
  if (!textarea) return;
  const lines = textarea.value.split('\n').filter(line => line.trim());

  const addresses = {
    solana: [],
    evm: [],
    unknown: []
  };

  lines.forEach(line => {
    const classified = classifyAddress(line);
    if (classified.type !== 'empty') {
      if (classified.type === 'solana-domain') {
        addresses.unknown.push(classified.value);
        return;
      }

      if (addresses[classified.type]) {
        addresses[classified.type].push(classified.value);
      } else {
        addresses.unknown.push(classified.value);
      }
    }
  });

  if (addresses.solana.length === 0 && addresses.evm.length === 0) {
    showStatus('Please enter at least one valid wallet address', 'error');
    hapticFeedback('error');
    return;
  }

  // Show results section
  $('resultsSection')?.classList.remove('hidden');

  // Reset state
  state.scanning = true;
  state.wallets = [];
  state.holdings = [];
  state.totalValue = 0;

  // Update UI for scanning
  const scanButton = $('scanButton');
  if (scanButton) {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="btn-icon">⏳</span><span>Scanning...</span>';
  }
  showStatus('Starting scan...', 'info');
  updateProgress(0);

  const allHoldings = [];
  const walletList = [];

  // Scan Solana wallets
  for (let i = 0; i < addresses.solana.length; i++) {
    const wallet = addresses.solana[i];
    showStatus(`Scanning Solana wallet ${i + 1}/${addresses.solana.length}...`, 'info');
    updateProgress((i / addresses.solana.length) * 50);

    try {
      const holdings = await fetchWalletHoldings(wallet, 'solana');
      holdings.forEach(h => {
        allHoldings.push({ ...h, chain: 'solana', source: wallet });
      });
      walletList.push({ address: wallet, chain: 'solana', count: holdings.length });
    } catch (error) {
      console.warn(`Failed to scan Solana wallet ${wallet}:`, error);
    }
  }

  // Scan EVM wallets
  for (let i = 0; i < addresses.evm.length; i++) {
    const wallet = addresses.evm[i];
    showStatus(`Scanning EVM wallet ${i + 1}/${addresses.evm.length}...`, 'info');
    updateProgress(50 + (i / addresses.evm.length) * 50);

    try {
      const holdings = await fetchWalletHoldings(wallet, 'evm');
      holdings.forEach(h => {
        allHoldings.push({ ...h, chain: 'evm', source: wallet });
      });
      walletList.push({ address: wallet, chain: 'evm', count: holdings.length });
    } catch (error) {
      console.warn(`Failed to scan EVM wallet ${wallet}:`, error);
    }
  }

  // Process holdings
  const holdingsMap = new Map();

  allHoldings.forEach(holding => {
    const key = `${holding.chain}:${holding.address || holding.token_address}`;
    const value = holding.value || holding.valueUsd || 0;

    if (holdingsMap.has(key)) {
      const existing = holdingsMap.get(key);
      existing.value += value;
      existing.balance += holding.amount || holding.uiAmount || 0;
      existing.sources.push(holding.source);
    } else {
      holdingsMap.set(key, {
        key,
        chain: holding.chain,
        address: holding.address || holding.token_address,
        symbol: holding.symbol || '—',
        name: holding.name || 'Unknown Token',
        logo: holding.logo_uri || holding.logoURI || holding.icon || '',
        price: holding.price || holding.priceUsd || holding.price_usd || 0,
        balance: holding.amount || holding.uiAmount || 0,
        value: value,
        sources: [holding.source]
      });
    }
  });

  state.holdings = Array.from(holdingsMap.values());
  state.wallets = walletList;
  state.totalValue = state.holdings.reduce((sum, h) => sum + h.value, 0);

  // Update UI
  updateSummary();
  renderHoldingsTable();
  renderWalletList();

  // Finalize
  state.scanning = false;
  if (scanButton) {
    scanButton.disabled = false;
    scanButton.innerHTML = '<span>Lets Looky!</span>';
  }
  showStatus(`Scan complete! Found ${state.holdings.length} tokens across ${state.wallets.length} wallets`, 'success');
  updateProgress(100);

  hapticFeedback('success');

  // Auto-hide status after 3 seconds
  setTimeout(() => {
    $('scanStatus')?.classList.add('hidden');
  }, 3000);
}

// UI Updates
function updateSummary() {
  $('totalValue').textContent = formatCurrency(state.totalValue);
  $('walletCount').textContent = `${state.wallets.length} wallet${state.wallets.length !== 1 ? 's' : ''}`;
  $('tokenCount').textContent = state.holdings.length;

  // Count unique chains
  const chains = new Set(state.holdings.map(h => h.chain));
  $('chainCount').textContent = chains.size;

  // Find largest holding
  const largest = state.holdings.reduce((max, h) => h.value > max.value ? h : max, { value: 0, symbol: '—' });
  $('largestHolding').textContent = largest.symbol;
  $('largestValue').textContent = formatCurrency(largest.value);
}

function renderHoldingsTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  const searchTerm = ($('searchInput')?.value || '').toLowerCase();
  const hideDust = $('hideDust')?.checked ?? true;
  const sortBy = $('sortSelect')?.value || 'valueDesc';

  // Filter and sort
  let filtered = state.holdings.filter(h => {
    if (hideDust && h.value < 1) return false;
    if (!searchTerm) return true;

    return h.symbol.toLowerCase().includes(searchTerm) ||
           h.name.toLowerCase().includes(searchTerm) ||
           h.address.toLowerCase().includes(searchTerm);
  });

  // Sort
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'valueDesc': return b.value - a.value;
      case 'valueAsc': return a.value - b.value;
      case 'nameAsc': return a.name.localeCompare(b.name);
      case 'chain': return a.chain.localeCompare(b.chain);
      default: return b.value - a.value;
    }
  });

  // Render
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">No holdings match your filters</div>
          </div>
        </td>
      </tr>
    `;
    const tableStats = $('tableStats');
    if (tableStats) tableStats.textContent = 'Showing 0 tokens';
    return;
  }

  tbody.innerHTML = filtered.map(holding => `
    <tr class="holding-row" data-key="${holding.key}">
      <td>
        <div class="token-cell">
          <img class="token-icon" src="${holding.logo}" onerror="this.src=''; this.style.opacity='0.3'" alt="">
          <div class="token-info">
            <div class="token-symbol">${holding.symbol}</div>
            <div class="token-name">${holding.name}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="chain-badge-small ${holding.chain}">
          ${holding.chain === 'solana' ? 'SOL' : 'EVM'}
        </span>
      </td>
      <td class="mono">${formatNumber(holding.balance)}</td>
      <td class="mono">${formatCurrency(holding.price)}</td>
      <td class="mono"><strong>${formatCurrency(holding.value)}</strong></td>
    </tr>
  `).join('');

  const tableStats = $('tableStats');
  if (tableStats) {
    tableStats.textContent = `Showing ${filtered.length} tokens • Total value: ${formatCurrency(filtered.reduce((s, h) => s + h.value, 0))}`;
  }
}

function renderWalletList() {
  const container = $('walletsGrid');
  if (!container) return;

  if (state.wallets.length === 0) {
    container.innerHTML = '<div class="empty-state">No wallets scanned</div>';
    return;
  }

  container.innerHTML = state.wallets.map(wallet => `
    <div class="wallet-card ${wallet.chain}">
      <div class="wallet-header">
        <span class="wallet-chain">${wallet.chain === 'solana' ? 'Solana' : 'EVM'}</span>
        <span class="wallet-count">${wallet.count} tokens</span>
      </div>
      <div class="wallet-address mono">${shortenAddress(wallet.address)}</div>
    </div>
  `).join('');
}

// Status Updates
function showStatus(message, type = 'info') {
  const status = $('scanStatus');
  const content = $('statusContent');
  if (!status || !content) return;

  status.classList.remove('hidden');
  content.textContent = message;
  content.className = 'status-content';
  content.classList.add(type);
}

function updateProgress(percent) {
  const fill = $('progressBar')?.querySelector('.progress-fill');
  if (fill) {
    fill.style.width = `${percent}%`;
  }
}

// Modal Management
function openTokenModal(key) {
  const holding = state.holdings.find(h => h.key === key);
  if (!holding) return;

  hapticFeedback('light');

  const modalTokenIcon = $('modalTokenIcon');
  const modalTokenName = $('modalTokenName');
  const modalTokenAddress = $('modalTokenAddress');
  const modalTokenValue = $('modalTokenValue');
  const modalTokenBalance = $('modalTokenBalance');
  const modalTokenPrice = $('modalTokenPrice');
  const modalChainTag = $('modalChainTag');
  const modalFullAddress = $('modalFullAddress');

  if (modalTokenIcon) {
    modalTokenIcon.src = holding.logo;
    modalTokenIcon.alt = holding.symbol;
  }
  if (modalTokenName) modalTokenName.textContent = `${holding.symbol} - ${holding.name}`;
  if (modalTokenAddress) modalTokenAddress.textContent = shortenAddress(holding.address);
  if (modalTokenValue) modalTokenValue.textContent = formatCurrency(holding.value);
  if (modalTokenBalance) modalTokenBalance.textContent = formatNumber(holding.balance);
  if (modalTokenPrice) modalTokenPrice.textContent = formatCurrency(holding.price);
  if (modalChainTag) modalChainTag.textContent = holding.chain === 'solana' ? 'Solana' : 'EVM';
  if (modalFullAddress) modalFullAddress.textContent = holding.address;

  const explorerUrl = holding.chain === 'solana' 
    ? `https://solscan.io/token/${holding.address}`
    : `https://etherscan.io/token/${holding.address}`;
  const modalExplorerLink = $('modalExplorerLink');
  if (modalExplorerLink) modalExplorerLink.href = explorerUrl;

  $('tokenModal')?.classList.remove('hidden');

  if (isTelegram()) {
    TG.BackButton.show();
    TG.BackButton.onClick(closeTokenModal);
  }
}

function closeTokenModal() {
  $('tokenModal')?.classList.add('hidden');

  if (isTelegram()) {
    TG.BackButton.hide();
    TG.BackButton.offClick(closeTokenModal);
  }
}

// Event Handlers
function setupEventListeners() {
  // Address input
  const addressInput = $('addressInput');
  if (!addressInput) return;
  addressInput.addEventListener('input', scheduleAddressStatsUpdate);
  addressInput.addEventListener('paste', () => {
    setTimeout(scheduleAddressStatsUpdate, 10);
  });

  // Buttons
  $('scanButton')?.addEventListener('click', scanWallets);

  $('demoButton')?.addEventListener('click', () => {
    addressInput.value = `8X35rQUK2u9hfn8rMPwwr6ZSEUhbmfDPEapp589XyoM1
0x742d35Cc6634C0532925a3b844Bc454e4438f44e`;
    scheduleAddressStatsUpdate();
    hapticFeedback('light');
  });

  $('clearInputBtn')?.addEventListener('click', () => {
    addressInput.value = '';
    scheduleAddressStatsUpdate();
    hapticFeedback('light');
  });

  $('pasteBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      addressInput.value = text;

      scheduleAddressStatsUpdate();
      hapticFeedback('light');
    } catch (error) {
      showStatus('Unable to paste from clipboard', 'error');
    }
  });

  // Table controls
  $('searchInput')?.addEventListener('input', renderHoldingsTable);
  $('sortSelect')?.addEventListener('change', renderHoldingsTable);
  $('hideDust')?.addEventListener('change', renderHoldingsTable);

  // Table row clicks
  $('tableBody')?.addEventListener('click', (e) => {
    const row = e.target.closest('.holding-row');
    if (row) {
      openTokenModal(row.dataset.key);
    }
  });

  // Modal
  $('closeModal')?.addEventListener('click', closeTokenModal);
  $('modalBackdrop')?.addEventListener('click', closeTokenModal);
  $('closeExamples')?.addEventListener('click', () => {
    $('examplesModal')?.classList.add('hidden');
  });
  $('examplesBackdrop')?.addEventListener('click', () => {
    $('examplesModal')?.classList.add('hidden');
  });

  // Copy address
  $('copyAddress')?.addEventListener('click', () => {
    const address = $('modalFullAddress')?.textContent || '';
    navigator.clipboard.writeText(address).then(() => {
      showStatus('Address copied to clipboard', 'success');
      hapticFeedback('success');
    });
  });

  // Example copy buttons
  document.querySelectorAll('.example-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const address = btn.dataset.address;
      navigator.clipboard.writeText(address).then(() => {
        showStatus('Example address copied', 'success');
        hapticFeedback('success');
      });
    });
  });

  // Export button
  $('exportButton')?.addEventListener('click', () => {
    if (state.holdings.length === 0) {
      showStatus('No data to export', 'error');
      return;
    }

    const csv = [
      ['Token', 'Symbol', 'Chain', 'Balance', 'Price', 'Value', 'Address'].join(','),
      ...state.holdings.map(h => [
        `"${h.name}"`,
        `"${h.symbol}"`,
        h.chain,
        h.balance,
        h.price,
        h.value,
        h.address
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `looky-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('CSV exported successfully', 'success');
    hapticFeedback('success');
  });
}

// Telegram Setup
function setupTelegram() {
  if (!isTelegram()) return;

  TG.ready();
  TG.expand?.();

  applyTelegramTheme();
  TG.onEvent('themeChanged', applyTelegramTheme);

  // Use Telegram Main Button
  TG.MainButton.setText('Scan Wallets');
  TG.MainButton.show();
  TG.MainButton.onClick(scanWallets);

  // Back button handling
  TG.BackButton.onClick(() => {
    const tokenModal = $('tokenModal');
    const examplesModal = $('examplesModal');
    if (tokenModal && !tokenModal.classList.contains('hidden')) {
      closeTokenModal();
    } else if (examplesModal && !examplesModal.classList.contains('hidden')) {
      examplesModal.classList.add('hidden');
    }
  });
}

// Initialize
async function initialize() {
  // Setup Telegram
  setupTelegram();

  // Setup eye tracking
  setupEyeTracking();

  // Setup event listeners
  setupEventListeners();

  // Initial UI update
  updateAddressStats();

  // Show welcome message
  setTimeout(() => {
    showStatus('Paste wallet addresses above to get started', 'info');
  }, 1000);
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}