// Looky - Modern Crypto Portfolio Viewerhhg
// Enhanced UI with smooth animations and better UX

const $ = (id) => document.getElementById(id);

const MAX_ADDRESSES = 20;
const STORAGE_KEY_ADDRESSES = 'looky.addresses.v1';

const HOLDINGS_PAGE_SIZE = 5;

let holdingsRenderQueued = false;
function scheduleRenderHoldingsTable() {
  if (holdingsRenderQueued) return;
  holdingsRenderQueued = true;
  requestAnimationFrame(() => {
    holdingsRenderQueued = false;
    renderHoldingsTable();
  });
}

const state = {
  wallets: [],
  holdings: [],
  scanning: false,
  totalValue: 0,
  totalSolValue: 0,
  totalEvmValue: 0,
  totalChangeSolUsd: 0,
  totalChangeEvmUsd: 0,
  addressItems: [],
  viewMode: 'aggregate',
  scanAbortController: null,
  walletHoldings: new Map(),
  walletDayChange: new Map(),
  holdingsPage: 1,
  activeHolding: null,
};

function setHoldingsPage(page) {
  const p = Number(page);
  state.holdingsPage = Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

const mcapCache = new Map();
const MCAP_CACHE_TTL_MS = 10 * 60 * 1000;
const MCAP_MAX_LOOKUPS_PER_RENDER = 80;
const MCAP_CONCURRENCY = 4;

let statusHideTimer = null;

// Telegram Integration
const TG = (() => {
  try { return window.Telegram?.WebApp || null; } catch { return null; }
})();

const isTelegram = () => !!TG && typeof TG.ready === 'function';

function tgIsAtLeast(version) {
  if (!isTelegram()) return false;
  try {
    if (typeof TG.isVersionAtLeast === 'function') return TG.isVersionAtLeast(version);
    // If the SDK can't tell us, assume "supported" and rely on try/catch.
    return true;
  } catch {
    return false;
  }
}

function applyTelegramTheme() {
  if (!isTelegram()) return;

  const p = TG.themeParams || {};
  const root = document.documentElement;

  if (p.bg_color) root.style.setProperty('--bg-primary', p.bg_color);
  if (p.text_color) root.style.setProperty('--text-primary', p.text_color);
  if (p.hint_color) root.style.setProperty('--text-secondary', p.hint_color);
  if (p.link_color) root.style.setProperty('--text-accent', p.link_color);

  try {
    if (tgIsAtLeast('6.1')) {
      TG.setHeaderColor?.('secondary_bg_color');
      TG.setBackgroundColor?.(p.bg_color || '#0A0B14');
    }
  } catch {}
}

function hapticFeedback(type = 'light') {
  if (!isTelegram() || !TG.HapticFeedback) return;
  if (!tgIsAtLeast('6.1')) return;

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
  if (!address) return address;
  if (address.length <= 4) return address;
  return address.slice(-4);
}

function formatCurrency(value) {
  const num = Number(value);
  if (!isFinite(num)) return '$0.00';

  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(value) {
  const v = Number(value || 0);
  if (!Number.isFinite(v)) return '$0.00';
  if (v === 0) return '$0.00';
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function tokenIconDataUri(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  const label = (s.match(/[A-Z0-9]/g) || []).slice(0, 3).join('') || '•';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#00c2ff" stop-opacity="0.9"/>
          <stop offset="1" stop-color="#ffd400" stop-opacity="0.9"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx="14" fill="url(#g)"/>
      <rect x="4" y="4" width="56" height="56" rx="12" fill="rgba(255,255,255,0.60)"/>
      <text x="32" y="38" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="18" font-weight="900" fill="#0b0b10">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getTokenIconUrl(logoUrl, symbol) {
  const url = String(logoUrl || '').trim();
  return url ? url : tokenIconDataUri(symbol);
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

function setAddressItems(items, { showWarning = false } = {}) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ADDRESSES) : [];
  const truncated = Array.isArray(items) ? items.length > MAX_ADDRESSES : false;

  state.addressItems = list;
  renderAddressChips();

  if (showWarning && truncated) {
    $('inputWarning')?.classList.remove('hidden');
  } else {
    $('inputWarning')?.classList.add('hidden');
  }

  persistAddressItems();
  updateTelegramMainButton();
  updateAddressStats();
}

function renderAddressChips() {
  const chips = $('addressChips');
  if (!chips) return;

  if (state.addressItems.length === 0) {
    chips.innerHTML = '';
    return;
  }

  chips.innerHTML = state.addressItems.map((item, idx) => {
    const badge = item.type === 'solana' ? 'SOL' : item.type === 'evm' ? 'EVM' : 'Invalid';
    const cls = item.type === 'solana' ? 'solana' : item.type === 'evm' ? 'evm' : 'invalid';
    const isNew = !!state._lastAddedNormalized && (item.normalized || item.raw) === state._lastAddedNormalized;
    return `
      <div class="address-chip ${cls}${isNew ? ' chip-new' : ''}" data-idx="${idx}" role="button" tabindex="0">
        <span class="chip-badge">${badge}</span>
        <span class="chip-text" title="${item.raw}">${shortenAddress(item.raw)}</span>
        <button class="chip-remove" type="button" data-action="remove" aria-label="Remove">×</button>
      </div>
    `;
  }).join('');

  if (state._lastAddedNormalized) state._lastAddedNormalized = null;
}

function updateAddressStats() {
  let solana = 0;
  let evm = 0;

  state.addressItems.forEach(item => {
    if (item.type === 'solana') solana++;
    if (item.type === 'evm') evm++;
  });

  const hasAny = state.addressItems.length > 0;
  $('inputHeader')?.classList.toggle('hidden', !hasAny);
  $('chainBadges')?.classList.toggle('hidden', !hasAny);

  $('solCount') && ($('solCount').textContent = String(solana));
  $('evmCount') && ($('evmCount').textContent = String(evm));

  const counter = $('addressCounter');
  if (counter) {
    counter.classList.toggle('hidden', !hasAny);
    counter.textContent = `${state.addressItems.length} / ${MAX_ADDRESSES}`;
  }
}

function addWalletFromInput() {
  const input = $('addressInput');
  const wrap = input?.closest('.address-entry');
  if (!input) return;

  const raw = String(input.value || '').trim();
  if (!raw) {
    wrap?.classList.remove('shake');
    void wrap?.offsetWidth;
    wrap?.classList.add('shake');
    hapticFeedback('light');
    return;
  }

  if (state.addressItems.length >= MAX_ADDRESSES) {
    $('inputWarning')?.classList.remove('hidden');
    wrap?.classList.remove('shake');
    void wrap?.offsetWidth;
    wrap?.classList.add('shake');
    hapticFeedback('error');
    return;
  }

  const classified = classifyAddress(raw);
  const isValid = classified.type === 'solana' || classified.type === 'evm';
  if (!isValid) {
    wrap?.classList.remove('shake');
    void wrap?.offsetWidth;
    wrap?.classList.add('shake');
    showInputHint('Invalid wallet address', 'error');
    hapticFeedback('error');
    return;
  }

  const normalized = classified.value || raw;
  const exists = state.addressItems.some(a => (a.normalized || a.raw) === normalized);
  if (exists) {
    wrap?.classList.remove('shake');
    void wrap?.offsetWidth;
    wrap?.classList.add('shake');
    showInputHint('Address already added', 'info');
    hapticFeedback('light');
    return;
  }

  state._lastAddedNormalized = normalized;
  state.addressItems.push({ raw, type: classified.type, normalized });
  $('inputWarning')?.classList.add('hidden');
  persistAddressItems();
  renderAddressChips();
  updateAddressStats();
  updateTelegramMainButton();

  input.value = '';
  input.focus();
  hapticFeedback('success');
}

function showInputHint(message, type = 'info') {
  const hint = $('inputHint');
  if (!hint) return;

  const msg = String(message || '').trim();
  if (!msg) {
    hint.textContent = '';
    hint.classList.add('hidden');
    hint.classList.remove('error');
    return;
  }

  hint.textContent = msg;
  hint.classList.toggle('error', type === 'error');
  hint.classList.remove('hidden');

  window.clearTimeout(showInputHint._t);
  showInputHint._t = window.setTimeout(() => {
    hint.textContent = '';
    hint.classList.add('hidden');
    hint.classList.remove('error');
  }, 2400);
}

// API Integration (via your backend proxy)
const API = {
  birdeye: '/api/birdeye',
  zerion: '/api/zerion',
};

// Single, correct birdeyeRequest (your file currently has a duplicate nested function)
async function birdeyeRequest(path, params = {}, { signal, headers } = {}) {
  const url = new URL(API.birdeye, window.location.origin);
  url.searchParams.set('path', path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length) {
      url.searchParams.set(key, String(value));
    }
  });

  const fetchOptions = {
    ...(signal ? { signal } : {}),
    ...(headers ? { headers } : {}),
  };

  const response = await fetch(url.toString(), Object.keys(fetchOptions).length ? fetchOptions : undefined);

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { data = { success: false, message: text }; }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `API error: ${response.status}`);
  }
  return data;
}

function birdeyeXChain(chain) {
  return chain === 'solana' ? 'solana' : 'ethereum';
}

async function fetchSolanaNetWorthChange(wallet, { signal } = {}) {
  const data = await birdeyeRequest('/wallet/v2/net-worth', {
    wallet: wallet,
    count: 7,
    direction: 'back',
    type: '1d',
    sort_type: 'desc',
  }, {
    signal,
    headers: {
      'x-chain': 'solana',
    },
  });

  const history = data?.data?.history;
  const first = Array.isArray(history) && history.length ? history[0] : null;
  return {
    changeUsd: Number(first?.net_worth_change ?? 0) || 0,
    changePct: Number(first?.net_worth_change_percent ?? 0) || 0,
  };
}

function isValidEvmContractAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || '').trim());
}

function extractEvmContractAddress(input) {
  const s = String(input || '').trim();
  const m = s.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : '';
}

function pickZerionContractAddress(fAttr) {
  const impl = Array.isArray(fAttr?.implementations) ? fAttr.implementations : [];
  const implAddress = impl.map(x => x?.address).find(a => isValidEvmContractAddress(a));
  if (implAddress) return String(implAddress);

  const direct = fAttr?.address || fAttr?.token_address || fAttr?.contract_address;
  const directExtracted = extractEvmContractAddress(direct);
  if (isValidEvmContractAddress(directExtracted)) return String(directExtracted);

  return '';
}

function normalizeEvmNetwork(input) {
  const s = String(input || '').toLowerCase().trim();
  if (!s) return '';
  if (s === 'ethereum' || s === 'eth') return 'ethereum';
  if (s === 'bsc' || s === 'binance-smart-chain' || s === 'bnb' || s === 'binance') return 'bsc';
  if (s === 'arbitrum' || s === 'arbitrum-one' || s === 'arb') return 'arbitrum';
  if (s === 'optimism' || s === 'op') return 'optimism';
  if (s === 'polygon' || s === 'matic') return 'polygon';
  if (s === 'base') return 'base';
  if (s === 'avalanche' || s === 'avax') return 'avalanche';
  if (s === 'fantom' || s === 'ftm') return 'fantom';
  if (s === 'gnosis' || s === 'xdai') return 'gnosis';
  return s;
}

function evmNetworkLabel(network) {
  switch (normalizeEvmNetwork(network)) {
    case 'ethereum': return 'ETH';
    case 'bsc': return 'BNB';
    case 'arbitrum': return 'ARB';
    case 'optimism': return 'OP';
    case 'polygon': return 'POLY';
    case 'base': return 'BASE';
    case 'avalanche': return 'AVAX';
    case 'fantom': return 'FTM';
    case 'gnosis': return 'GNO';
    default: return 'EVM';
  }
}

function evmExplorerBase(network) {
  switch (normalizeEvmNetwork(network)) {
    case 'ethereum': return 'https://etherscan.io';
    case 'bsc': return 'https://bscscan.com';
    case 'arbitrum': return 'https://arbiscan.io';
    case 'optimism': return 'https://optimistic.etherscan.io';
    case 'polygon': return 'https://polygonscan.com';
    case 'base': return 'https://basescan.org';
    case 'avalanche': return 'https://snowtrace.io';
    case 'fantom': return 'https://ftmscan.com';
    case 'gnosis': return 'https://gnosisscan.io';
    default: return 'https://etherscan.io';
  }
}

async function fetchTokenOverview(address, chain, { signal } = {}) {
  const data = await birdeyeRequest('/defi/token_overview', {
    address,
    ui_amount_mode: 'scaled',
  }, {
    signal,
    headers: {
      'x-chain': birdeyeXChain(chain),
    },
  });

  return data?.data || null;
}

async function getTokenMcap(address, chain, { signal } = {}) {
  const cacheKey = `${chain}:${address}`;
  const cached = mcapCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < MCAP_CACHE_TTL_MS) {
    return cached.mcap;
  }

  try {
    const overview = await fetchTokenOverview(address, chain, { signal });
    const mcap = Number(
      overview?.marketCap ??
      overview?.market_cap ??
      overview?.marketcap ??
      overview?.fdv ??
      overview?.fdv_usd ??
      0
    ) || 0;

    mcapCache.set(cacheKey, { mcap, ts: Date.now() });
    return mcap;
  } catch {
    mcapCache.set(cacheKey, { mcap: 0, ts: Date.now() });
    return 0;
  }
}

function enrichHoldingsWithMcap(holdings, { signal } = {}) {
  const candidates = holdings
    .filter(h => h && h.address && h.chain)
    .filter(h => h.chain !== 'evm' || isValidEvmContractAddress(h.address))
    .filter(h => !h.mcap || h.mcap <= 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, MCAP_MAX_LOOKUPS_PER_RENDER);

  if (candidates.length === 0) return;

  let idx = 0;
  let renderQueued = false;
  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    window.setTimeout(() => {
      renderQueued = false;
      scheduleRenderHoldingsTable();
    }, 150);
  };

  const worker = async () => {
    while (idx < candidates.length) {
      const current = candidates[idx++];
      if (!current) continue;
      if (signal?.aborted) return;

      const mcap = await getTokenMcap(current.address, current.chain, { signal });
      if (signal?.aborted) return;

      if (mcap && mcap > 0) {
        current.mcap = mcap;
        queueRender();
      }
    }
  };

  for (let i = 0; i < MCAP_CONCURRENCY; i++) {
    worker();
  }
}

async function fetchWalletHoldings(wallet, chain, { signal } = {}) {
  if (chain === 'evm') {
    const url = new URL(API.zerion, window.location.origin);
    url.searchParams.set('address', wallet);
    url.searchParams.set('filter[positions]', 'only_simple');
    url.searchParams.set('filter[trash]', 'only_non_trash');
    url.searchParams.set('currency', 'usd');
    url.searchParams.set('sort', 'value');
    url.searchParams.set('sync', 'false');

    const response = await fetch(url.toString(), signal ? { signal } : undefined);

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = null; }

    if (!response.ok) {
      const msg = data?.errors?.[0]?.detail || data?.message || `Zerion error: ${response.status}`;
      throw new Error(msg);
    }

    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.map((row) => {
      const attrs = row?.attributes || {};
      const quantity = attrs?.quantity || {};
      const fungible = attrs?.fungible_info || {};
      const implementations = Array.isArray(fungible?.implementations) ? fungible.implementations : [];
      const changes = attrs?.changes || {};

      const chainId = String(row?.relationships?.chain?.data?.id || 'ethereum');
      const implForChain = implementations.find(x => String(x?.chain_id) === chainId);
      const contractAddress = extractEvmContractAddress(implForChain?.address || '') || '';

      // native assets have null address; keep a stable key for rendering
      const tokenAddress = contractAddress || `native:${chainId}:${String(fungible?.symbol || 'NATIVE')}`;

      const amount = Number(quantity?.float ?? quantity?.numeric ?? 0) || 0;
      const valueUsd = Number(attrs?.value ?? 0) || 0;
      const priceUsd = Number(attrs?.price ?? 0) || 0;
      const changeUsd = Number(changes?.absolute_1d ?? 0) || 0;
      const changePct = Number(changes?.percent_1d ?? 0) || 0;

      return {
        address: tokenAddress,
        token_address: tokenAddress,
        contract_address: contractAddress,
        symbol: String(fungible?.symbol || '—'),
        name: String(fungible?.name || 'Unknown Token'),
        logo_uri: String(fungible?.icon?.url || ''),
        price: priceUsd,
        value: valueUsd,
        amount,
        chain: chainId,
        network: normalizeEvmNetwork(chainId),
        changeUsd,
        changePct,
      };
    });
  }

  const data = await birdeyeRequest('/wallet/v2/current-net-worth', {
    // Birdeye expects `wallet`
    wallet: wallet,

    // keep this too (harmless) in case you use other endpoints later
    wallet_address: wallet,

    currency: 'usd',

    // Birdeye expects `chain` (not network)
    chain: 'solana',
  }, { signal });

  return data?.data?.items || [];
}

function showStatus(message, type = 'info') {
  const status = $('scanStatus');
  const content = $('statusContent');
  if (!status || !content) return;

  if (type !== 'error') {
    status.classList.add('hidden');
    return;
  }

  status.classList.remove('hidden');
  content.textContent = message;
  content.className = 'status-content';
  content.classList.add(type);

  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }

  if (!state.scanning) {
    statusHideTimer = setTimeout(() => {
      status.classList.add('hidden');
      statusHideTimer = null;
    }, 5000);
  }
}

function setScanningUi(active) {
  document.body.classList.toggle('is-scanning', !!active);
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
  const chainLabel = chain === 'solana' ? 'Solana' : evmNetworkLabel(chain);
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
  const walletCount = (state.walletHoldings && typeof state.walletHoldings.size === 'number')
    ? state.walletHoldings.size
    : Array.isArray(state.wallets)
      ? state.wallets.length
      : 0;
  $('walletCount') && ($('walletCount').textContent = `${walletCount} wallet${walletCount === 1 ? '' : 's'}`);

  const totalChangeEl = $('totalChange');
  if (totalChangeEl) {
    const total = Number(state.totalValue || 0) || 0;
    const change = (Number(state.totalChangeSolUsd || 0) || 0) + (Number(state.totalChangeEvmUsd || 0) || 0);
    const base = Math.max(0, total - change);
    const pct = base > 0 ? (change / base) * 100 : 0;

    if (!Number.isFinite(pct) || Math.abs(pct) < 0.0001) {
      totalChangeEl.classList.add('hidden');
      totalChangeEl.classList.remove('positive', 'negative');
    } else {
      totalChangeEl.classList.remove('hidden');
      totalChangeEl.classList.toggle('positive', pct > 0);
      totalChangeEl.classList.toggle('negative', pct < 0);
      const arrow = pct > 0 ? '▲' : '▼';
      totalChangeEl.textContent = `${arrow} ${Math.abs(pct).toFixed(2)}%`;
    }
  }
  $('tokenCount') && ($('tokenCount').textContent = String(state.holdings.length));

  const chains = new Set(state.holdings.map(h => h.chain));
  $('chainCount') && ($('chainCount').textContent = String(chains.size));

  const largest = state.holdings.reduce((max, h) => (h.value > max.value ? h : max), { value: 0, symbol: '—' });
  $('largestHolding') && ($('largestHolding').textContent = largest.symbol || '—');
  $('largestValue') && ($('largestValue').textContent = formatCurrency(largest.value || 0));
}

function renderHoldingsTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  const exportBtn = $('exportButton');
  if (exportBtn) exportBtn.disabled = state.holdings.length === 0;

  state.viewMode = 'aggregate';

  const useCardRows = isTelegram() || window.matchMedia('(max-width: 640px)').matches;
  document.body.classList.toggle('holdings-cards', useCardRows);

  const showSkeleton = state.scanning && state.walletHoldings.size === 0;
  if (showSkeleton) {
    const rows = Array.from({ length: 6 }).map(() => {
      if (!useCardRows) {
        return `
          <tr class="skeleton-row">
            <td><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-30"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-50"></div></td>
          </tr>
        `;
      }

      return `
        <tr class="skeleton-row holding-card-row">
          <td colspan="5">
            <div class="holding-card">
              <div class="holding-card-header">
                <div class="token-cell">
                  <div class="skeleton-line w-40"></div>
                </div>
                <div class="skeleton-line w-30"></div>
              </div>
              <div class="holding-card-metrics">
                <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
                <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
                <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
                <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    tbody.innerHTML = rows;
    $('tableStats') && ($('tableStats').textContent = 'Loading holdings…');
    const pageIndicator = $('pageIndicator');
    if (pageIndicator) pageIndicator.textContent = 'Page 1 of 1';
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
      case 'mcapAsc': return (a.mcap || 0) - (b.mcap || 0);
      case 'nameAsc': return a.name.localeCompare(b.name);
      case 'mcapDesc': return (b.mcap || 0) - (a.mcap || 0);
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
    $('pageIndicator') && ($('pageIndicator').textContent = 'Page 1 of 1');
    $('pagePrev') && ($('pagePrev').disabled = true);
    $('pagePrev')?.classList?.add('hidden');
    $('pageNext') && ($('pageNext').disabled = true);
    return;
  }

  const totalItems = filtered.length;
  let filteredTotalValue = 0;
  for (let i = 0; i < filtered.length; i++) filteredTotalValue += Number(filtered[i]?.value || 0) || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / HOLDINGS_PAGE_SIZE));
  if ((state.holdingsPage || 1) > totalPages) setHoldingsPage(totalPages);
  const page = state.holdingsPage || 1;
  const startIdx = (page - 1) * HOLDINGS_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + HOLDINGS_PAGE_SIZE);

  const pageIndicator = $('pageIndicator');
  if (pageIndicator) pageIndicator.textContent = `Page ${page} of ${totalPages}`;
  const prevBtn = $('pagePrev');
  const nextBtn = $('pageNext');
  if (prevBtn) {
    prevBtn.disabled = page <= 1;
    prevBtn.classList.toggle('hidden', page <= 1);
  }
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  if (!useCardRows) {
    tbody.innerHTML = pageItems.map(holding => `
      <tr class="holding-row" data-key="${holding.key}">
        <td>
          <div class="token-cell">
            <img class="token-icon" src="${getTokenIconUrl(holding.logo, holding.symbol)}" onerror="this.onerror=null;this.src='${tokenIconDataUri(holding.symbol)}'" alt="">
            <div class="token-info">
              <div class="token-symbol">${holding.symbol}</div>
              <div class="token-name">${holding.name}</div>
            </div>
            <span class="chain-badge-small ${holding.chain}">${holding.chain === 'solana' ? 'SOL' : evmNetworkLabel(holding.network)}</span>
          </div>
        </td>
        <td>
          <strong class="mono">${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong>
        </td>
        <td class="mono"><strong>${formatNumber(holding.balance)}</strong></td>
        <td class="mono"><strong>${formatPrice(holding.price)}</strong></td>
        <td class="mono"><strong>${formatCurrency(holding.value)}</strong></td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = pageItems.map(holding => `
      <tr class="holding-row holding-card-row" data-key="${holding.key}">
        <td colspan="5">
          <div class="holding-card">
            <div class="holding-card-header">
              <div class="token-cell">
                <img class="token-icon" src="${getTokenIconUrl(holding.logo, holding.symbol)}" onerror="this.onerror=null;this.src='${tokenIconDataUri(holding.symbol)}'" alt="">
                <div class="token-info">
                  <div class="token-symbol">${holding.symbol}</div>
                  <div class="token-name">${holding.name}</div>
                </div>
              </div>
              <span class="chain-badge-small ${holding.chain}">${holding.chain === 'solana' ? 'SOL' : evmNetworkLabel(holding.network)}</span>
            </div>

            <div class="holding-card-metrics">
              <div class="holding-metric">
                <div class="holding-metric-label">Balance</div>
                <div class="holding-metric-value mono"><strong>${formatNumber(holding.balance)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">Price</div>
                <div class="holding-metric-value mono"><strong>${formatPrice(holding.price)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">Value</div>
                <div class="holding-metric-value mono"><strong>${formatCurrency(holding.value)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">MCap</div>
                <div class="holding-metric-value mono"><strong>${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  }

  $('tableStats') && ($('tableStats').textContent = `Showing ${totalItems} tokens • Total value: ${formatCurrency(filteredTotalValue)}`);
}

function recomputeAggregatesAndRender() {
  const holdingsMap = new Map();
  const wallets = [];
  let total = 0;
  let totalSolValue = 0;
  let totalEvmValue = 0;
  let totalChangeSolUsd = 0;
  let totalChangeEvmUsd = 0;

  state.walletHoldings.forEach((items, walletKey) => {
    const [chain, wallet] = walletKey.split(':');
    wallets.push({ address: wallet, chain, count: items.length });

    const walletTotalValue = items.reduce((s, h) => s + (Number(h?.value || h?.valueUsd || 0) || 0), 0);
    if (chain === 'solana') totalSolValue += walletTotalValue;
    else totalEvmValue += walletTotalValue;

    if (chain === 'solana') {
      const ch = state.walletDayChange?.get(walletKey);
      totalChangeSolUsd += Number(ch?.changeUsd || 0) || 0;
    }

    items.forEach(holding => {
      const rawTokenAddress = holding.address || holding.token_address;
      const contractAddress = holding.contract_address || holding.contractAddress || (chain === 'evm' ? extractEvmContractAddress(rawTokenAddress) : '');
      const tokenAddress = contractAddress || rawTokenAddress;
      const network = chain === 'evm' ? normalizeEvmNetwork(holding.chain || holding.network) : '';
      const key = `${chain}:${tokenAddress}`;
      const value = Number(holding.value || holding.valueUsd || 0) || 0;
      const amount = Number(holding.amount || holding.uiAmount || holding.balance || 0) || 0;
      const mcap = Number(holding.market_cap ?? holding.marketCap ?? holding.mc ?? holding.fdv ?? holding.fdv_usd ?? 0) || 0;
      const changeUsd = Number(holding.changeUsd ?? holding.change_usd ?? holding.change_1d_usd ?? holding.pnlUsd ?? 0) || 0;

      if (holdingsMap.has(key)) {
        const existing = holdingsMap.get(key);
        existing.value += value;
        existing.balance += amount;
        existing.mcap = Math.max(existing.mcap || 0, mcap);
        existing.changeUsd = (Number(existing.changeUsd || 0) || 0) + changeUsd;
        if (!existing.network && network) existing.network = network;
        existing.sources.push(wallet);
      } else {
        holdingsMap.set(key, {
          key,
          chain,
          address: tokenAddress,
          contractAddress: contractAddress,
          network: network,
          symbol: holding.symbol || '—',
          name: holding.name || 'Unknown Token',
          logo: holding.logo_uri || holding.logoURI || holding.icon || '',
          price: Number(holding.price || holding.priceUsd || holding.price_usd || 0) || 0,
          balance: amount,
          value: value,
          mcap: mcap,
          changeUsd: changeUsd,
          sources: [wallet],
        });
      }
      total += value;
      if (chain === 'evm') totalChangeEvmUsd += changeUsd;
    });
  });

  state.holdings = Array.from(holdingsMap.values());
  state.wallets = wallets;
  state.totalValue = total;
  state.totalSolValue = totalSolValue;
  state.totalEvmValue = totalEvmValue;
  state.totalChangeSolUsd = totalChangeSolUsd;
  state.totalChangeEvmUsd = totalChangeEvmUsd;

  setHoldingsPage(1);

  updateSummary();
  renderHoldingsTable();

  enrichHoldingsWithMcap(state.holdings, { signal: state.scanAbortController?.signal });
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

  document.body.classList.remove('ui-landing');
  document.body.classList.add('ui-results');
  $('inputSection')?.classList.add('is-minimized');
  document.body.classList.add('ui-reveal');
  window.setTimeout(() => document.body.classList.remove('ui-reveal'), 520);

  $('resultsSection')?.classList.remove('hidden');

  state.scanning = true;
  setScanningUi(true);
  state.walletHoldings = new Map();
  state.walletDayChange = new Map();
  state.scanAbortController = new AbortController();
  updateTelegramMainButton();

  const scanButton = $('scanButton');
  if (scanButton) {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="btn-icon"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span><span>Scanning...</span>';
  }

  clearScanProgress();
  $('cancelScanButton')?.classList.remove('hidden');
  showStatus('', 'info');
  updateProgress(0);

  const totalWallets = walletsQueue.length;
  const signal = state.scanAbortController.signal;

  for (let i = 0; i < walletsQueue.length; i++) {
    const { wallet, chain } = walletsQueue[i];
    if (signal.aborted) break;

    upsertScanProgressItem(wallet, chain, i, totalWallets, 'fetching portfolio…');
    updateProgress((i / Math.max(totalWallets, 1)) * 100);

    try {
      const holdings = await fetchWalletHoldings(wallet, chain, { signal });
      state.walletHoldings.set(`${chain}:${wallet}`, holdings);

      if (chain === 'solana') {
        try {
          const ch = await fetchSolanaNetWorthChange(wallet, { signal });
          state.walletDayChange.set(`${chain}:${wallet}`, ch);
        } catch {}
      }

      upsertScanProgressItem(wallet, chain, i, totalWallets, 'done', 'done');
      recomputeAggregatesAndRender();
    } catch (error) {
      if (!signal.aborted) {
        upsertScanProgressItem(wallet, chain, i, totalWallets, 'failed', 'error');
        const msg = error?.message ? String(error.message) : 'Unknown error';
        showStatus(`Failed to scan ${chain} wallet ${shortenAddress(wallet)}: ${msg}`, 'error');
        try { console.error('Scan wallet failed', { wallet, chain, error }); } catch {}
      }
    }
  }

  state.scanning = false;
  setScanningUi(false);
  state.scanAbortController = null;

  if (scanButton) {
    scanButton.disabled = false;
    scanButton.innerHTML = '<span>Lets Looky!</span>';
  }

  $('cancelScanButton')?.classList.add('hidden');
  updateProgress(100);

  if (signal.aborted) {
    showStatus('', 'info');
  } else {
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
    modalTokenIcon.onerror = null;
    modalTokenIcon.src = getTokenIconUrl(holding.logo, holding.symbol);
    modalTokenIcon.onerror = () => {
      modalTokenIcon.onerror = null;
      modalTokenIcon.src = tokenIconDataUri(holding.symbol);
    };
    modalTokenIcon.alt = holding.symbol;
  }
  if (modalTokenName) modalTokenName.textContent = `${holding.symbol} - ${holding.name}`;
  const displayAddress = (holding.chain === 'evm' && isValidEvmContractAddress(holding.contractAddress)) ? holding.contractAddress : holding.address;
  if (modalTokenAddress) modalTokenAddress.textContent = shortenAddress(displayAddress);
  if (modalTokenValue) modalTokenValue.textContent = formatCurrency(holding.value);
  if (modalTokenBalance) modalTokenBalance.textContent = formatNumber(holding.balance);
  if (modalTokenPrice) modalTokenPrice.textContent = formatPrice(holding.price);
  if (modalChainTag) modalChainTag.textContent = holding.chain === 'solana' ? 'Solana' : evmNetworkLabel(holding.network);
  if (modalFullAddress) modalFullAddress.textContent = displayAddress;

  const modalExplorerLink = $('modalExplorerLink');
  if (modalExplorerLink) {
    if (holding.chain === 'solana') {
      modalExplorerLink.href = `https://solscan.io/token/${holding.address}`;
      modalExplorerLink.classList.remove('hidden');
    } else if (isValidEvmContractAddress(displayAddress)) {
      modalExplorerLink.href = `${evmExplorerBase(holding.network)}/token/${displayAddress}`;
      modalExplorerLink.classList.remove('hidden');
    } else {
      modalExplorerLink.href = '#';
      modalExplorerLink.classList.add('hidden');
    }
  }

  const chartUrl = `https://birdeye.so/token/${holding.address}?chain=${holding.chain === 'solana' ? 'solana' : 'ethereum'}`;
  $('modalChartLink') && ($('modalChartLink').href = chartUrl);

  const sourceWallet = holding.sources?.[0] || '';
  const walletUrl = holding.chain === 'solana'
    ? `https://solscan.io/account/${sourceWallet}`
    : `${evmExplorerBase(holding.network)}/address/${sourceWallet}`;

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
  document.body.classList.add('modal-open');

  if (isTelegram()) {
    if (tgIsAtLeast('6.1')) {
      TG.BackButton.show();
      TG.BackButton.onClick(closeTokenModal);
    }
  }
}

function closeTokenModal() {
  $('tokenModal')?.classList.add('hidden');
  state.activeHolding = null;
  document.body.classList.remove('modal-open');

  if (isTelegram()) {
    if (tgIsAtLeast('6.1')) {
      TG.BackButton.hide();
      TG.BackButton.offClick(closeTokenModal);
    }
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
  let introActive = true;
  let introStart = performance.now();
  const INTRO_DURATION_MS = 2400;
  const INTRO_RADIUS_PX = 260;

  function startIntroLookAround() {
    introStart = performance.now();
    introActive = true;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    startIntroLookAround();
  });

  document.addEventListener('mousemove', (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    isTyping = false;
    introActive = false;
  });

  document.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
      cursorX = e.touches[0].clientX;
      cursorY = e.touches[0].clientY;
      isTyping = false;
      introActive = false;
    }
  });

  const addressInput = $('addressInput');
  if (addressInput) {
    addressInput.addEventListener('focus', () => {
      isTyping = true;
      introActive = false;
      updateTypingTarget(addressInput);
    });

    addressInput.addEventListener('blur', () => {
      isTyping = false;
      typingTargetX = null;
      typingTargetY = null;
    });

    addressInput.addEventListener('input', () => {
      isTyping = true;
      introActive = false;
      const caretPos = addressInput.selectionStart;
      updateTypingTarget(addressInput, caretPos);

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
      }, 1000);
    });

    addressInput.addEventListener('click', (e) => {
      isTyping = true;
      introActive = false;
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
        introActive = false;
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
    const now = performance.now();

    const introElapsed = now - introStart;
    const shouldRunIntro = introActive && introElapsed >= 0 && introElapsed < INTRO_DURATION_MS;

    const t = Math.max(0, Math.min(1, introElapsed / INTRO_DURATION_MS));

    const segment = Math.min(3, Math.floor(t * 4));
    const local = (t * 4) - segment;
    const movePortion = 0.72;
    const inMove = local < movePortion;
    const uRaw = inMove ? (local / movePortion) : 1;
    const u = uRaw < 0.5
      ? 4 * uRaw * uRaw * uRaw
      : 1 - Math.pow(-2 * uRaw + 2, 3) / 2;

    const baseAngle = (segment + u) * (Math.PI / 2);

    const wobblePhase = Math.max(0, local - movePortion);
    const wobbleT = wobblePhase / Math.max(1e-6, 1 - movePortion);
    const wobble = Math.sin(wobbleT * Math.PI * 2) * (1 - wobbleT);

    const introAngle = baseAngle + wobble * 0.22;
    const radiusWobble = 1 + wobble * 0.07;

    const introX = (window.innerWidth / 2) + Math.cos(introAngle) * INTRO_RADIUS_PX * radiusWobble;
    const introY = (window.innerHeight / 2) + Math.sin(introAngle) * INTRO_RADIUS_PX * radiusWobble;

    const targetX = shouldRunIntro
      ? introX
      : (isTyping && typingTargetX && typingTargetY) ? typingTargetX : cursorX;
    const targetY = shouldRunIntro
      ? introY
      : (isTyping && typingTargetX && typingTargetY) ? typingTargetY : cursorY;

    pupils.forEach((pupil) => {
      const eye = pupil.closest('.eye');
      if (!eye) return;

      const rect = eye.getBoundingClientRect();
      const eyeX = rect.left + rect.width / 2;
      const eyeY = rect.top + rect.height / 2;

      const dx = targetX - eyeX;
      const dy = targetY - eyeY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxMove = shouldRunIntro ? 16 : 8;
      const moveFactor = shouldRunIntro ? 1 : Math.min(distance / 100, 1);
      const moveDistance = maxMove * moveFactor;
      const jitter = shouldRunIntro ? 0 : (isTyping ? 0.1 : 0.3);
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
    addressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWalletFromInput();
      }
    });

    addressInput.addEventListener('input', () => {
      const wrap = addressInput.closest('.address-entry');
      wrap?.classList.remove('shake');
    });
    addressInput.addEventListener('paste', () => {
      setTimeout(() => {
        $('inputWarning')?.classList.add('hidden');
      }, 10);
    });
  }

  $('addWalletBtn')?.addEventListener('click', () => {
    addWalletFromInput();
  });

  $('scanButton')?.addEventListener('click', scanWallets);

  $('amendWalletsBtn')?.addEventListener('click', () => {
    if (!document.body.classList.contains('ui-results')) return;
    $('inputSection')?.classList.toggle('is-minimized');
  });

  $('cancelScanButton')?.addEventListener('click', () => {
    if (!state.scanning) return;
    state.scanAbortController?.abort();
    hapticFeedback('light');
  });

  $('clearInputBtn')?.addEventListener('click', () => {
    if (addressInput) addressInput.value = '';
    setAddressItems([]);
    $('inputSection')?.classList.remove('is-minimized');
    hapticFeedback('light');
  });

  $('pasteBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (addressInput) addressInput.value = text.trim();
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
    const parsed = getAddressItemsFromText(list.join('\n'));
    setAddressItems(parsed.items, { showWarning: parsed.truncated });
    hapticFeedback('light');
  });

  $('addressChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.address-chip');
    if (!chip) return;
    const idx = Number(chip.dataset.idx);
    if (!Number.isFinite(idx)) return;

    if (e.target?.dataset?.action === 'remove') {
      state.addressItems.splice(idx, 1);
      renderAddressChips();
      persistAddressItems();
      updateTelegramMainButton();
      updateAddressStats();
      hapticFeedback('light');
      return;
    }

    const current = state.addressItems[idx]?.raw;
    if (!current) return;
    const next = prompt('Edit address', current);
    if (next === null) return;
    const parsed = getAddressItemsFromText(next);
    state.addressItems[idx] = parsed.items[0] || { raw: next, type: 'invalid', normalized: next };
    renderAddressChips();
    persistAddressItems();
    updateTelegramMainButton();
    updateAddressStats();
  });

  const searchInput = $('searchInput');
  if (searchInput) {
    let t = null;
    searchInput.addEventListener('input', () => {
      setHoldingsPage(1);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        t = null;
        scheduleRenderHoldingsTable();
      }, 150);
    });
  }

  $('sortSelect')?.addEventListener('change', () => { setHoldingsPage(1); scheduleRenderHoldingsTable(); });
  $('hideDust')?.addEventListener('change', () => { setHoldingsPage(1); scheduleRenderHoldingsTable(); });

  $('pagePrev')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) - 1);
    scheduleRenderHoldingsTable();
  });
  $('pageNext')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) + 1);
    scheduleRenderHoldingsTable();
  });

  $('tableBody')?.addEventListener('click', (e) => {
    const row = e.target.closest('.holding-row');
    if (row) openTokenModal(row.dataset.key);
  });

  $('closeModal')?.addEventListener('click', closeTokenModal);
  $('modalBackdrop')?.addEventListener('click', closeTokenModal);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const tokenModal = $('tokenModal');

    if (tokenModal && !tokenModal.classList.contains('hidden')) {
      closeTokenModal();
    }
  });

  $('copyAddress')?.addEventListener('click', () => {
    const address = $('modalFullAddress')?.textContent || '';
    navigator.clipboard.writeText(address).then(() => {
      showStatus('Address copied to clipboard', 'success');
      hapticFeedback('success');
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

  if (tgIsAtLeast('6.1')) {
    TG.BackButton.onClick(() => {
      const tokenModal = $('tokenModal');
      if (tokenModal && !tokenModal.classList.contains('hidden')) {
        closeTokenModal();
        return;
      }
      $('inputSection')?.classList.toggle('is-minimized');
    });
  }
}

function initialize() {
  setupTelegram();
  setupEyeTracking();
  setupEventListeners();

  const saved = loadPersistedAddressItems();
  if (saved && saved.length) {
    const parsed = getAddressItemsFromText(saved.join('\n'));
    state.addressItems = parsed.items;
    $('inputWarning')?.classList.toggle('hidden', !parsed.truncated);
    renderAddressChips();
  }

  updateAddressStats();
  updateTelegramMainButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
