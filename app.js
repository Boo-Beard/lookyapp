// Looky - Modern Crypto Portfolio Viewer
// Enhanced UI with smooth animations and better UX

const $ = (id) => document.getElementById(id);

const MAX_ADDRESSES = 20;
const STORAGE_KEY_ADDRESSES = 'looky.addresses.v1';

const state = {
  wallets: [],
  holdings: [],
  scanning: false,
  totalValue: 0,
  addressItems: [],
  viewMode: 'aggregate',
  scanAbortController: null,
  walletHoldings: new Map(),
  activeHolding: null,
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

function hapticFeedback(type = 'light') {
  if (!isTelegram() || !TG.HapticFeedback) return;

  try {
    if (type === 'success') TG.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') TG.HapticFeedback.notificationOccurred('error');
    else TG.HapticFeedback.impactOccurred(type);
  } catch {}
}

function updateTelegramMainButton() {
  if (!isTelegram()) return;

  try {
    const validCount = state.addressItems.filter(a => a.type === 'solana' || a.type === 'evm').length;
    TG.MainButton.setText('Scan Wallets');

    if (state.scanning) {
      TG.MainButton.show();
      TG.MainButton.disable?.();
      return;
    }

    if (validCount > 0) {
      TG.MainButton.show();
      TG.MainButton.enable?.();
    } else {
      TG.MainButton.hide();
    }
  } catch {}
}

function shortenAddress(address) {
  if (!address || address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function formatCurrency(value) {
  const num = Number(value);
  if (!isFinite(num)) return '$0.00';

  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(num) {
  const n = Number(num);
  if (!isFinite(n)) return '0';

  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (Math.abs(n) >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 6 });

  return n.toFixed(8).replace(/\.?0+$/, '') || '0';
}

// Simple base58 validation
function isValidBase58(str) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  for (let i = 0; i < str.length; i++) {
    if (alphabet.indexOf(str[i]) === -1) return false;
  }
  const firstChar = str[0];
  const allSame = str.split('').every(char => char === firstChar);
  return !allSame;
}

function classifyAddress(address) {
  const addr = (address || '').trim();
  if (!addr) return { type: 'empty' };

  const cleanAddr = addr.toLowerCase();

  if (/^0x[a-f0-9]{40}$/i.test(addr)) {
    return { type: 'evm', value: cleanAddr };
  }

  if (addr.length >= 32 && addr.length <= 44 && isValidBase58(addr)) {
    return { type: 'solana', value: addr };
  }

  const solanaMatch = addr.match(/(?:solana:)?([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (solanaMatch && isValidBase58(solanaMatch[1])) {
    return { type: 'solana', value: solanaMatch[1] };
  }

  if (addr.endsWith('.sol')) {
    return { type: 'solana-domain', value: addr };
  }

  return { type: 'unknown', value: addr };
}

function getAddressItemsFromText(text) {
  const lines = String(text || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const kept = lines.slice(0, MAX_ADDRESSES);
  const truncated = lines.length > MAX_ADDRESSES;

  const items = kept.map(line => {
    const classified = classifyAddress(line);
    const isValid = classified.type === 'solana' || classified.type === 'evm';
    return {
      raw: line,
      type: isValid ? classified.type : 'invalid',
      normalized: classified.value || line,
    };
  });

  return { items, truncated };
}

function persistAddressItems() {
  try {
    localStorage.setItem(STORAGE_KEY_ADDRESSES, JSON.stringify(state.addressItems.map(a => a.raw)));
  } catch {}
}

function loadPersistedAddressItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADDRESSES);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    return list.map(x => String(x));
  } catch {
    return null;
  }
}

function syncTextareaFromAddressItems() {
  const textarea = $('addressInput');
  if (!textarea) return;
  textarea.value = state.addressItems.map(a => a.raw).join('\n');
}

function renderAddressChips() {
  const chips = $('addressChips');
  if (!chips) return;

  const counter = $('addressCounter');
  if (counter) counter.textContent = `${state.addressItems.length} / ${MAX_ADDRESSES}`;

  if (state.addressItems.length === 0) {
    chips.innerHTML = '';
    return;
  }

  chips.innerHTML = state.addressItems.map((item, idx) => {
    const badge = item.type === 'solana' ? 'SOL' : item.type === 'evm' ? 'EVM' : 'Invalid';
    const cls = item.type === 'solana' ? 'solana' : item.type === 'evm' ? 'evm' : 'invalid';
    return `
      <div class="address-chip ${cls}" data-idx="${idx}" role="button" tabindex="0">
        <span class="chip-badge">${badge}</span>
        <span class="chip-text" title="${item.raw}">${shortenAddress(item.raw)}</span>
        <button class="chip-remove" type="button" data-action="remove" aria-label="Remove">×</button>
      </div>
    `;
  }).join('');
}

function setAddressItemsFromText(text, { showWarning = false } = {}) {
  const parsed = getAddressItemsFromText(text);
  state.addressItems = parsed.items;
  renderAddressChips();

  if (showWarning && parsed.truncated) {
    $('inputWarning')?.classList.remove('hidden');
  } else {
    $('inputWarning')?.classList.add('hidden');
  }

  persistAddressItems();
  updateTelegramMainButton();
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
    if (classified.type === 'solana') solana++;
    if (classified.type === 'evm') evm++;
  });

  $('solCount') && ($('solCount').textContent = String(solana));
  $('evmCount') && ($('evmCount').textContent = String(evm));
  $('lineNumbers') && ($('lineNumbers').innerHTML = lineNumbers.join('<br>'));

  setAddressItemsFromText(textarea.value);
}

// API Integration (via your backend proxy)
const API = {
  birdeye: '/api/birdeye',
};

async function birdeyeRequest(path, params = {}, { signal } = {}) {
  const url = new URL(API.birdeye, window.location.origin);
  url.searchParams.set('path', path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), signal ? { signal } : undefined);
async function birdeyeRequest(path, params = {}, { signal } = {}) {
  const url = new URL(API.birdeye, window.location.origin);
  url.searchParams.set('path', path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), signal ? { signal } : undefined);

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { data = { success: false, message: text }; }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `API error: ${response.status}`);
  }

  return data;
} 

  if (!response.ok) {
    throw new Error(data?.message || `API error: ${response.status}`);
  }

  return data;
}

async function fetchWalletHoldings(wallet, chain, { signal } = {}) {
  const data = await birdeyeRequest('/wallet/v2/current-net-worth', {
    wallet_address: wallet,
    currency: 'usd',
    network: chain === 'evm' ? 'ethereum' : chain,
  }, { signal });

  return data?.data?.items || [];
}

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
  if (fill) fill.style.width = `${percent}%`;
}

function clearScanProgress() {
  const el = $('scanProgress');
  if (el) el.innerHTML = '';
}

function scanProgressRowId(wallet, chain) {
  try {
    return `scan-${btoa(`${chain}:${wallet}`)}`.replace(/=+$/g, '');
  } catch {
    return `scan-${chain}-${wallet}`;
  }
}

function upsertScanProgressItem(wallet, chain, index, total, status, extraClass = '') {
  const el = $('scanProgress');
  if (!el) return;

  const id = scanProgressRowId(wallet, chain);
  const existing = document.getElementById(id);
  const safeWallet = shortenAddress(wallet);
  const chainLabel = chain === 'solana' ? 'Solana' : 'EVM';
  const cls = `scan-progress-item ${extraClass}`.trim();
  const rowHtml = `
    <div class="${cls}" id="${id}">
      <div><strong>${index + 1}/${total}</strong> ${chainLabel} ${safeWallet}</div>
      <div>${status}</div>
    </div>
  `;

  if (existing) existing.outerHTML = rowHtml;
  else el.insertAdjacentHTML('beforeend', rowHtml);
}

function updateSummary() {
  $('totalValue') && ($('totalValue').textContent = formatCurrency(state.totalValue));
  $('walletCount') && ($('walletCount').textContent = `${state.wallets.length} wallet${state.wallets.length !== 1 ? 's' : ''}`);
  $('tokenCount') && ($('tokenCount').textContent = String(state.holdings.length));

  const chains = new Set(state.holdings.map(h => h.chain));
  $('chainCount') && ($('chainCount').textContent = String(chains.size));

  const largest = state.holdings.reduce((max, h) => (h.value > max.value ? h : max), { value: 0, symbol: '—' });
  $('largestHolding') && ($('largestHolding').textContent = largest.symbol || '—');
  $('largestValue') && ($('largestValue').textContent = formatCurrency(largest.value || 0));
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

function renderHoldingsTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  if (state.viewMode === 'byWallet') {
    const rows = [];
    const searchTerm = ($('searchInput')?.value || '').toLowerCase();
    const hideDust = $('hideDust')?.checked ?? true;
    const walletKeys = Array.from(state.walletHoldings.keys()).sort();

    walletKeys.forEach(walletKey => {
      const [chain, wallet] = walletKey.split(':');
      const items = state.walletHoldings.get(walletKey) || [];
      const filtered = items
        .map(h => ({
          chain,
          wallet,
          address: h.address || h.token_address,
          symbol: h.symbol || '—',
          name: h.name || 'Unknown Token',
          logo: h.logo_uri || h.logoURI || h.icon || '',
          price: Number(h.price || h.priceUsd || h.price_usd || 0) || 0,
          balance: Number(h.amount || h.uiAmount || h.balance || 0) || 0,
          value: Number(h.value || h.valueUsd || 0) || 0,
        }))
        .filter(h => {
          if (hideDust && h.value < 1) return false;
          if (!searchTerm) return true;
          return h.symbol.toLowerCase().includes(searchTerm) || h.name.toLowerCase().includes(searchTerm) || h.address.toLowerCase().includes(searchTerm);
        });

      if (filtered.length === 0) return;
      rows.push(`
        <tr class="empty-row">
          <td colspan="5">
            <div class="empty-state">
              <div class="empty-text"><strong>${chain === 'solana' ? 'Solana' : 'EVM'}</strong> ${shortenAddress(wallet)}</div>
            </div>
          </td>
        </tr>
      `);

      filtered.forEach(h => {
        const key = `${h.chain}:${h.address}`;
        rows.push(`
          <tr class="holding-row" data-key="${key}">
            <td>
              <div class="token-cell">
                <img class="token-icon" src="${h.logo}" onerror="this.src=''; this.style.opacity='0.3'" alt="">
                <div class="token-info">
                  <div class="token-symbol">${h.symbol}</div>
                  <div class="token-name">${h.name}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="chain-badge-small ${h.chain}">${h.chain === 'solana' ? 'SOL' : 'EVM'}</span>
            </td>
            <td class="mono">${formatNumber(h.balance)}</td>
            <td class="mono">${formatCurrency(h.price)}</td>
            <td class="mono"><strong>${formatCurrency(h.value)}</strong></td>
          </tr>
        `);
      });
    });

    tbody.innerHTML = rows.length ? rows.join('') : `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-text">No holdings match your filters</div>
          </div>
        </td>
      </tr>
    `;
    $('tableStats') && ($('tableStats').textContent = `By wallet view • Total value: ${formatCurrency(state.totalValue)}`);
    return;
  }

  const searchTerm = ($('searchInput')?.value || '').toLowerCase();
  const hideDust = $('hideDust')?.checked ?? true;
  const sortBy = $('sortSelect')?.value || 'valueDesc';

  let filtered = state.holdings.filter(h => {
    if (hideDust && h.value < 1) return false;
    if (!searchTerm) return true;
    return h.symbol.toLowerCase().includes(searchTerm) || h.name.toLowerCase().includes(searchTerm) || h.address.toLowerCase().includes(searchTerm);
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'valueAsc': return a.value - b.value;
      case 'nameAsc': return a.name.localeCompare(b.name);
      case 'chain': return a.chain.localeCompare(b.chain);
      case 'valueDesc':
      default:
        return b.value - a.value;
    }
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-text">No holdings match your filters</div>
          </div>
        </td>
      </tr>
    `;
    $('tableStats') && ($('tableStats').textContent = 'Showing 0 tokens');
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
        <span class="chain-badge-small ${holding.chain}">${holding.chain === 'solana' ? 'SOL' : 'EVM'}</span>
      </td>
      <td class="mono">${formatNumber(holding.balance)}</td>
      <td class="mono">${formatCurrency(holding.price)}</td>
      <td class="mono"><strong>${formatCurrency(holding.value)}</strong></td>
    </tr>
  `).join('');

  $('tableStats') && ($('tableStats').textContent = `Showing ${filtered.length} tokens • Total value: ${formatCurrency(filtered.reduce((s, h) => s + h.value, 0))}`);
}

function recomputeAggregatesAndRender() {
  const holdingsMap = new Map();
  const wallets = [];
  let total = 0;

  state.walletHoldings.forEach((items, walletKey) => {
    const [chain, wallet] = walletKey.split(':');
    wallets.push({ address: wallet, chain, count: items.length });

    items.forEach(holding => {
      const tokenAddress = holding.address || holding.token_address;
      const key = `${chain}:${tokenAddress}`;
      const value = Number(holding.value || holding.valueUsd || 0) || 0;
      const amount = Number(holding.amount || holding.uiAmount || holding.balance || 0) || 0;

      if (holdingsMap.has(key)) {
        const existing = holdingsMap.get(key);
        existing.value += value;
        existing.balance += amount;
        existing.sources.push(wallet);
      } else {
        holdingsMap.set(key, {
          key,
          chain,
          address: tokenAddress,
          symbol: holding.symbol || '—',
          name: holding.name || 'Unknown Token',
          logo: holding.logo_uri || holding.logoURI || holding.icon || '',
          price: Number(holding.price || holding.priceUsd || holding.price_usd || 0) || 0,
          balance: amount,
          value: value,
          sources: [wallet],
        });
      }
      total += value;
    });
  });

  state.holdings = Array.from(holdingsMap.values());
  state.wallets = wallets;
  state.totalValue = total;

  updateSummary();
  renderHoldingsTable();
  renderWalletList();
}

async function scanWallets() {
  if (state.scanning) return;

  const valid = state.addressItems.filter(a => a.type === 'solana' || a.type === 'evm');
  if (valid.length === 0) {
    showStatus('Please enter at least one valid wallet address', 'error');
    hapticFeedback('error');
    return;
  }

  const solanaWallets = valid.filter(a => a.type === 'solana').map(a => a.raw);
  const evmWallets = valid.filter(a => a.type === 'evm').map(a => a.raw);
  const walletsQueue = [
    ...solanaWallets.map(w => ({ wallet: w, chain: 'solana' })),
    ...evmWallets.map(w => ({ wallet: w, chain: 'evm' })),
  ];

  $('resultsSection')?.classList.remove('hidden');

  state.scanning = true;
  state.walletHoldings = new Map();
  state.scanAbortController = new AbortController();
  updateTelegramMainButton();

  const scanButton = $('scanButton');
  if (scanButton) {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="btn-icon">⏳</span><span>Scanning...</span>';
  }

  clearScanProgress();
  $('cancelScanButton')?.classList.remove('hidden');
  showStatus('Starting scan...', 'info');
  updateProgress(0);

  const totalWallets = walletsQueue.length;
  const signal = state.scanAbortController.signal;

  for (let i = 0; i < walletsQueue.length; i++) {
    const { wallet, chain } = walletsQueue[i];
    if (signal.aborted) break;

    upsertScanProgressItem(wallet, chain, i, totalWallets, 'fetching portfolio…');
    showStatus(`Scanning wallet ${i + 1}/${totalWallets}...`, 'info');
    updateProgress((i / Math.max(totalWallets, 1)) * 100);

    try {
      const holdings = await fetchWalletHoldings(wallet, chain, { signal });
      state.walletHoldings.set(`${chain}:${wallet}`, holdings);
      upsertScanProgressItem(wallet, chain, i, totalWallets, 'done', 'done');
      recomputeAggregatesAndRender();
    } catch (error) {
      if (!signal.aborted) {
        upsertScanProgressItem(wallet, chain, i, totalWallets, 'failed', 'error');
      }
    }
  }

  state.scanning = false;
  state.scanAbortController = null;

  if (scanButton) {
    scanButton.disabled = false;
    scanButton.innerHTML = '<span>Lets Looky!</span>';
  }

  $('cancelScanButton')?.classList.add('hidden');
  updateProgress(100);

  if (signal.aborted) {
    showStatus('Scan cancelled', 'info');
  } else {
    showStatus(`Scan complete! Found ${state.holdings.length} tokens across ${state.wallets.length} wallets`, 'success');
    hapticFeedback('success');
  }

  updateTelegramMainButton();

  setTimeout(() => {
    $('scanStatus')?.classList.add('hidden');
  }, 3000);
}

function openTokenModal(key) {
  const holding = state.holdings.find(h => h.key === key);
  if (!holding) return;

  state.activeHolding = holding;
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
  $('modalExplorerLink') && ($('modalExplorerLink').href = explorerUrl);

  const chartUrl = `https://birdeye.so/token/${holding.address}?chain=${holding.chain === 'solana' ? 'solana' : 'ethereum'}`;
  $('modalChartLink') && ($('modalChartLink').href = chartUrl);

  const sourceWallet = holding.sources?.[0] || '';
  const walletUrl = holding.chain === 'solana'
    ? `https://solscan.io/account/${sourceWallet}`
    : `https://etherscan.io/address/${sourceWallet}`;

  const modalWalletLink = $('modalWalletLink');
  if (modalWalletLink) {
    if (sourceWallet) {
      modalWalletLink.href = walletUrl;
      modalWalletLink.classList.remove('hidden');
    } else {
      modalWalletLink.href = '#';
      modalWalletLink.classList.add('hidden');
    }
  }

  $('tokenModal')?.classList.remove('hidden');

  if (isTelegram()) {
    TG.BackButton.show();
    TG.BackButton.onClick(closeTokenModal);
  }
}

function closeTokenModal() {
  $('tokenModal')?.classList.add('hidden');
  state.activeHolding = null;

  if (isTelegram()) {
    TG.BackButton.hide();
    TG.BackButton.offClick(closeTokenModal);
  }
}

function setupEyeTracking() {
  const pupils = document.querySelectorAll('.pupil');
  if (!pupils.length) return;

  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let typingTargetX = null;
  let typingTargetY = null;
  let isTyping = false;
  let typingTimeout = null;

  document.addEventListener('mousemove', (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    isTyping = false;
  });

  document.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
      cursorX = e.touches[0].clientX;
      cursorY = e.touches[0].clientY;
      isTyping = false;
    }
  });

  const addressInput = $('addressInput');
  if (addressInput) {
    addressInput.addEventListener('focus', () => {
      isTyping = true;
      updateTypingTarget(addressInput);
    });

    addressInput.addEventListener('blur', () => {
      isTyping = false;
      typingTargetX = null;
      typingTargetY = null;
    });

    addressInput.addEventListener('input', () => {
      isTyping = true;
      const caretPos = addressInput.selectionStart;
      updateTypingTarget(addressInput, caretPos);

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
      }, 1000);
    });

    addressInput.addEventListener('click', (e) => {
      isTyping = true;
      const rect = addressInput.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      const text = addressInput.value;
      const avgCharWidth = getAverageCharWidth(addressInput);
      const estimatedPos = Math.floor(clickX / avgCharWidth);
      updateTypingTarget(addressInput, Math.min(estimatedPos, text.length));
    });

    addressInput.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        isTyping = true;
        updateTypingTarget(addressInput, addressInput.selectionStart);
      }
    });
  }

  function getAverageCharWidth(textarea) {
    const testText = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(textarea);
    context.font = computedStyle.font;
    const metrics = context.measureText(testText);
    return metrics.width / testText.length;
  }

  function updateTypingTarget(textarea, caretPosition = null) {
    if (!textarea) return;

    const rect = textarea.getBoundingClientRect();
    const text = textarea.value;
    if (caretPosition === null) caretPosition = text.length;

    const textBeforeCaret = text.substring(0, caretPosition);
    const avgCharWidth = getAverageCharWidth(textarea);
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight);
    const lines = textBeforeCaret.split('\n');
    const currentLine = lines.length - 1;
    const charsInCurrentLine = lines[currentLine].length;
    const xOffset = charsInCurrentLine * avgCharWidth;
    const yOffset = currentLine * lineHeight;

    typingTargetX = rect.left + 70 + xOffset;
    typingTargetY = rect.top + 16 + yOffset;
  }

  function animateEyes() {
    const targetX = (isTyping && typingTargetX && typingTargetY) ? typingTargetX : cursorX;
    const targetY = (isTyping && typingTargetX && typingTargetY) ? typingTargetY : cursorY;

    pupils.forEach((pupil) => {
      const eye = pupil.closest('.eye');
      if (!eye) return;

      const rect = eye.getBoundingClientRect();
      const eyeX = rect.left + rect.width / 2;
      const eyeY = rect.top + rect.height / 2;

      const dx = targetX - eyeX;
      const dy = targetY - eyeY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxMove = 8;
      const moveFactor = Math.min(distance / 100, 1);
      const moveDistance = maxMove * moveFactor;
      const jitter = isTyping ? 0.1 : 0.3;
      const jitterX = (Math.random() - 0.5) * jitter;
      const jitterY = (Math.random() - 0.5) * jitter;
      const angle = Math.atan2(dy, dx);
      const moveX = Math.cos(angle) * moveDistance + jitterX;
      const moveY = Math.sin(angle) * moveDistance + jitterY;

      pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
    });

    requestAnimationFrame(animateEyes);
  }

  animateEyes();
}

function setupEventListeners() {
  const addressInput = $('addressInput');
  if (addressInput) {
    addressInput.addEventListener('input', scheduleAddressStatsUpdate);
    addressInput.addEventListener('paste', () => {
      setTimeout(() => {
        $('inputWarning')?.classList.add('hidden');
        scheduleAddressStatsUpdate();
        const parsed = getAddressItemsFromText(addressInput.value);
        if (parsed.truncated) {
          setAddressItemsFromText(addressInput.value, { showWarning: true });
          syncTextareaFromAddressItems();
          scheduleAddressStatsUpdate();
        }
      }, 10);
    });
  }

  $('scanButton')?.addEventListener('click', scanWallets);

  $('cancelScanButton')?.addEventListener('click', () => {
    if (!state.scanning) return;
    state.scanAbortController?.abort();
    hapticFeedback('light');
  });

  $('demoButton')?.addEventListener('click', () => {
    if (!addressInput) return;
    addressInput.value = `8X35rQUK2u9hfn8rMPwwr6ZSEUhbmfDPEapp589XyoM1\n0x742d35Cc6634C0532925a3b844Bc454e4438f44e`;
    scheduleAddressStatsUpdate();
    hapticFeedback('light');
  });

  $('clearInputBtn')?.addEventListener('click', () => {
    if (addressInput) addressInput.value = '';
    setAddressItemsFromText('');
    scheduleAddressStatsUpdate();
    hapticFeedback('light');
  });

  $('pasteBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (addressInput) addressInput.value = text;
      scheduleAddressStatsUpdate();
      hapticFeedback('light');
    } catch {
      showStatus('Unable to paste from clipboard', 'error');
      hapticFeedback('error');
    }
  });

  $('loadLastBtn')?.addEventListener('click', () => {
    const list = loadPersistedAddressItems();
    if (!list || list.length === 0) {
      showStatus('No saved addresses found', 'info');
      return;
    }
    if (addressInput) addressInput.value = list.join('\n');
    setAddressItemsFromText((addressInput && addressInput.value) || '', { showWarning: true });
    scheduleAddressStatsUpdate();
    hapticFeedback('light');
  });

  $('addressChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.address-chip');
    if (!chip) return;
    const idx = Number(chip.dataset.idx);
    if (!Number.isFinite(idx)) return;

    if (e.target?.dataset?.action === 'remove') {
      state.addressItems.splice(idx, 1);
      syncTextareaFromAddressItems();
      renderAddressChips();
      scheduleAddressStatsUpdate();
      persistAddressItems();
      updateTelegramMainButton();
      hapticFeedback('light');
      return;
    }

    const current = state.addressItems[idx]?.raw;
    if (!current) return;
    const next = prompt('Edit address', current);
    if (next === null) return;
    const parsed = getAddressItemsFromText(next);
    state.addressItems[idx] = parsed.items[0] || { raw: next, type: 'invalid', normalized: next };
    syncTextareaFromAddressItems();
    renderAddressChips();
    scheduleAddressStatsUpdate();
    persistAddressItems();
    updateTelegramMainButton();
  });

  $('viewAggregate')?.addEventListener('click', () => {
    state.viewMode = 'aggregate';
    $('viewAggregate')?.classList.add('active');
    $('viewByWallet')?.classList.remove('active');
    renderHoldingsTable();
  });

  $('viewByWallet')?.addEventListener('click', () => {
    state.viewMode = 'byWallet';
    $('viewByWallet')?.classList.add('active');
    $('viewAggregate')?.classList.remove('active');
    renderHoldingsTable();
  });

  $('searchInput')?.addEventListener('input', renderHoldingsTable);
  $('sortSelect')?.addEventListener('change', renderHoldingsTable);
  $('hideDust')?.addEventListener('change', renderHoldingsTable);

  $('tableBody')?.addEventListener('click', (e) => {
    const row = e.target.closest('.holding-row');
    if (row) openTokenModal(row.dataset.key);
  });

  $('closeModal')?.addEventListener('click', closeTokenModal);
  $('modalBackdrop')?.addEventListener('click', closeTokenModal);

  $('closeExamples')?.addEventListener('click', () => $('examplesModal')?.classList.add('hidden'));
  $('examplesBackdrop')?.addEventListener('click', () => $('examplesModal')?.classList.add('hidden'));

  $('copyAddress')?.addEventListener('click', () => {
    const address = $('modalFullAddress')?.textContent || '';
    navigator.clipboard.writeText(address).then(() => {
      showStatus('Address copied to clipboard', 'success');
      hapticFeedback('success');
    });
  });

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

function setupTelegram() {
  if (!isTelegram()) return;

  TG.ready();
  TG.expand?.();

  applyTelegramTheme();
  TG.onEvent('themeChanged', applyTelegramTheme);

  TG.MainButton.onClick(scanWallets);
  updateTelegramMainButton();

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

async function initialize() {
  setupTelegram();
  setupEyeTracking();
  setupEventListeners();

  const saved = loadPersistedAddressItems();
  if (saved && saved.length) {
    const textarea = $('addressInput');
    if (textarea) textarea.value = saved.join('\n');
  }

  updateAddressStats();
  updateTelegramMainButton();

  setTimeout(() => {
    showStatus('Paste wallet addresses above to get started', 'info');
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}