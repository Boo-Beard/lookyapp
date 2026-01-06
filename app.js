
const $ = (id) => document.getElementById(id);

function shouldIgnoreGlobalError(message, source) {
  const msg = String(message || '');
  const src = String(source || '');

  if (/metamask/i.test(msg)) return true;
  if (/Failed\s+to\s+connect\s+to\s+MetaMask/i.test(msg)) return true;

  // Wallet extensions often throw from extension URLs; those aren't actionable for users.
  if (/^(chrome|moz|safari)-extension:\/\//i.test(src)) return true;

  return false;
}

const STORAGE_KEY_PORTFOLIO_SNAPSHOT = 'peeek:portfolioSnapshotV1';

const WHATIF_PRESETS = [2, 5, 8, 10, 100];
const WHATIF_AUTO_RESET_MS = 3_000;
const whatIfHolding = new Map();
const whatIfTimers = new Map();

function setTextSafely(el, text) {
  try {
    if (!el) return;
    el.textContent = String(text);
  } catch {}
}

function applyHoldingWhatIfToCard(cardEl, mult) {
  const card = cardEl;
  if (!card) return;

  const priceEl = card.querySelector('[data-whatif-field="price"]');
  const mcapEl = card.querySelector('[data-whatif-field="mcap"]');
  const valueEl = card.querySelector('[data-whatif-field="value"]');

  const basePrice = Number(card.getAttribute('data-whatif-base-price') || 0) || 0;
  const baseMcap = Number(card.getAttribute('data-whatif-base-mcap') || 0) || 0;
  const baseValue = Number(card.getAttribute('data-whatif-base-value') || 0) || 0;
  const nextMult = Number(mult || 1) || 1;

  if (nextMult === 1) {
    const basePriceText = card.getAttribute('data-whatif-base-price-text') || '';
    const baseMcapText = card.getAttribute('data-whatif-base-mcap-text') || '';
    const baseValueText = card.getAttribute('data-whatif-base-value-text') || '';
    if (basePriceText) setTextSafely(priceEl, basePriceText);
    if (baseMcapText) setTextSafely(mcapEl, baseMcapText);
    if (baseValueText) setTextSafely(valueEl, baseValueText);
    try { valueEl?.classList?.remove('is-whatif'); } catch {}
    try {
      card.classList.remove('is-whatif-active');
      priceEl?.classList?.remove('is-whatif-changed');
      mcapEl?.classList?.remove('is-whatif-changed');
      valueEl?.classList?.remove('is-whatif-changed');
    } catch {}
    return;
  }

  const nextPrice = basePrice * nextMult;
  const nextMcap = baseMcap * nextMult;
  const nextValue = baseValue * nextMult;

  if (Number.isFinite(nextPrice) && basePrice > 0) setTextSafely(priceEl, formatPrice(nextPrice));
  if (Number.isFinite(nextMcap) && baseMcap > 0) setTextSafely(mcapEl, formatCurrency(nextMcap));
  if (Number.isFinite(nextValue) && baseValue >= 0) setTextSafely(valueEl, `${formatCurrency(nextValue)}`);
  try { valueEl?.classList?.add('is-whatif'); } catch {}
  try {
    card.classList.add('is-whatif-active');
    priceEl?.classList?.add('is-whatif-changed');
    mcapEl?.classList?.add('is-whatif-changed');
    valueEl?.classList?.add('is-whatif-changed');
  } catch {}
}

function holdingWhatIfKey(h) {
  const chain = String(h?.chain || '').trim();
  const address = String(h?.address || '').trim();
  if (!chain || !address) return '';
  return `${chain}:${address}`;
}

function scheduleHoldingWhatIfReset(key, ms = WHATIF_AUTO_RESET_MS) {
  if (!key) return;
  try {
    const prev = whatIfTimers.get(key);
    if (prev) window.clearTimeout(prev);
  } catch {}
  try {
    const t = window.setTimeout(() => {
      try { whatIfHolding.delete(key); } catch {}
      try { whatIfTimers.delete(key); } catch {}
      try {
        const card = document.querySelector(`.holding-card[data-whatif-card="1"][data-holding-key="${CSS.escape(key)}"]`);
        if (card) {
          applyHoldingWhatIfToCard(card, 1);
          try {
            card.querySelectorAll('button.whatif-chip').forEach((b) => b.classList.remove('is-active'));
          } catch {}
        }
      } catch {}
    }, Math.max(1000, Number(ms) || WHATIF_AUTO_RESET_MS));
    whatIfTimers.set(key, t);
  } catch {}
}

function savePortfolioSnapshot() {
  try {
    const wallets = Array.isArray(state.wallets) ? state.wallets : [];
    const holdings = Array.isArray(state.holdings) ? state.holdings : [];
    const walletHoldingsEntries = (state.walletHoldings && typeof state.walletHoldings.entries === 'function')
      ? Array.from(state.walletHoldings.entries())
      : [];
    const walletDayChangeEntries = (state.walletDayChange && typeof state.walletDayChange.entries === 'function')
      ? Array.from(state.walletDayChange.entries())
      : [];
    const payload = {
      ts: Date.now(),
      wallets,
      holdings,
      walletHoldingsEntries,
      walletDayChangeEntries,
      totals: {
        totalValue: Number(state.totalValue || 0) || 0,
        totalSolValue: Number(state.totalSolValue || 0) || 0,
        totalEvmValue: Number(state.totalEvmValue || 0) || 0,
        totalChangeSolUsd: Number(state.totalChangeSolUsd || 0) || 0,
        totalChangeEvmUsd: Number(state.totalChangeEvmUsd || 0) || 0,
        totalValueForChange: Number(state.totalValueForChange || 0) || 0,
        totalValue24hAgo: Number(state.totalValue24hAgo || 0) || 0,
      },
    };
    localStorage.setItem(STORAGE_KEY_PORTFOLIO_SNAPSHOT, JSON.stringify(payload));
  } catch {}
}

function flashCopySuccess(el, { ms = 5000 } = {}) {
  try {
    const a = el;
    if (!a) return;
    const icon = a.querySelector('i');
    if (!icon) return;

    const prevClassName = icon.className;
    icon.className = 'fa-solid fa-check';
    a.classList.add('is-copied');

    window.setTimeout(() => {
      try {
        icon.className = prevClassName;
        a.classList.remove('is-copied');
      } catch {}
    }, Math.max(250, Number(ms) || 5000));
  } catch {}
}

function clearPortfolioSnapshot() {
  try { localStorage.removeItem(STORAGE_KEY_PORTFOLIO_SNAPSHOT); } catch {}
}

function loadPortfolioSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PORTFOLIO_SNAPSHOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : [];
    const wallets = Array.isArray(parsed.wallets) ? parsed.wallets : [];
    if (!holdings.length || !wallets.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function restorePortfolioSnapshot() {
  const snap = loadPortfolioSnapshot();
  if (!snap) return false;

  try {
    state.holdings = Array.isArray(snap.holdings) ? snap.holdings : [];
    state.wallets = Array.isArray(snap.wallets) ? snap.wallets : [];
    const wh = Array.isArray(snap.walletHoldingsEntries) ? snap.walletHoldingsEntries : [];
    const wd = Array.isArray(snap.walletDayChangeEntries) ? snap.walletDayChangeEntries : [];
    const totals = snap.totals || {};
    state.totalValue = Number(totals.totalValue || 0) || 0;
    state.totalSolValue = Number(totals.totalSolValue || 0) || 0;
    state.totalEvmValue = Number(totals.totalEvmValue || 0) || 0;
    state.totalChangeSolUsd = Number(totals.totalChangeSolUsd || 0) || 0;
    state.totalChangeEvmUsd = Number(totals.totalChangeEvmUsd || 0) || 0;
    state.totalValueForChange = Number(totals.totalValueForChange || 0) || 0;
    state.totalValue24hAgo = Number(totals.totalValue24hAgo || 0) || 0;
    state.walletHoldings = wh.length
      ? new Map(wh)
      : new Map((Array.isArray(state.wallets) ? state.wallets : []).map((w) => [`${String(w.chain || '')}:${String(w.address || '')}`, []]));
    state.walletDayChange = wd.length ? new Map(wd) : new Map();
    state.scanning = false;
    state.scanAbortController = null;
    state.scanMeta = { completed: 0, total: 0 };
  } catch {
    return false;
  }

  try {
    for (const h of (Array.isArray(state.holdings) ? state.holdings : [])) {
      const addr = String(h?.address || '').trim();
      const chain = String(h?.chain || '').trim();
      const mcap = Number(h?.mcap || 0) || 0;
      if (!addr || !chain || !(mcap > 0)) continue;
      mcapCache.set(`${chain}:${addr}`, { mcap, ts: Date.now() });
    }
  } catch {}

  try {
    document.body.classList.remove('ui-landing');
    document.body.classList.add('ui-results');
    $('resultsSection')?.classList.remove('hidden');
    $('inputSection')?.classList.add('is-minimized');
    setPortfolioMinimizedPreference(true);
  } catch {}

  try {
    holdingsDataVersion++;
    invalidateHoldingsTableCache();
  } catch {}

  try {
    updateSummary();
    renderAllocationAndRisk();
    renderHoldingsByWallet();
    renderHoldingsTable();
  } catch {}

  return true;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target?.closest?.('button[data-action="whatif-mult"]');
    if (!btn) return;
    try {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    } catch {}

    const key = String(btn.dataset.holdingKey || '').trim();
    const mult = Number(btn.dataset.mult || 1) || 1;
    if (!key) return;

    try { whatIfHolding.set(key, mult); } catch {}
    try {
      const card = btn.closest('.holding-card');
      if (card) applyHoldingWhatIfToCard(card, mult);
      const chipsWrap = btn.closest('.whatif-chips');
      if (chipsWrap) {
        chipsWrap.querySelectorAll('button.whatif-chip').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
      }
    } catch {}
    try { scheduleHoldingWhatIfReset(key); } catch {}
    try { hapticFeedback('light'); } catch {}
  }, true);
}

window.addEventListener('error', (e) => {
  try {
    const msg = e?.error?.message || e?.message || 'Unknown error';
    if (shouldIgnoreGlobalError(msg, e?.filename)) return;
    document.body?.setAttribute('data-js-error', '1');
    const status = document.getElementById('statusContent');
    if (status) status.textContent = `Error: ${String(msg).slice(0, 140)}`;
    const scanStatus = document.getElementById('scanStatus');
    scanStatus?.classList.remove('hidden');
  } catch {}
});

window.addEventListener('unhandledrejection', (e) => {
  try {
    const msg = e?.reason?.message || String(e?.reason || 'Unhandled rejection');
    if (shouldIgnoreGlobalError(msg)) return;
    document.body?.setAttribute('data-js-error', '1');
    const status = document.getElementById('statusContent');
    if (status) status.textContent = `Error: ${String(msg).slice(0, 140)}`;
    const scanStatus = document.getElementById('scanStatus');
    scanStatus?.classList.remove('hidden');
  } catch {}
});

const MAX_ADDRESSES = 20;
const STORAGE_KEY_ADDRESSES = 'peeek:lastAddresses';
const STORAGE_KEY_PROFILES = 'peeek:profiles';
const STORAGE_KEY_ACTIVE_PROFILE = 'peeek:activeProfile';
const STORAGE_KEY_UI_SECTIONS = 'peeek:uiSections';
const STORAGE_KEY_REDACTED_MODE = 'peeek:redactedMode';
const STORAGE_KEY_HIDDEN_HOLDINGS = 'peeek:hiddenHoldingsV1';
const STORAGE_KEY_SHOW_HIDDEN_HOLDINGS = 'peeek:showHiddenHoldingsV1';

const STORAGE_KEY_LAST_SCAN_AT = 'peeek:lastScanAt';
const SCAN_COOLDOWN_MS = 60 * 1000;
const DISABLE_SCAN_COOLDOWN = true;

const HOLDINGS_PAGE_SIZE = 5;

const SCAN_CACHE_TTL_MS = 10 * 60 * 1000;
const scanCache = new Map();

const SOL_CHANGE_CACHE_TTL_MS = 10 * 60 * 1000;
const solTokenChangeCache = new Map();

const SOL_OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const solTokenOverviewCache = new Map();

const TOKEN_OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const tokenOverviewCache = new Map();

const SOL_CHANGE_CACHE_TTL_ZERO_MS = 30 * 1000;

let progressRaf = null;
let progressPending = null;

let scanCooldownTimer = null;

const WALLET_PNL_CACHE_TTL_MS = 2 * 60 * 1000;
const walletPnlCache = new Map();

function migrateLegacyStorageKeys() {
  try {
    const legacyPrefixA = ['l', 'o', 'o', 'k', 'y', ':'].join('');
    const legacyPrefixB = ['p', 'e', 'e', 'k', ':'].join('');
    const suffixes = [
      'lastAddresses',
      'profiles',
      'activeProfile',
      'uiSections',
      'redactedMode',
      'lastScanAt',
      'debugSolChange',
    ];

    for (const suffix of suffixes) {
      const nextKey = `peeek:${suffix}`;

      for (const prefix of [legacyPrefixA, legacyPrefixB]) {
        const legacyKey = prefix + suffix;
        const legacyVal = localStorage.getItem(legacyKey);
        if (legacyVal == null) continue;
        if (localStorage.getItem(nextKey) == null) {
          localStorage.setItem(nextKey, legacyVal);
        }
        localStorage.removeItem(legacyKey);
      }
    }
  } catch {}
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return !!ok;
  } catch {}
  return false;
}

function watchlistStarLabelFromEl(el) {
  try {
    const sym = String(el?.dataset?.symbol || '').trim();
    if (sym) return sym;
    const name = String(el?.dataset?.name || '').trim();
    if (name) return name;
    return 'Token';
  } catch {
    return 'Token';
  }
}

function showInlineStarToast(anchorEl, message) {
  try {
    const a = anchorEl;
    if (!a) return;
    const root = a.closest('.holding-card-actions') || a.parentElement;
    if (!root) return;

    const existing = root.querySelector('.inline-star-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'inline-star-toast';
    toast.textContent = String(message || '').trim();
    root.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    window.setTimeout(() => {
      try { toast.classList.remove('show'); } catch {}
      window.setTimeout(() => { try { toast.remove(); } catch {} }, 250);
    }, 1600);
  } catch {}
}

function renderSearchTokenActions(model) {
  const explorerHref = getExplorerTokenUrl(model);
  const explorerDisabled = explorerHref === '#';

  const wlActive = isTokenInWatchlist({
    chain: String(model?.chain || ''),
    network: String(model?.network || ''),
    address: String(model?.address || ''),
  });

  const chain = String(model?.chain || '');
  const network = String(model?.network || '');
  const address = String(model?.address || '').trim();

  const chainLogoUrl = getChainLogoUrl(chain, network);
  const chainLabel = chain === 'solana' ? 'SOL' : evmNetworkLabel(network);

  const chartIconDexscreener = 'https://docs.dexscreener.com/~gitbook/image?url=https%3A%2F%2F198140802-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F7OmRM9NOmlC1POtFwsnX%252Ficon%252F6BJXvNUMQSXAtDTzDyBK%252Ficon-512x512.png%3Falt%3Dmedia%26token%3Da7ce263e-0b40-4afb-ae25-eae378aef0ab&width=32&dpr=2&quality=100&sign=f988708e&sv=2';
  const chartIconBirdeye = 'https://birdeye.so/be/m-dark-logo.png';

  preloadImage(chartIconDexscreener);
  preloadImage(chartIconBirdeye);

  window.__peeekChartIcons = window.__peeekChartIcons || { dexscreener: chartIconDexscreener, birdeye: chartIconBirdeye };

  return `
    <div class="holding-card-actions" aria-label="Token actions">
      <a class="holding-action ${wlActive ? 'is-active' : ''}" href="#" data-action="watchlist-add" data-chain="${escapeAttribute(String(model?.chain || ''))}" data-network="${escapeAttribute(String(model?.network || ''))}" data-address="${escapeAttribute(String(model?.address || ''))}" data-symbol="${escapeAttribute(String(model?.symbol || ''))}" data-name="${escapeAttribute(String(model?.name || ''))}" data-logo-url="${escapeAttribute(String(model?.logoUrl || ''))}" aria-label="${wlActive ? 'Remove from Watchlist' : 'Add to Watchlist'}">
        <i class="${wlActive ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i>
      </a>
      <a class="holding-action" href="#" data-action="copy-contract" data-address="${escapeAttribute(String(model?.address || ''))}" aria-label="Copy contract address">
        <i class="fa-regular fa-copy" aria-hidden="true"></i>
      </a>
      <a class="holding-action holding-action-explorer ${explorerDisabled ? 'disabled' : ''}" href="${explorerHref}" target="_blank" rel="noopener noreferrer" aria-label="View on ${escapeAttribute(chainLabel)} Explorer" ${explorerDisabled ? 'aria-disabled="true" tabindex="-1"' : ''}>
        ${chainLogoUrl ? `<img class="chain-logo-action" src="${escapeAttribute(chainLogoUrl)}" alt="${escapeAttribute(chainLabel)}" />` : '<i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>'}
      </a>
      <a class="holding-action" href="#" data-action="chart" data-chain="${escapeAttribute(chain)}" data-network="${escapeAttribute(network)}" data-address="${escapeAttribute(address)}" data-symbol="${escapeAttribute(String(model?.symbol || ''))}" data-name="${escapeAttribute(String(model?.name || ''))}" aria-label="View Chart">
        <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
      </a>
      <div class="chart-popover hidden" role="menu" aria-label="Chart providers">
        <a class="chart-popover-link" role="menuitem" data-provider="dexscreener" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dexscreener">
          <img class="chart-popover-icon" alt="" src="${chartIconDexscreener}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64','D');">
        </a>
        <a class="chart-popover-link" role="menuitem" data-provider="dextools" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dextools">
          <img class="chart-popover-icon" alt="" src="https://cdn.worldvectorlogo.com/logos/dextools.svg" onerror="this.onerror=null;this.style.display='none';this.parentElement.textContent='T';">
        </a>
        <a class="chart-popover-link" role="menuitem" data-provider="birdeye" href="#" target="_blank" rel="noopener noreferrer" aria-label="Birdeye">
          <img class="chart-popover-icon" alt="" src="${chartIconBirdeye}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64','B');">
        </a>
      </div>
    </div>
  `;
}

const DEBUG_SOL_CHANGE = (() => {
  try {
    if (localStorage.getItem('peeek:debugSolChange') === '1') return true;
    const legacyPrefixA = ['l', 'o', 'o', 'k', 'y', ':'].join('');
    const legacyPrefixB = ['p', 'e', 'e', 'k', ':'].join('');
    return localStorage.getItem(legacyPrefixA + 'debugSolChange') === '1'
      || localStorage.getItem(legacyPrefixB + 'debugSolChange') === '1';
  }
  catch { return false; }
})();

const preloadImage = (url) => {
  if (!url) return;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  } catch {}
};

const SOL_CHANGE_ELIGIBLE_LIQUIDITY_USD = 5000;
const SOL_CHANGE_ELIGIBLE_VOLUME24H_USD = 5000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleChartIconError(imgEl, fallbackSrc, fallbackText) {
  try {
    if (!imgEl || imgEl.dataset.fallbackTried === '1') throw new Error('no-more-fallbacks');
    if (!fallbackSrc) throw new Error('no-fallback-src');
    imgEl.dataset.fallbackTried = '1';
    imgEl.src = fallbackSrc;
    return;
  } catch {}

  try {
    if (!imgEl) return;
    imgEl.onerror = null;
    imgEl.style.display = 'none';
    const parent = imgEl.parentElement;
    if (parent) parent.textContent = String(fallbackText || '').slice(0, 1) || '?';
  } catch {}
}

function escapeAttribute(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getSolTokenChangeCache(address) {
  const key = String(address || '').trim();
  if (!key) return null;
  const entry = solTokenChangeCache.get(key);
  if (!entry) return null;

  const ttl = (Number(entry?.pct24h) && Math.abs(Number(entry.pct24h)) > 0)
    ? SOL_CHANGE_CACHE_TTL_MS
    : SOL_CHANGE_CACHE_TTL_ZERO_MS;

  if ((Date.now() - entry.ts) > ttl) {
    solTokenChangeCache.delete(key);
    return null;
  }
  return entry;
}

function setSolTokenChangeCache(address, payload) {
  const key = String(address || '').trim();
  if (!key) return;
  solTokenChangeCache.set(key, { ts: Date.now(), ...payload });
}

function getSolTokenOverviewCache(address) {
  const key = String(address || '').trim();
  if (!key) return null;
  const entry = solTokenOverviewCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.ts) > SOL_OVERVIEW_CACHE_TTL_MS) {
    solTokenOverviewCache.delete(key);
    return null;
  }
  return entry.data || null;
}

function setSolTokenOverviewCache(address, data) {
  const key = String(address || '').trim();
  if (!key) return;
  solTokenOverviewCache.set(key, { ts: Date.now(), data });
}

function getTokenOverviewCache(address, chain) {
  const addr = String(address || '').trim();
  const ch = String(chain || '').trim();
  if (!addr || !ch) return null;
  if (ch === 'solana') return getSolTokenOverviewCache(addr);
  const key = `${ch}:${addr}`;
  const entry = tokenOverviewCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.ts) > TOKEN_OVERVIEW_CACHE_TTL_MS) {
    tokenOverviewCache.delete(key);
    return null;
  }
  return entry.data || null;
}

function setTokenOverviewCache(address, chain, data) {
  const addr = String(address || '').trim();
  const ch = String(chain || '').trim();
  if (!addr || !ch) return;
  if (ch === 'solana') {
    setSolTokenOverviewCache(addr, data);
    return;
  }
  const key = `${ch}:${addr}`;
  tokenOverviewCache.set(key, { ts: Date.now(), data });
}

function parseOverviewMeta(overview) {
  const data = overview && typeof overview === 'object' ? overview : {};
  const marketCapUsd = Number(
    data?.marketCap ??
    data?.market_cap ??
    data?.marketcap ??
    data?.fdv ??
    data?.fdv_usd ??
    0
  ) || 0;
  const volume24hUsd = Number(
    data?.v24hUSD ??
    data?.v24h_usd ??
    data?.v24h ??
    data?.volume24h ??
    data?.volume24hUsd ??
    data?.volume_24h ??
    data?.volume_24h_usd ??
    0
  ) || 0;
  const liquidityUsd = Number(
    data?.liquidity ??
    data?.liquidityUsd ??
    data?.liquidity_usd ??
    data?.liquidity_1d ??
    0
  ) || 0;
  return { marketCapUsd, volume24hUsd, liquidityUsd };
}

async function enrichHoldingsWithOverviewMeta(holdings, { signal } = {}) {
  console.log('[ENRICH] Called with holdings length:', holdings?.length);
  if (!Array.isArray(holdings) || holdings.length === 0) {
    console.log('[ENRICH] No holdings to enrich');
    return;
  }

  const candidates = holdings
    .filter((h) => h && h.address && h.chain)
    .filter((h) => String(h.chain) !== 'evm' || isValidEvmContractAddress(String(h.address || '')))
    .filter((h) => {
      const needsVol = !(Number(h.volume24hUsd || 0) > 0);
      const needsLiq = !(Number(h.liquidityUsd || 0) > 0);
      const needsMcap = !(Number(h.mcap || 0) > 0);
      return needsVol || needsLiq || needsMcap;
    })
    .sort((a, b) => (Number(b.value || 0) || 0) - (Number(a.value || 0) || 0))
    .slice(0, 30);

  console.log('[ENRICH] Candidates to enrich:', candidates.length);
  if (!candidates.length) {
    console.log('[ENRICH] No candidates need enrichment');
    return;
  }

  let idx = 0;
  let changed = false;
  let lastRenderAt = 0;
  const maybeRender = () => {
    const now = Date.now();
    if (now - lastRenderAt < 1000) return;
    lastRenderAt = now;
    holdingsDataVersion++;
    invalidateHoldingsTableCache();
    scheduleRenderHoldingsTable();
    try { savePortfolioSnapshot(); } catch {}
  };

  const concurrency = 4;
  const worker = async () => {
    while (idx < candidates.length) {
      const h = candidates[idx++];
      if (!h) continue;
      if (signal?.aborted) return;

      const addr = String(h.address || '').trim();
      const chain = String(h.chain || '').trim();
      if (!addr || !chain) continue;

      let overview = getTokenOverviewCache(addr, chain);
      if (!overview) {
        try {
          overview = await fetchTokenOverview(addr, chain, { signal });
          if (overview) setTokenOverviewCache(addr, chain, overview);
        } catch {
          setTokenOverviewCache(addr, chain, null);
          continue;
        }
      }

      if (!overview) continue;
      const meta = parseOverviewMeta(overview);

      let localChanged = false;
      if (Number(meta.marketCapUsd) > 0 && !(Number(h.mcap || 0) > 0)) {
        h.mcap = Number(meta.marketCapUsd) || 0;
        changed = true;
        localChanged = true;
        console.log('[ENRICH] Set mcap for', h.symbol, ':', h.mcap);
      }
      if (Number(meta.volume24hUsd) > 0 && !(Number(h.volume24hUsd || 0) > 0)) {
        h.volume24hUsd = Number(meta.volume24hUsd) || 0;
        changed = true;
        localChanged = true;
        console.log('[ENRICH] Set volume24hUsd for', h.symbol, ':', h.volume24hUsd);
      }
      if (Number(meta.liquidityUsd) > 0 && !(Number(h.liquidityUsd || 0) > 0)) {
        h.liquidityUsd = Number(meta.liquidityUsd) || 0;
        changed = true;
        localChanged = true;
        console.log('[ENRICH] Set liquidityUsd for', h.symbol, ':', h.liquidityUsd);
      }

      if (localChanged) {
        console.log('[ENRICH] Updated holding:', h.symbol, 'mcap:', h.mcap, 'vol:', h.volume24hUsd, 'liq:', h.liquidityUsd);
      }
      if (changed) maybeRender();
    }
  };

  await Promise.allSettled(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  
  console.log('[ENRICH] All workers complete, changed:', changed);
  if (signal?.aborted) {
    console.log('[ENRICH] Signal aborted, returning');
    return;
  }
  if (!changed) {
    console.log('[ENRICH] No changes made, returning');
    return;
  }
  console.log('[ENRICH] Invalidating cache and scheduling render');
  holdingsDataVersion++;
  invalidateHoldingsTableCache();
  scheduleRenderHoldingsTable();
  try { savePortfolioSnapshot(); } catch {}
  console.log('[ENRICH] Function complete');
}

function getWalletPnlCache(chain, wallet) {
  const key = `${String(chain || '')}:${String(wallet || '').trim()}`;
  const entry = walletPnlCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.ts) > WALLET_PNL_CACHE_TTL_MS) {
    walletPnlCache.delete(key);
    return null;
  }
  return entry.data || null;
}

function setWalletPnlCache(chain, wallet, data) {
  const key = `${String(chain || '')}:${String(wallet || '').trim()}`;
  walletPnlCache.set(key, { ts: Date.now(), data });
}

function getLastScanAt() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_SCAN_AT);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function sanitizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
}

function safeSocialHandleUrl(platform, handleOrUrl) {
  const raw = String(handleOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return sanitizeUrl(raw);

  const clean = raw.replace(/^@/, '');
  if (!clean) return '';
  if (platform === 'twitter') return `https://x.com/${clean}`;
  return '';
}

function getExplorerTokenUrl(model) {
  const address = String(model?.address || '').trim();
  if (!address) return '#';

  const chain = String(model?.chain || '').toLowerCase();
  if (chain === 'solana' || String(model?.chainShort || '').toUpperCase() === 'SOL') {
    return `https://solscan.io/token/${address}`;
  }

  const network = String(model?.network || model?.chainId || '').toLowerCase();
  if (isValidEvmContractAddress(address)) {
    const base = evmExplorerBase(network);
    return `${base}/token/${address}`;
  }

  return '#';
}

function normalizeExtensions(ext) {
  const e = (ext && typeof ext === 'object') ? ext : {};
  const description = String(e.description || e.desc || '').trim();

  const website = sanitizeUrl(e.website || e.site || e.url);
  const twitter = safeSocialHandleUrl('twitter', e.twitter || e.x || e.twitter_handle);
  const discord = sanitizeUrl(e.discord);

  return {
    description,
    links: {
      website,
      twitter,
      discord,
    },
  };
}

function extractDexscreenerExtensions(bestPair) {
  const info = (bestPair && typeof bestPair === 'object') ? bestPair.info || {} : {};
  const socials = Array.isArray(info.socials) ? info.socials : [];
  const websites = Array.isArray(info.websites) ? info.websites : [];

  const out = {
    description: String(info.description || '').trim(),
    links: {
      website: '',
      twitter: '',
      discord: '',
    },
  };

  for (const w of websites) {
    const href = sanitizeUrl(w?.url);
    if (href) { out.links.website = href; break; }
  }

  for (const s of socials) {
    const type = String(s?.type || '').toLowerCase();
    const href = sanitizeUrl(s?.url) || safeSocialHandleUrl(type, s?.url || s?.handle);
    if (!href) continue;
    if (type === 'twitter' || type === 'x') out.links.twitter = href;
    if (type === 'discord') out.links.discord = href;
  }

  return out;
}

function setLastScanAt(ts) {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_SCAN_AT, String(Number(ts) || Date.now()));
  } catch {}
}

function formatCooldownMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateScanCooldownUi() {
  if (state?.scanning) return;
  const btn = $('scanButton');
  if (!btn) return;

  const labelEl = btn.querySelector('span:not(.btn-icon)') || btn.querySelector('span:last-child');
  const baseLabel = labelEl ? String(labelEl.textContent || '').trim() : '';

  if (DISABLE_SCAN_COOLDOWN) {
    if (scanCooldownTimer) {
      window.clearInterval(scanCooldownTimer);
      scanCooldownTimer = null;
    }
    btn.disabled = false;
    btn.innerHTML = '<span>Scan</span>';
    try {
      btn.classList.remove('is-cooldown');
      btn.style.removeProperty('--cooldown-pct');
      btn.removeAttribute('aria-busy');
    } catch {}
    return;
  }

  const last = getLastScanAt();
  const remaining = SCAN_COOLDOWN_MS - (Date.now() - last);

  if (remaining > 0) {
    btn.disabled = true;
    btn.innerHTML = '<span>Scan</span>';
    try {
      const pct = Math.max(0, Math.min(1, 1 - (remaining / SCAN_COOLDOWN_MS)));
      btn.classList.add('is-cooldown');
      btn.style.setProperty('--cooldown-pct', String(pct));
      btn.setAttribute('aria-busy', 'true');
      if (labelEl) labelEl.textContent = `${baseLabel || 'Scan'} (${formatCooldownMs(remaining)})`;
    } catch {}
    if (!scanCooldownTimer) {
      scanCooldownTimer = window.setInterval(updateScanCooldownUi, 1000);
    }
    return;
  }

  if (scanCooldownTimer) {
    window.clearInterval(scanCooldownTimer);
    scanCooldownTimer = null;
  }
  btn.disabled = false;
  btn.innerHTML = '<span>Scan</span>';
  try {
    btn.classList.remove('is-cooldown');
    btn.style.removeProperty('--cooldown-pct');
    btn.removeAttribute('aria-busy');
    if (labelEl) labelEl.textContent = baseLabel || 'Scan';
  } catch {}
}

async function fetchSolTokenOverview(addr, { signal } = {}) {
  const cached = getSolTokenOverviewCache(addr);
  if (cached) return cached;

  const overview = await birdeyeRequest('/defi/token_overview', {
    address: addr,
    ui_amount_mode: 'scaled',
  }, {
    signal,
    headers: {
      'x-chain': 'solana',
    },
  });
  const data = overview?.data || null;
  setSolTokenOverviewCache(addr, data);
  return data;
}

function extractBirdeyePriceValue(obj) {
  const d = obj?.data || obj || {};
  const v = d?.value || d?.data || {};
  const price = Number(
    d?.value ??
    d?.price ??
    d?.priceUsd ??
    d?.price_usd ??
    v?.value ??
    v?.price ??
    v?.priceUsd ??
    v?.price_usd ??
    0
  );
  return Number.isFinite(price) ? price : 0;
}

async function fetchSolTokenPct24hFromHistoricalUnix(tokenAddress, { signal } = {}) {
  const unixtime = Math.floor((Date.now() - (24 * 60 * 60 * 1000)) / 1000);
  const hist = await birdeyeRequest('/defi/historical_price_unix', {
    address: tokenAddress,
    unixtime,
  }, {
    signal,
    headers: {
      'x-chain': 'solana',
    },
  });

  const d = hist?.data || {};
  const direct = Number(d?.priceChange24h ?? d?.price_change_24h ?? 0);
  if (Number.isFinite(direct) && Math.abs(direct) > 0) return direct;

  const price24hAgo = Number(d?.value ?? 0);
  if (!Number.isFinite(price24hAgo) || price24hAgo <= 0) return 0;
  let priceNow = 0;
  try {
    const priceNowResp = await birdeyeRequest('/defi/price', { address: tokenAddress }, {
      signal,
      headers: {
        'x-chain': 'solana',
      },
    });
    priceNow = extractBirdeyePriceValue(priceNowResp);
  } catch {}

  if (!Number.isFinite(priceNow) || priceNow <= 0) return 0;
  const pct = ((priceNow - price24hAgo) / price24hAgo) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

async function fetchSolTokenChangePct24h(tokenAddress, { signal } = {}) {
  const cached = getSolTokenChangeCache(tokenAddress);
  if (cached && Number.isFinite(cached.pct24h)) return cached.pct24h;

  let pct24h = 0;
  let source = 'none';
  try {
    const priceData = await birdeyeRequest('/defi/price', {
      address: tokenAddress,
    }, {
      signal,
      headers: {
        'x-chain': 'solana',
      },
    });

    const d = priceData?.data || {};
    const v = d?.value || d?.data || {};
    const pct = Number(
      d?.priceChangePercent ??
      d?.price_change_percent ??
      d?.priceChangePercent24h ??
      d?.price_change_percent_24h ??
      d?.priceChangePct ??
      d?.priceChangePct24h ??
      d?.changePercent24h ??
      d?.change_percent_24h ??
      d?.changePct24h ??
      v?.priceChangePercent ??
      v?.price_change_percent ??
      v?.priceChangePercent24h ??
      v?.price_change_percent_24h ??
      v?.priceChangePct ??
      v?.priceChangePct24h ??
      v?.changePercent24h ??
      v?.change_percent_24h ??
      v?.changePct24h ??
      0
    );
    if (Number.isFinite(pct) && Math.abs(pct) > 0) {
      pct24h = pct;
      source = 'price';
    } else if (DEBUG_SOL_CHANGE) {
      try {
        console.debug('[SOL 24h] /defi/price pct not found', {
          tokenAddress,
          keys: Object.keys(d || {}),
          valueKeys: Object.keys(v || {}),
        });
      } catch {}
    }
  } catch {}
  if (!Number.isFinite(pct24h) || Math.abs(pct24h) < 1e-9) {
    try {
      const d = (await fetchSolTokenOverview(tokenAddress, { signal })) || {};
      const v = d?.value || d?.data || {};
      const frame24 = d?.['24h'] || d?.frame_24h || d?.frame24h || d?.frames?.['24h'] || d?.frames?.frame_24h || null;
      const pct = Number(
        d?.priceChange24hPercent ??
        d?.price_change_24h_percent ??
        d?.price_change_24h_percent_value ??
        v?.priceChange24hPercent ??
        v?.price_change_24h_percent ??
        v?.price_change_24h_percent_value ??
        frame24?.priceChange24hPercent ??
        frame24?.price_change_24h_percent ??
        d?.priceChangePercent ??
        d?.price_change_percent ??
        v?.priceChangePercent ??
        v?.price_change_percent ??
        frame24?.priceChangePercent ??
        frame24?.price_change_percent ??
        frame24?.priceChangePct ??
        frame24?.changePct ??
        frame24?.change_percent ??
        frame24?.price_change_24h_percent ??
        frame24?.percent_change ??
        d?.priceChangePercent24h ??
        d?.price_change_percent_24h ??
        d?.priceChangePct24h ??
        d?.changePct24h ??
        d?.change_percent_24h ??
        0
      );
      if (Number.isFinite(pct) && Math.abs(pct) > 0) {
        pct24h = pct;
        source = 'overview';
      } else if (DEBUG_SOL_CHANGE) {
        try {
          console.debug('[SOL 24h] /defi/token_overview pct not found', {
            tokenAddress,
            keys: Object.keys(d || {}),
            valueKeys: Object.keys(v || {}),
            frameKeys: frame24 ? Object.keys(frame24 || {}) : [],
          });
        } catch {}
      }
    } catch {}
  }
  if (!Number.isFinite(pct24h) || Math.abs(pct24h) < 1e-9) {
    try {
      const pct = await fetchSolTokenPct24hFromHistoricalUnix(tokenAddress, { signal });
      if (Number.isFinite(pct) && Math.abs(pct) > 0) {
        pct24h = pct;
        source = 'hist_unix';
      } else if (DEBUG_SOL_CHANGE) {
        try {
          console.debug('[SOL 24h] /defi/historical_price_unix pct not found', { tokenAddress });
        } catch {}
      }
    } catch (err) {
      if (DEBUG_SOL_CHANGE) {
        try {
          console.debug('[SOL 24h] /defi/historical_price_unix error', { tokenAddress, message: err?.message || String(err) });
        } catch {}
      }
    }
  }

  // Native SOL often fails to return pct from Birdeye endpoints; use a safe fallback.
  if (!Number.isFinite(pct24h) || Math.abs(pct24h) < 1e-9) {
    try {
      const isNative = String(tokenAddress) === 'So11111111111111111111111111111111111111111';
      if (isNative) {
        const pct = await fetchNativeSolPct24hFallback({ signal });
        if (Number.isFinite(pct) && Math.abs(pct) > 0) {
          pct24h = pct;
          source = 'coingecko';
        }
      }
    } catch {}
  }

  if (!Number.isFinite(pct24h)) pct24h = 0;

  if (DEBUG_SOL_CHANGE) {
    try {
      if (Math.abs(pct24h) > 0) console.debug('[SOL 24h] token pct', { tokenAddress, pct24h, source });
      else console.debug('[SOL 24h] token pct missing/0', { tokenAddress, pct24h, source });
    } catch {}
  }

  setSolTokenChangeCache(tokenAddress, { pct24h, source });
  return pct24h;
}

async function fetchNativeSolPct24hFallback({ signal } = {}) {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) return 0;
    const data = await res.json();
    const pct = Number(data?.solana?.usd_24h_change ?? 0);
    return Number.isFinite(pct) ? pct : 0;
  } catch {
    return 0;
  }
}

function holdingDeltaUsdFromPct({ valueUsd, pct }) {
  const v = Number(valueUsd) || 0;
  const p = Number(pct);
  if (!Number.isFinite(v) || !Number.isFinite(p) || v <= 0) return 0;
  const r = p / 100;
  const denom = 1 + r;
  if (Math.abs(denom) < 1e-9) return 0;
  return v * (r / denom);
}

function normalizeSolHoldingTokenAddress(h) {
  const raw = String(
    h?.address ||
    h?.token_address ||
    h?.mint ||
    h?.mintAddress ||
    h?.mint_address ||
    h?.tokenAddress ||
    ''
  ).trim();

  const sym = String(h?.symbol || '').trim().toUpperCase();
  const looksLikeNative = !raw || raw.toLowerCase() === 'sol' || raw.toLowerCase() === 'native';
  if (sym === 'SOL' && looksLikeNative) return 'So11111111111111111111111111111111111111111';
  if (raw.toLowerCase() === 'sol') return 'So11111111111111111111111111111111111111111';
  return raw;
}

async function enrichSolHoldingsWith24hChange(holdings, { signal } = {}) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    if (DEBUG_SOL_CHANGE) {
      try {
        const reason = !Array.isArray(holdings) ? 'holdings_not_array' : 'holdings_empty';
        const summary = {
          reason,
          holdings: Array.isArray(holdings) ? holdings.length : null,
          missing: null,
          missingValueUsd: null,
          top: [],
        };
        window.__peekSol24hDebug = summary;
        console.warn('[SOL 24h] enrich skipped', summary);
      } catch {}
    }
    return holdings;
  }

  const out = holdings.map((h) => ({ ...h }));
  const uniq = Array.from(new Set(out
    .map((h) => normalizeSolHoldingTokenAddress(h))
    .filter(Boolean)));

  if (uniq.length === 0) return out;
  const concurrency = 4;
  const pctByAddr = new Map();
  const metaByAddr = new Map();
  let idx = 0;

  const isNativeSol = (addr) => String(addr) === 'So11111111111111111111111111111111111111111';

  async function fetchSolTokenMeta(addr) {
    const d = (await fetchSolTokenOverview(addr, { signal })) || {};
    const liquidityUsd = Number(
      d?.liquidity ??
      d?.liquidityUsd ??
      d?.liquidity_usd ??
      d?.liquidity_1d ??
      0
    ) || 0;
    const volume24hUsd = Number(
      d?.v24hUSD ??
      d?.v24h ??
      d?.volume24h ??
      d?.volume_24h ??
      d?.volume24hUsd ??
      d?.volume_24h_usd ??
      d?.volume24hUSD ??
      0
    ) || 0;
    return { liquidityUsd, volume24hUsd };
  }

  const worker = async () => {
    while (idx < uniq.length) {
      const addr = uniq[idx++];
      if (signal?.aborted) return;
      try {
        const pct24h = await fetchSolTokenChangePct24h(addr, { signal });
        pctByAddr.set(addr, pct24h);
      } catch {
        pctByAddr.set(addr, 0);
      }

      try {
        if (isNativeSol(addr)) {
          metaByAddr.set(addr, { liquidityUsd: Infinity, volume24hUsd: Infinity });
        } else {
          const meta = await fetchSolTokenMeta(addr);
          metaByAddr.set(addr, meta);
        }
      } catch {
        metaByAddr.set(addr, { liquidityUsd: 0, volume24hUsd: 0 });
      }
    }
  };

  await Promise.allSettled(Array.from({ length: Math.min(concurrency, uniq.length) }, () => worker()));

  const missing = [];

  out.forEach((h) => {
    const addr = normalizeSolHoldingTokenAddress(h);
    if (!addr) return;
    const pct24h = Number(pctByAddr.get(addr) ?? 0) || 0;
    const valueUsd = Number(h?.value || h?.valueUsd || 0) || 0;

    const meta = metaByAddr.get(addr) || { liquidityUsd: 0, volume24hUsd: 0 };
    const eligible = isNativeSol(addr) ||
      (Number(meta?.liquidityUsd || 0) >= SOL_CHANGE_ELIGIBLE_LIQUIDITY_USD) ||
      (Number(meta?.volume24hUsd || 0) >= SOL_CHANGE_ELIGIBLE_VOLUME24H_USD);
    const deltaUsd = holdingDeltaUsdFromPct({ valueUsd, pct: pct24h });
    h.changePct = pct24h;
    h.changeUsd = deltaUsd;
    h.change_1d_usd = deltaUsd;
    h._changeEligible = eligible;

    if (DEBUG_SOL_CHANGE && valueUsd > 0 && Math.abs(pct24h) < 1e-9) {
      try {
        console.debug('[SOL 24h] holding missing pct24h', {
          address: addr,
          symbol: h?.symbol,
          valueUsd,
          eligible,
          liquidityUsd: meta?.liquidityUsd,
          volume24hUsd: meta?.volume24hUsd,
        });
      } catch {}

      missing.push({ address: addr, symbol: h?.symbol, valueUsd });
    }
  });

  if (DEBUG_SOL_CHANGE) {
    try {
      const missingValue = missing.reduce((s, x) => s + (Number(x?.valueUsd) || 0), 0);
      const top = missing
        .slice()
        .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))
        .slice(0, 10);
      const summary = {
        reason: 'ok',
        holdings: out.length,
        missing: missing.length,
        missingValueUsd: missingValue,
        top,
      };

      window.__peekSol24hDebug = summary;
      console.debug('[SOL 24h] missing pct24h summary', summary);
      console.log('[SOL 24h] missing pct24h summary json', JSON.stringify(summary));
    } catch {}
  }

  return out;
}

let holdingsRenderQueued = false;
let holdingsRenderLastAt = 0;
let holdingsRenderThrottleTimer = null;

let holdingsDataVersion = 0;
let watchlistDataVersion = 0;
let hiddenHoldingsVersion = 0;
const holdingsTableCache = {
  key: null,
  useCardRows: null,
  page: null,
  htmlBase: null,
  filtered: null,
  totalItems: 0,
  totalPages: 1,
  filteredTotalValue: 0,
  htmlCache: new Map(),
  lastRenderedKey: null,
};
const watchlistCache = {
  html: null,
  version: 0,
  sortKey: null,
};

function invalidateHoldingsTableCache() {
  holdingsTableCache.key = null;
  holdingsTableCache.useCardRows = null;
  holdingsTableCache.page = null;
  holdingsTableCache.htmlBase = null;
  holdingsTableCache.filtered = null;
  holdingsTableCache.totalItems = 0;
  holdingsTableCache.totalPages = 1;
  holdingsTableCache.filteredTotalValue = 0;
  holdingsTableCache.htmlCache.clear();
  holdingsTableCache.lastRenderedKey = null;
}

function scheduleRenderHoldingsTable() {
  const now = Date.now();
  const throttleMs = state.scanning ? 650 : 0;

  if (throttleMs > 0 && (now - holdingsRenderLastAt) < throttleMs) {
    if (holdingsRenderThrottleTimer) return;
    const wait = Math.max(0, throttleMs - (now - holdingsRenderLastAt));
    holdingsRenderThrottleTimer = window.setTimeout(() => {
      holdingsRenderThrottleTimer = null;
      scheduleRenderHoldingsTable();
    }, wait);
    return;
  }

  if (holdingsRenderQueued) return;
  holdingsRenderQueued = true;
  requestAnimationFrame(() => {
    holdingsRenderQueued = false;
    holdingsRenderLastAt = Date.now();
    renderHoldingsTable();
  });
}

const state = {
  wallets: [],
  holdings: [],
  hiddenHoldings: new Set(),
  showHiddenHoldings: false,
  scanning: false,
  scanMeta: { completed: 0, total: 0 },
  lastScanFailedQueue: [],
  totalValue: 0,
  totalSolValue: 0,
  totalEvmValue: 0,
  totalChangeSolUsd: 0,
  totalChangeEvmUsd: 0,
  totalValueForChange: 0,
  totalValue24hAgo: 0,
  addressItems: [],
  viewMode: 'aggregate',
  scanAbortController: null,
  walletHoldings: new Map(),
  walletDayChange: new Map(),
  holdingsPage: 1,
  lastScanFailedQueue: [],
  watchlistTokens: [],
};

const STORAGE_KEY_WATCHLIST_TOKENS = 'looky_watchlist_tokens_v1';
const STORAGE_KEY_WATCHLIST_SORT = 'looky_watchlist_sort_v1';
const WATCHLIST_MAX_TOKENS = 5;

let lastWatchlistCount = null;
function updateWatchlistModeBtnCount() {
  try {
    const header = $('inputHeaderBar') || document;
    const badge = header.querySelector('.mode-toggle-wrap .watchlist-count') || header.querySelector('.watchlist-count');
    const numEl = header.querySelector('.mode-toggle-wrap .watchlist-count-num') || header.querySelector('.watchlist-count-num');
    if (!badge || !numEl) return;

    const count = Array.isArray(state.watchlistTokens) ? state.watchlistTokens.length : 0;
    numEl.textContent = String(count);
    badge.classList.toggle('is-zero', count <= 0);

    if (lastWatchlistCount == null) {
      lastWatchlistCount = count;
      return;
    }

    if (count !== lastWatchlistCount) {
      lastWatchlistCount = count;
      badge.classList.remove('is-bounce');
      void badge.offsetWidth;
      badge.classList.add('is-bounce');
    }
  } catch {}
}

function hiddenHoldingsStorageKey() {
  try {
    const profile = typeof getActiveProfileName === 'function' ? getActiveProfileName() : '';
    return `${STORAGE_KEY_HIDDEN_HOLDINGS}:${profile || 'default'}`;
  } catch {
    return `${STORAGE_KEY_HIDDEN_HOLDINGS}:default`;
  }
}

function showHiddenHoldingsStorageKey() {
  try {
    const profile = typeof getActiveProfileName === 'function' ? getActiveProfileName() : '';
    return `${STORAGE_KEY_SHOW_HIDDEN_HOLDINGS}:${profile || 'default'}`;
  } catch {
    return `${STORAGE_KEY_SHOW_HIDDEN_HOLDINGS}:default`;
  }
}

function loadHiddenHoldingsSet() {
  try {
    const raw = localStorage.getItem(hiddenHoldingsStorageKey());
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String).filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveHiddenHoldingsSet(set) {
  try {
    localStorage.setItem(hiddenHoldingsStorageKey(), JSON.stringify(Array.from(set || []).map(String).filter(Boolean)));
  } catch {}
}

function isHoldingHidden(key) {
  const k = String(key || '');
  if (!k) return false;
  return !!(state.hiddenHoldings && typeof state.hiddenHoldings.has === 'function' && state.hiddenHoldings.has(k));
}

function setHoldingHidden(key, hidden) {
  const k = String(key || '');
  if (!k) return;
  if (!(state.hiddenHoldings && typeof state.hiddenHoldings.add === 'function')) state.hiddenHoldings = new Set();

  const next = !!hidden;
  const had = state.hiddenHoldings.has(k);
  if (next && !had) state.hiddenHoldings.add(k);
  if (!next && had) state.hiddenHoldings.delete(k);

  hiddenHoldingsVersion++;
  try { saveHiddenHoldingsSet(state.hiddenHoldings); } catch {}
  try { invalidateHoldingsTableCache(); } catch {}
  try { setHoldingsPage(1); } catch {}
  try { scheduleRenderHoldingsTable(); } catch {}
}

function loadShowHiddenHoldingsPreference() {
  try {
    return localStorage.getItem(showHiddenHoldingsStorageKey()) === '1';
  } catch {
    return false;
  }
}

function setShowHiddenHoldingsPreference(enabled) {
  try { localStorage.setItem(showHiddenHoldingsStorageKey(), enabled ? '1' : '0'); } catch {}
}

function applyShowHiddenHoldings(enabled) {
  state.showHiddenHoldings = !!enabled;
  try { setShowHiddenHoldingsPreference(state.showHiddenHoldings); } catch {}
  try { setHoldingsPage(1); } catch {}
  try { scheduleRenderHoldingsTable(); } catch {}
}

function getWatchlistSortPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_WATCHLIST_SORT);
    const s = String(v || '').trim();
    if (s === 'name' || s === 'marketcap' || s === 'volume' || s === 'change24h') return s;
    return 'change24h';
  } catch {
    return 'change24h';
  }
}

function setWatchlistSortPreference(next) {
  const s = String(next || '').trim();
  const v = (s === 'name' || s === 'marketcap' || s === 'volume' || s === 'change24h') ? s : 'change24h';
  try { localStorage.setItem(STORAGE_KEY_WATCHLIST_SORT, v); } catch {}
}

function compareWatchlistTokens(a, b, sortKey) {
  const key = sortKey || 'change24h';

  if (key === 'name') {
    const an = String(a?.symbol || a?.name || '').toLowerCase();
    const bn = String(b?.symbol || b?.name || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
  }

  if (key === 'marketcap') {
    const av = Number(a?.marketCapUsd);
    const bv = Number(b?.marketCapUsd);
    const af = Number.isFinite(av);
    const bf = Number.isFinite(bv);
    if (af && bf && av !== bv) return bv - av;
    if (af && !bf) return -1;
    if (!af && bf) return 1;
  }

  if (key === 'volume') {
    const av = Number(a?.volume24hUsd);
    const bv = Number(b?.volume24hUsd);
    const af = Number.isFinite(av);
    const bf = Number.isFinite(bv);
    if (af && bf && av !== bv) return bv - av;
    if (af && !bf) return -1;
    if (!af && bf) return 1;
  }

  if (key === 'change24h') {
    const av = Number(a?.change24hPct);
    const bv = Number(b?.change24hPct);
    const af = Number.isFinite(av);
    const bf = Number.isFinite(bv);
    if (af && bf && av !== bv) return bv - av;
    if (af && !bf) return -1;
    if (!af && bf) return 1;
  }

  const an = String(a?.symbol || a?.name || '').toLowerCase();
  const bn = String(b?.symbol || b?.name || '').toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function canonicalizeChainForKey(chain) {
  const c = String(chain || '').toLowerCase().trim();
  if (!c) return '';
  if (c === 'sol' || c === 'solana') return 'solana';
  if (c === 'evm') return 'evm';
  if (
    c === 'eth' || c === 'ethereum' ||
    c === 'arb' || c === 'arbitrum' ||
    c === 'op' || c === 'optimism' ||
    c === 'base' ||
    c === 'poly' || c === 'polygon' || c === 'matic' ||
    c === 'bsc' || c === 'bnb' || c === 'binance' || c === 'bnbchain' || c === 'bnb-chain' ||
    c === 'avax' || c === 'avalanche' || c === 'avax-c' || c === 'avalanche-c'
  ) {
    return 'evm';
  }
  return c;
}

function canonicalizeNetworkForKey(chain, network) {
  const c = canonicalizeChainForKey(chain);
  const n = String(network || '').toLowerCase();
  if (c === 'solana') return '';
  if (c !== 'evm') return n;

  if (!n) return '';
  if (n === 'eth' || n === 'ethereum' || n === 'mainnet' || n === 'ethereum-mainnet') return 'ethereum';
  if (n === 'arb' || n === 'arbitrum' || n === 'arbitrum-one') return 'arbitrum';
  if (n === 'op' || n === 'optimism') return 'optimism';
  if (n === 'base') return 'base';
  if (n === 'poly' || n === 'polygon' || n === 'matic') return 'polygon';
  if (n === 'bsc' || n === 'binance' || n === 'bnb' || n === 'bnbchain' || n === 'bnb-chain') return 'bsc';
  if (n === 'avax' || n === 'avalanche' || n === 'avalanche-c' || n === 'avax-c') return 'avalanche';
  return n;
}

function normalizeWatchlistTokenKey(t) {
  const chain = canonicalizeChainForKey(t?.chain);
  const network = canonicalizeNetworkForKey(chain, String(t?.network || ''));
  const address = String(t?.address || '').trim();
  return `${chain}:${network}:${address}`.toLowerCase();
}

function getWatchlistMatchKey(t) {
  try {
    const list = Array.isArray(state.watchlistTokens) ? state.watchlistTokens : [];
    if (!list.length) return null;

    const chain = canonicalizeChainForKey(t?.chain);
    const address = String(t?.address || '').trim().toLowerCase();
    if (!chain || !address) return null;

    const key = normalizeWatchlistTokenKey(t);
    const exact = list.find((x) => normalizeWatchlistTokenKey(x) === key);
    if (exact) return normalizeWatchlistTokenKey(exact);

    if (chain === 'solana') {
      const byAddr = list.find((x) => canonicalizeChainForKey(x?.chain) === 'solana'
        && String(x?.address || '').trim().toLowerCase() === address);
      if (byAddr) return normalizeWatchlistTokenKey(byAddr);
    }

    if (chain === 'evm') {
      const byAddr = list.find((x) => String(x?.chain || '').toLowerCase() === 'evm'
        && String(x?.address || '').trim().toLowerCase() === address);
      if (byAddr) return normalizeWatchlistTokenKey(byAddr);
    }

    return null;
  } catch {
    return null;
  }
}

function isTokenInWatchlist(t) {
  try {
    return !!getWatchlistMatchKey(t);
  } catch {
    return false;
  }
}

function syncWatchlistStars() {
  try {
    const els = document.querySelectorAll('a.holding-action[data-action="watchlist-add"]');
    els.forEach((a) => {
      const chain = a.dataset.chain;
      const network = a.dataset.network;
      const address = a.dataset.address;
      const active = isTokenInWatchlist({ chain, network, address });
      a.classList.toggle('is-active', active);
      a.setAttribute('aria-label', active ? 'Remove from Favorites' : 'Add to Favorites');

      const icon = a.querySelector('i');
      if (!icon) return;
      icon.classList.toggle('fa-solid', active);
      icon.classList.toggle('fa-regular', !active);
      icon.classList.add('fa-heart');
    });
  } catch {}
}

function sanitizeWatchlistToken(raw) {
  try {
    const t = (raw && typeof raw === 'object') ? raw : {};
    const chain = canonicalizeChainForKey(t.chain);
    const network = canonicalizeNetworkForKey(chain, String(t.network || ''));
    const address = String(t.address || '').trim();
    if (!chain || !address) return null;

    return {
      chain,
      network,
      address,
      symbol: String(t.symbol || '').trim(),
      name: String(t.name || '').trim(),
      logoUrl: String(t.logoUrl || '').trim(),
      extensions: t.extensions || null,
      priceUsd: (t.priceUsd == null ? null : Number(t.priceUsd)),
      marketCapUsd: (t.marketCapUsd == null ? null : Number(t.marketCapUsd)),
      change24hPct: (t.change24hPct == null ? null : Number(t.change24hPct)),
      volume24hUsd: (t.volume24hUsd == null ? null : Number(t.volume24hUsd)),
      liquidityUsd: (t.liquidityUsd == null ? null : Number(t.liquidityUsd)),
      holders: (t.holders == null ? null : Number(t.holders)),
      circulatingSupply: (t.circulatingSupply == null ? null : Number(t.circulatingSupply)),
      trades24h: (t.trades24h == null ? null : Number(t.trades24h)),
      updatedAt: (t.updatedAt == null ? null : Number(t.updatedAt)),
    };
  } catch {
    return null;
  }
}

function loadWatchlistTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WATCHLIST_TOKENS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
      const t = sanitizeWatchlistToken(item);
      if (!t) continue;
      const key = normalizeWatchlistTokenKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= WATCHLIST_MAX_TOKENS) break;
    }
    updateWatchlistModeBtnCount();
    return out;
  } catch {
    return [];
  }
}

function saveWatchlistTokens(list) {
  try {
    localStorage.setItem(STORAGE_KEY_WATCHLIST_TOKENS, JSON.stringify(Array.isArray(list) ? list : []));
    updateWatchlistModeBtnCount();
  } catch {}
}

function addTokenToWatchlist(token) {
  const t = sanitizeWatchlistToken(token);
  if (!t) {
    setWatchlistHint('Invalid token.', 'error');
    hapticFeedback('error');
    return false;
  }

  const key = normalizeWatchlistTokenKey(t);
  const list = Array.isArray(state.watchlistTokens) ? [...state.watchlistTokens] : [];
  const exists = list.some((x) => normalizeWatchlistTokenKey(x) === key);
  if (exists) {
    hapticFeedback('light');
    return true;
  }

  if (list.length >= WATCHLIST_MAX_TOKENS) {
    setWatchlistHint(`Watchlist limit reached (${WATCHLIST_MAX_TOKENS}). Remove one first.`, 'error');
    hapticFeedback('error');
    return false;
  }

  list.unshift(t);
  state.watchlistTokens = list;
  watchlistDataVersion++;
  invalidateHoldingsTableCache();
  saveWatchlistTokens(list);
  renderWatchlist();
  try { syncWatchlistStars(); } catch {}
  try { updateWatchlistModeBtnCount(); } catch {}
  try { lockInputBodyHeight(); } catch {}
  return true;
}

function removeTokenFromWatchlistByKey(key) {
  const k = String(key || '').toLowerCase();
  if (!k) return;
  const list = Array.isArray(state.watchlistTokens) ? state.watchlistTokens : [];
  const removed = list.find((t) => normalizeWatchlistTokenKey(t) === k);
  const next = list.filter((t) => normalizeWatchlistTokenKey(t) !== k);
  state.watchlistTokens = next;
  watchlistDataVersion++;
  invalidateHoldingsTableCache();
  saveWatchlistTokens(next);
  renderWatchlist();
  try { syncWatchlistStars(); } catch {}
  try { updateWatchlistModeBtnCount(); } catch {}
  hapticFeedback('light');
}

function renderWatchlist() {
  const body = $('watchlistBody');
  if (!body) return;

  const controls = document.querySelector('#watchlistPanel .watchlist-controls');
  const sortKey = getWatchlistSortPreference();
  const list = Array.isArray(state.watchlistTokens) ? [...state.watchlistTokens].sort((a, b) => compareWatchlistTokens(a, b, sortKey)) : [];

  if (controls) controls.classList.toggle('hidden', !list.length);
  if (!list.length) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-text">Your favorites are empty. Add tokens using the <strong>heart</strong> on Search results or Portfolio holdings.</div>
      </div>
    `;
    if (body.innerHTML !== emptyHtml) {
      body.innerHTML = emptyHtml;
    }
    try { lockInputBodyHeight(); } catch {}
    try { syncWatchlistStars(); } catch {}
    try { updateWatchlistModeBtnCount(); } catch {}
    return;
  }

  // Check if we can manipulate existing DOM instead of using innerHTML
  const existingRows = Array.from(body.querySelectorAll('.holding-row.holding-card-row'));
  const existingKeys = new Set(existingRows.map(r => r.dataset.key).filter(Boolean));
  const listKeys = new Set(list.map(t => normalizeWatchlistTokenKey(t)));
  
  // Check if all items exist in the DOM
  const allItemsExist = list.every(t => existingKeys.has(normalizeWatchlistTokenKey(t)));
  const canManipulateDOM = existingRows.length > 0 && body.dataset.hasRendered === 'true' && allItemsExist;
  
  if (canManipulateDOM) {
    // Use DOM manipulation to avoid image re-requests
    
    // Remove rows that are no longer in the list
    existingRows.forEach((row) => {
      const key = row.dataset.key;
      if (key && !listKeys.has(key)) {
        row.remove();
      }
    });
    
    // Update metrics for existing rows and reorder
    list.forEach((token) => {
      const key = normalizeWatchlistTokenKey(token);
      const row = existingRows.find(r => r.dataset.key === key);
      if (row) {
        // Update metric values
        const price = token.priceUsd != null && Number.isFinite(Number(token.priceUsd)) ? formatPrice(Number(token.priceUsd)) : '—';
        const mcap = token.marketCapUsd != null && Number.isFinite(Number(token.marketCapUsd)) ? `$${formatCompactNumber(Number(token.marketCapUsd))}` : '—';
        const vol = token.volume24hUsd != null && Number.isFinite(Number(token.volume24hUsd)) ? `$${formatCompactNumber(Number(token.volume24hUsd))}` : '—';
        
        const changePct = Number(token.change24hPct);
        const changeText = Number.isFinite(changePct) ? formatPct(changePct, 2) : '—';
        const changeClass = Number.isFinite(changePct)
          ? (changePct > 0 ? 'pnl-positive' : changePct < 0 ? 'pnl-negative' : 'pnl-flat')
          : '';
        
        // Update mcap
        const mcapEl = row.querySelector('[data-wl-field="mcap"]');
        if (mcapEl) mcapEl.textContent = mcap;
        
        // Update price
        const priceEl = row.querySelector('[data-wl-field="price"]');
        if (priceEl) priceEl.textContent = price;
        
        // Update change
        const changeEl = row.querySelector('[data-wl-field="change"]');
        if (changeEl) {
          changeEl.textContent = changeText;
          changeEl.className = changeClass;
        }
        
        // Update liquidity
        const liqEl = row.querySelector('[data-wl-field="liq"]');
        const liq = token.liquidityUsd != null && Number.isFinite(Number(token.liquidityUsd)) ? `$${formatCompactNumber(Number(token.liquidityUsd))}` : '—';
        if (liqEl) liqEl.textContent = liq;
        
        // Update volume
        const volEl = row.querySelector('[data-wl-field="vol"]');
        if (volEl) volEl.textContent = vol;
        
        // Update holders
        const holdersEl = row.querySelector('[data-wl-field="holders"]');
        const holders = token.holders != null && Number.isFinite(Number(token.holders)) ? formatCompactNumber(Number(token.holders)) : '—';
        if (holdersEl) holdersEl.textContent = holders;
        
        // Update circulating supply
        const circEl = row.querySelector('[data-wl-field="circ"]');
        const circ = token.circulatingSupply != null && Number.isFinite(Number(token.circulatingSupply)) ? formatCompactNumber(Number(token.circulatingSupply)) : '—';
        if (circEl) circEl.textContent = circ;
        
        // Update trades
        const tradesEl = row.querySelector('[data-wl-field="trades"]');
        const trades = token.trades24h != null && Number.isFinite(Number(token.trades24h)) ? formatCompactNumber(Number(token.trades24h)) : '—';
        if (tradesEl) tradesEl.textContent = trades;
        
        body.appendChild(row);  // Move to end in correct order
      }
    });
    
    try { lockInputBodyHeight(); } catch {}
    try { syncWatchlistStars(); } catch {}
    try { updateWatchlistModeBtnCount(); } catch {}
    return;
  }

  const html = list.map((t) => {
    const icon = resolveTokenIcon(t.logoUrl, t.symbol || t.name, { preferFast: false });
    const key = normalizeWatchlistTokenKey(t);
    const ipfsAttrs = icon.cid
      ? `data-ipfs-cid="${escapeAttribute(icon.cid)}" data-gateway-idx="0"`
      : '';

    const explorerHref = (t.chain === 'solana')
      ? `https://solscan.io/token/${t.address}`
      : `${evmExplorerBase(t.network)}/token/${t.address}`;

    const price = t.priceUsd != null && Number.isFinite(Number(t.priceUsd)) ? formatPrice(Number(t.priceUsd)) : '—';
    const mcap = t.marketCapUsd != null && Number.isFinite(Number(t.marketCapUsd)) ? `$${formatCompactNumber(Number(t.marketCapUsd))}` : '—';
    const vol = t.volume24hUsd != null && Number.isFinite(Number(t.volume24hUsd)) ? `$${formatCompactNumber(Number(t.volume24hUsd))}` : '—';

    const changePct = Number(t.change24hPct);
    const changeText = Number.isFinite(changePct) ? formatPct(changePct, 2) : '—';
    const changeClass = Number.isFinite(changePct)
      ? (changePct > 0 ? 'pnl-positive' : changePct < 0 ? 'pnl-negative' : 'pnl-flat')
      : '';

    const chainLogoUrl = getChainLogoUrl(t.chain, t.network);
    const chainLabel = t.chain === 'solana' ? 'SOL' : evmNetworkLabel(t.network);

    return `
      <div class="holding-row holding-card-row" data-key="${escapeAttribute(key)}">
        <div class="holding-card">
          <div class="holding-card-header">
            <div class="token-cell">
              <img class="token-icon" src="${escapeAttribute(icon.src)}" ${ipfsAttrs} onerror="handleSearchTokenIconError(this,'${escapeAttribute(icon.fallback)}')" alt="" />
              <div class="token-info">
                <div class="token-symbol">${escapeHtml(t.symbol || tokenIconLabel(t.name))}</div>
                <div class="token-name">${escapeHtml(t.name || '')}</div>
              </div>
            </div>

            <div class="holding-card-header-right">
              <div class="holding-card-actions" aria-label="Favorites actions">
                <a class="holding-action is-active" href="#" data-action="watchlist-remove" data-watchlist-key="${escapeAttribute(key)}" aria-label="Remove from Favorites">
                  <i class="fa-solid fa-heart" aria-hidden="true"></i>
                </a>
                <a class="holding-action" href="#" data-action="copy-contract" data-address="${escapeAttribute(String(t.address || ''))}" aria-label="Copy contract address">
                  <i class="fa-regular fa-copy" aria-hidden="true"></i>
                </a>
                <a class="holding-action holding-action-explorer" href="${escapeAttribute(explorerHref)}" target="_blank" rel="noopener noreferrer" aria-label="View on ${escapeAttribute(chainLabel)} Explorer">
                  <img class="chain-logo-action" src="${escapeAttribute(chainLogoUrl)}" alt="${escapeAttribute(chainLabel)}" />
                </a>
                <a class="holding-action" href="#" data-action="chart" data-chain="${escapeAttribute(String(t.chain || ''))}" data-network="${escapeAttribute(String(t.network || ''))}" data-address="${escapeAttribute(String(t.address || ''))}" data-symbol="${escapeAttribute(String(t.symbol || ''))}" data-name="${escapeAttribute(String(t.name || ''))}" aria-label="View Chart">
                  <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                </a>
                <div class="chart-popover hidden" role="menu" aria-label="Chart providers">
                  <a class="chart-popover-link" role="menuitem" data-provider="dexscreener" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dexscreener">
                    <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.dexscreener) ? window.__peeekChartIcons.dexscreener : 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64','D');">
                  </a>
                  <a class="chart-popover-link" role="menuitem" data-provider="dextools" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dextools">
                    <img class="chart-popover-icon" alt="" src="https://cdn.worldvectorlogo.com/logos/dextools.svg" onerror="this.onerror=null;this.style.display='none';this.parentElement.textContent='T';">
                  </a>
                  <a class="chart-popover-link" role="menuitem" data-provider="birdeye" href="#" target="_blank" rel="noopener noreferrer" aria-label="Birdeye">
                    <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.birdeye) ? window.__peeekChartIcons.birdeye : 'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64','B');">
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="holding-card-metrics">
            <div class="holding-metric"><div class="holding-metric-label">Market Cap</div><div class="holding-metric-value mono"><strong data-wl-field="mcap" tabindex="0">${escapeHtml(mcap)}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">Price</div><div class="holding-metric-value mono"><strong data-wl-field="price" tabindex="0">${escapeHtml(price)}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">24h Change</div><div class="holding-metric-value mono"><strong class="${changeClass}" data-wl-field="change" tabindex="0">${escapeHtml(changeText)}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">Liquidity</div><div class="holding-metric-value mono"><strong data-wl-field="liq" tabindex="0">${escapeHtml(t.liquidityUsd != null && Number.isFinite(Number(t.liquidityUsd)) ? `$${formatCompactNumber(Number(t.liquidityUsd))}` : '—')}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">24h Volume</div><div class="holding-metric-value mono"><strong data-wl-field="vol" tabindex="0">${escapeHtml(vol)}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">Holders</div><div class="holding-metric-value mono"><strong data-wl-field="holders" tabindex="0">${escapeHtml(t.holders != null && Number.isFinite(Number(t.holders)) ? formatCompactNumber(Number(t.holders)) : '—')}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">Circulating Supply</div><div class="holding-metric-value mono"><strong data-wl-field="circ" tabindex="0">${escapeHtml(t.circulatingSupply != null && Number.isFinite(Number(t.circulatingSupply)) ? formatCompactNumber(Number(t.circulatingSupply)) : '—')}</strong></div></div>
            <div class="holding-metric"><div class="holding-metric-label">Trades (24h)</div><div class="holding-metric-value mono"><strong data-wl-field="trades" tabindex="0">${escapeHtml(t.trades24h != null && Number.isFinite(Number(t.trades24h)) ? formatCompactNumber(Number(t.trades24h)) : '—')}</strong></div></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  watchlistCache.html = html;
  watchlistCache.version = watchlistDataVersion;
  watchlistCache.sortKey = sortKey;

  if (body.innerHTML !== html) {
    body.innerHTML = html;
    body.dataset.hasRendered = 'true';
  }

  try { lockInputBodyHeight(); } catch {}
  try { syncWatchlistStars(); } catch {}
  try { updateWatchlistModeBtnCount(); } catch {}
}

async function refreshWatchlistMetrics({ force } = {}) {
  const list = Array.isArray(state.watchlistTokens) ? state.watchlistTokens : [];
  if (!list.length) return;

  const updated = [];
  for (const token of list) {
    try {
      const fresh = await runTokenSearch(token.address, {
        chain: token.chain,
        network: token.network,
      });
      updated.push(fresh);
    } catch {
      updated.push(token);
    }
  }

  state.watchlistTokens = updated;
  watchlistDataVersion++;
  saveWatchlistTokens(updated);
  renderWatchlist();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsvCell(value) {
  const s = value == null ? '' : String(value);
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildHoldingsCsv(holdings) {
  const header = [
    'Token',
    'Symbol',
    'Chain',
    'Network',
    'Balance',
    'Price',
    'ValueUsd',
    'Mcap',
    'ChangeUsd',
    'TokenAddress',
    'SourcesCount',
    'Sources',
  ];

  const rows = holdings.map((h) => {
    const sources = Array.isArray(h.sources) ? h.sources : [];
    const sourcesStr = sources.join(' | ');
    return [
      toCsvCell(h.name),
      toCsvCell(h.symbol),
      toCsvCell(h.chain),
      toCsvCell(h.network || ''),
      toCsvCell(h.balance),
      toCsvCell(h.price),
      toCsvCell(h.value),
      toCsvCell(h.mcap),
      toCsvCell(h.changeUsd),
      toCsvCell(h.address),
      toCsvCell(sources.length),
      toCsvCell(sourcesStr),
    ].join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

function buildHoldingsJson() {
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    totals: {
      totalValueUsd: Number(state.totalValue || 0) || 0,
      totalSolValueUsd: Number(state.totalSolValue || 0) || 0,
      totalEvmValueUsd: Number(state.totalEvmValue || 0) || 0,
      totalChangeSolUsd: Number(state.totalChangeSolUsd || 0) || 0,
      totalChangeEvmUsd: Number(state.totalChangeEvmUsd || 0) || 0,
    },
    wallets: Array.isArray(state.wallets) ? state.wallets : [],
    holdings: Array.isArray(state.holdings) ? state.holdings : [],
  };
}

function scanCacheKey(chain, wallet) {
  return `${chain}:${wallet}`;
}

function getScanCache(chain, wallet) {
  const key = scanCacheKey(chain, wallet);
  const entry = scanCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.ts) > SCAN_CACHE_TTL_MS) {
    scanCache.delete(key);
    return null;
  }
  return entry;
}

function setScanCache(chain, wallet, payload) {
  const key = scanCacheKey(chain, wallet);
  scanCache.set(key, { ts: Date.now(), ...payload });
}

function buildWalletQueue() {
  const valid = state.addressItems.filter(a => a.type === 'solana' || a.type === 'evm');
  const solanaWallets = valid.filter(a => a.type === 'solana').map(a => a.raw);
  const evmWallets = valid.filter(a => a.type === 'evm').map(a => a.raw);
  const base = [
    ...solanaWallets.map(w => ({ wallet: w, chain: 'solana' })),
    ...evmWallets.map(w => ({ wallet: w, chain: 'evm' })),
  ];
  return base.map((item, index) => ({ ...item, index }));
}

let recomputeQueued = false;
let recomputeLastAt = 0;
let recomputeThrottleTimer = null;
function scheduleRecomputeAggregatesAndRender() {
  const now = Date.now();
  const throttleMs = state.scanning ? 450 : 0;

  if (throttleMs > 0 && (now - recomputeLastAt) < throttleMs) {
    if (recomputeThrottleTimer) return;
    const wait = Math.max(0, throttleMs - (now - recomputeLastAt));
    recomputeThrottleTimer = window.setTimeout(() => {
      recomputeThrottleTimer = null;
      scheduleRecomputeAggregatesAndRender();
    }, wait);
    return;
  }

  if (recomputeQueued) return;
  recomputeQueued = true;
  requestAnimationFrame(() => {
    recomputeQueued = false;
    recomputeLastAt = Date.now();
    recomputeAggregatesAndRender();
  });
}

function setHoldingsPage(page) {
  const p = Number(page);
  state.holdingsPage = Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

const mcapCache = new Map();
const MCAP_CACHE_TTL_MS = 10 * 60 * 1000;
const MCAP_MAX_LOOKUPS_PER_RENDER = 80;
const MCAP_CONCURRENCY = 4;

let statusHideTimer = null;
function hapticFeedback() {}

function shortenAddress(address) {
  if (!address) return address;
  const s = String(address);
  if (s.length <= 8) return s;
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

function formatCurrency(value) {
  const num = Number(value);
  if (!isFinite(num)) return '$0.00';

  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
  } catch {
    return String(Math.round(n));
  }
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

function tokenIconLabel(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  return (s.match(/[A-Z0-9]/g) || []).slice(0, 3).join('') || '•';
}

function getTokenIconUrl(logoUrl, symbol) {
  const url = String(logoUrl || '').trim();
  return url ? url : tokenIconDataUri(symbol);
}

function getFastTokenIconUrl(logoUrl, symbol) {
  const raw = String(logoUrl || '').trim();
  if (!raw) return tokenIconDataUri(symbol);
  const cid = extractIpfsCid(raw);
  if (cid) return tokenIconDataUri(symbol);
  return getTokenIconUrl(normalizeTokenLogoUrl(raw), symbol);
}

const tokenIconResolvedCache = new Map();
const TOKEN_ICON_RESOLVE_TTL_MS = 30 * 60 * 1000;

function resolveTokenIcon(logoUrl, symbol, { preferFast = true } = {}) {
  const raw = String(logoUrl || '').trim();
  const sym = String(symbol || '').trim();
  const fallback = tokenIconDataUri(sym);
  if (!raw) return { src: fallback, fallback, cid: null };

  const cid = extractIpfsCid(raw);
  if (!cid) {
    const src = preferFast ? getFastTokenIconUrl(raw, sym) : getTokenIconUrl(normalizeTokenLogoUrl(raw), sym);
    return { src, fallback, cid: null };
  }

  try {
    const cached = tokenIconResolvedCache.get(cid);
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt && cached.src) {
      return { src: cached.src, fallback, cid };
    }
  } catch {}

  // Immediate candidate so we render something quickly.
  const first = ipfsGatewayUrl(cid, 0);
  try {
    tokenIconResolvedCache.set(cid, { src: first, expiresAt: Date.now() + TOKEN_ICON_RESOLVE_TTL_MS });
  } catch {}
  return { src: first, fallback, cid };
}

function normalizeTokenLogoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('ipfs://')) {
    const cid = raw.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return ipfsGatewayUrl(cid, 0);
  }
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

const IPFS_GATEWAYS = [
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

const ipfsLogoResolveCache = new Map();
const ipfsLogoResolveFailCache = new Map();
const IPFS_FAIL_CACHE_TTL_MS = 15 * 60 * 1000;

async function probeUrl(url, timeoutMs) {
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 1500)) : null;
  try {
    // no-cors avoids CORS issues on some gateways; a resolved promise is enough to indicate reachability.
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'force-cache',
      ...(controller ? { signal: controller.signal } : {}),
    });
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveIpfsLogoUrl(cid, { timeoutMs = 1500 } = {}) {
  const cleanCid = String(cid || '').trim();
  if (!cleanCid) return null;

  const failHit = ipfsLogoResolveFailCache.get(cleanCid);
  if (failHit && (Date.now() - failHit.ts) < IPFS_FAIL_CACHE_TTL_MS) {
    return null;
  }

  try {
    const cached = ipfsLogoResolveCache.get(cleanCid);
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt && cached.value) {
      return cached.value;
    }
  } catch {}

  // Race all gateways; take the first reachable.
  const candidates = IPFS_GATEWAYS.map((base, idx) => ({ idx, url: `${base}${cleanCid}` }));
  const results = await Promise.all(candidates.map(async (c) => ({ ...c, ok: await probeUrl(c.url, Math.min(600, timeoutMs)) }))); 
  const winner = results.find(r => r.ok) || null;
  const resolved = winner ? { url: winner.url, idx: winner.idx } : null;
  if (!resolved) {
    ipfsLogoResolveFailCache.set(cleanCid, { ts: Date.now() });
  }

  try {
    ipfsLogoResolveCache.set(cleanCid, {
      value: resolved,
      expiresAt: Date.now() + (30 * 60 * 1000),
    });
  } catch {}

  return resolved;
}

function extractIpfsCid(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (raw.startsWith('ipfs://')) return raw.slice('ipfs://'.length).replace(/^ipfs\//, '') || null;

  for (const prefix of IPFS_GATEWAYS) {
    if (raw.startsWith(prefix)) {
      const cid = raw.slice(prefix.length);
      return cid || null;
    }
  }

  const m = raw.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i);
  if (m && m[1]) return m[1];
  return null;
}

function ipfsGatewayUrl(cid, idx) {
  const i = Number(idx) || 0;
  const base = IPFS_GATEWAYS[Math.max(0, Math.min(IPFS_GATEWAYS.length - 1, i))];
  return `${base}${cid}`;
}

function handleSearchTokenIconError(imgEl, fallbackDataUri) {
  try {
    const cid = imgEl?.dataset?.ipfsCid;
    if (!cid) {
      imgEl.onerror = null;
      imgEl.src = fallbackDataUri;
      return;
    }

    // If we already resolved a good gateway for this CID, jump straight to it.
    try {
      const cached = tokenIconResolvedCache.get(cid);
      if (cached && cached.expiresAt && Date.now() < cached.expiresAt && cached.src && cached.src !== imgEl.src) {
        imgEl.src = cached.src;
        return;
      }
    } catch {}

    try {
      const currentSrc = String(imgEl.currentSrc || imgEl.src || '');
      if (currentSrc && /https?:\/\/(?:[^/]+\.)?ipfs\.io\/ipfs\//i.test(currentSrc)) {
        imgEl.src = ipfsGatewayUrl(cid, 0);
        return;
      }
      const usingKnownGateway = IPFS_GATEWAYS.some((base) => currentSrc.startsWith(base));
      if (!usingKnownGateway) {
        imgEl.dataset.gatewayIdx = '0';
        imgEl.src = ipfsGatewayUrl(cid, 0);
        return;
      }
    } catch {}

    const current = Number(imgEl.dataset.gatewayIdx || '0') || 0;
    const next = current + 1;

    if (next < IPFS_GATEWAYS.length) {
      imgEl.dataset.gatewayIdx = String(next);
      const nextUrl = ipfsGatewayUrl(cid, next);
      imgEl.src = nextUrl;
      try { tokenIconResolvedCache.set(cid, { src: nextUrl, expiresAt: Date.now() + TOKEN_ICON_RESOLVE_TTL_MS }); } catch {}
      return;
    }

    imgEl.onerror = null;
    imgEl.src = fallbackDataUri;
  } catch {
    try {
      imgEl.onerror = null;
      imgEl.src = fallbackDataUri;
    } catch {}
  }
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
    const isValid = classified.type === 'solana' || classified.type === 'evm' || classified.type === 'solana-domain';
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

function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveProfiles(profiles) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles || {}));
  } catch {}
}

function loadUiSectionState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UI_SECTIONS);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUiSectionState(next) {
  try {
    localStorage.setItem(STORAGE_KEY_UI_SECTIONS, JSON.stringify(next || {}));
  } catch {
  }
}

function forceCollapseResultsSections() {
  const holdingsCard = $('holdingsCard');
  const holdingsToggle = $('holdingsToggle');
  const holdingsContent = $('holdingsContent');

  const allocRiskCard = $('allocRiskCard');
  const allocRiskToggle = $('allocRiskToggle');
  const allocRiskContent = $('allocRiskContent');

  const walletHoldingsCard = $('walletHoldingsCard');
  const walletHoldingsToggle = $('walletHoldingsToggle');
  const walletHoldingsContent = $('walletHoldingsContent');

  const portfolioScoreCard = $('portfolioScoreCard');
  const portfolioScoreToggle = $('portfolioScoreToggle');
  const portfolioScoreContent = $('portfolioScoreContent');

  if (holdingsCard && holdingsToggle && holdingsContent) {
    holdingsCard.classList.add('is-collapsed');
    holdingsToggle.setAttribute('aria-expanded', 'false');
    holdingsContent.classList.add('hidden');
  }

  if (allocRiskCard && allocRiskToggle && allocRiskContent) {
    allocRiskCard.classList.add('is-collapsed');
    allocRiskToggle.setAttribute('aria-expanded', 'false');
    allocRiskContent.classList.add('hidden');
  }

  if (walletHoldingsCard && walletHoldingsToggle && walletHoldingsContent) {
    walletHoldingsCard.classList.add('is-collapsed');
    walletHoldingsToggle.setAttribute('aria-expanded', 'false');
    walletHoldingsContent.classList.add('hidden');
  }

  if (portfolioScoreCard && portfolioScoreToggle && portfolioScoreContent) {
    portfolioScoreCard.classList.add('is-collapsed');
    portfolioScoreToggle.setAttribute('aria-expanded', 'false');
    portfolioScoreContent.classList.add('hidden');
  }

  const uiSections = loadUiSectionState();
  uiSections.holdings = false;
  uiSections.allocRisk = false;
  uiSections.walletHoldings = false;
  uiSections.portfolioScore = false;
  saveUiSectionState(uiSections);
}

function getActiveProfileName() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_ACTIVE_PROFILE);
    return v ? String(v) : '';
  } catch {
    return '';
  }
}

function setActiveProfileName(name) {
  try {
    if (!name) localStorage.removeItem(STORAGE_KEY_ACTIVE_PROFILE);
    else localStorage.setItem(STORAGE_KEY_ACTIVE_PROFILE, String(name));
  } catch {}
}

function computeWhatChangedToday() {
  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  const totalNow = Number(state.totalValueForChange || 0) || 0;
  const total24hAgo = Number(state.totalValue24hAgo || 0) || 0;
  const totalDeltaUsd = totalNow - total24hAgo;

  // Aggregate token changes by symbol to avoid double-counting tokens across wallets
  const tokenChanges = new Map();
  holdings.forEach((h) => {
    const symbol = String(h?.symbol || '—');
    const deltaUsd = Number(h?.changeUsd ?? 0) || 0;
    const valueUsd = Number(h?.value ?? 0) || 0;
    const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean) : [];
    const uniqueSources = Array.from(new Set(sources));
    const walletCount = Math.max(1, uniqueSources.length);
    
    // Divide the change equally among wallets holding this token
    const deltaPerWallet = deltaUsd / walletCount;
    const valuePerWallet = valueUsd / walletCount;
    
    if (!tokenChanges.has(symbol)) {
      tokenChanges.set(symbol, { symbol, deltaUsd: 0, valueUsd: 0 });
    }
    const existing = tokenChanges.get(symbol);
    existing.deltaUsd += deltaPerWallet;
    existing.valueUsd += valuePerWallet;
  });
  
  const topTokens = Array.from(tokenChanges.values())
    .filter(t => Number.isFinite(t.deltaUsd) && Math.abs(t.deltaUsd) > 0)
    .sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd))
    .slice(0, 6);

  const walletDeltas = [];
  try {
    state.walletHoldings?.forEach((items, walletKey) => {
      const [chain, wallet] = String(walletKey).split(':');
      let delta = 0;
      (Array.isArray(items) ? items : []).forEach((h) => {
        const d = Number(
          h?.changeUsd ??
          h?.change_usd ??
          h?.change_1d_usd ??
          h?.value_change_1d ??
          h?.value_change_24h ??
          h?.valueChange1d ??
          h?.pnlUsd ??
          0
        ) || 0;

        if (chain === 'solana') {
          const eligible = h?._changeEligible !== false;
          if (!eligible) return;
        }

        delta += d;
      });
      if (Math.abs(delta) > 0) walletDeltas.push({ chain, wallet, deltaUsd: delta });
    });
  } catch {}

  walletDeltas.sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd));
  const topWallet = walletDeltas[0] || null;

  return {
    totalDeltaUsd,
    topTokens,
    topWallet,
  };
}

// Compact encoding: s|address|e|address (s=solana, e=evm)
// Then compress with LZ-string-like algorithm and base64
function encodeShareParamFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return '';
  
  try {
    // Format: chain_type|address|chain_type|address...
    // s = solana, e = evm
    const compact = list
      .filter(Boolean)
      .slice(0, MAX_ADDRESSES)
      .map(x => {
        const type = (x.type === 'solana' || x.type === 'solana-domain') ? 's' : 'e';
        return `${type}|${x.raw}`;
      })
      .join('|');
    
    // Simple compression: replace common patterns
    let compressed = compact
      .replace(/\|s\|/g, '~')  // |s| -> ~
      .replace(/\|e\|/g, '^')  // |e| -> ^
      .replace(/^s\|/, 'S')    // s| at start -> S
      .replace(/^e\|/, 'E');   // e| at start -> E
    
    return btoa(unescape(encodeURIComponent(compressed)));
  } catch {
    return '';
  }
}

function decodeShareParamToRawList(param) {
  if (!param) return null;
  try {
    let decoded = decodeURIComponent(escape(atob(String(param))));
    
    // Decompress: restore patterns
    decoded = decoded
      .replace(/~/g, '|s|')
      .replace(/\^/g, '|e|')
      .replace(/^S/, 's|')
      .replace(/^E/, 'e|');
    
    const parts = decoded.split('|');
    const addresses = [];
    
    for (let i = 0; i < parts.length - 1; i += 2) {
      const type = parts[i];
      const addr = parts[i + 1];
      if ((type === 's' || type === 'e') && addr) {
        addresses.push(addr.trim());
      }
    }
    
    return addresses.slice(0, MAX_ADDRESSES);
  } catch {
    // Fallback: try old format for backward compatibility
    try {
      const json = decodeURIComponent(escape(atob(String(param))));
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .map(x => String(x?.a || '').trim())
        .filter(Boolean)
        .slice(0, MAX_ADDRESSES);
    } catch {
      return null;
    }
  }
}

function buildShareUrlFromCurrent() {
  const w = encodeShareParamFromItems(state.addressItems);
  const url = new URL(window.location.href);
  url.searchParams.set('w', w);
  return url.toString();
}

function applyAddressesFromUrlIfPresent() {
  const url = new URL(window.location.href);
  const param = url.searchParams.get('w');
  const rawList = decodeShareParamToRawList(param);
  if (!rawList || rawList.length === 0) return false;

  const parsed = getAddressItemsFromText(rawList.join('\n'));
  setAddressItems(parsed.items, { showWarning: parsed.truncated });
  return true;
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
    const badge = (item.type === 'solana' || item.type === 'solana-domain') ? 'SOL' : item.type === 'evm' ? 'EVM' : 'Invalid';
    const cls = (item.type === 'solana' || item.type === 'solana-domain') ? 'solana' : item.type === 'evm' ? 'evm' : 'invalid';
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
  const hasValid = (solana + evm) > 0;
  $('inputHeader')?.classList.toggle('hidden', !hasAny);
  $('chainBadges')?.classList.toggle('hidden', !hasAny);
  $('shareLinkBtn')?.classList.toggle('hidden', !hasValid);
  $('saveProfileBtn')?.classList.toggle('hidden', !hasValid);
  $('deleteProfileBtn')?.classList.toggle('hidden', !hasValid);
  $('profilesBar')?.classList.toggle('hidden', !hasValid);

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
  const isValid = classified.type === 'solana' || classified.type === 'evm' || classified.type === 'solana-domain';
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

  if (classified.type === 'solana-domain') {
    showInputHint('Solana .sol domains are saved but not scannable yet (ignored on scan).', 'info');
  }

  persistAddressItems();
  renderAddressChips();
  updateAddressStats();

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
const API = {
  zerion: '/api/zerion',
  birdeye: '/api/birdeye',
};
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

async function runTokenSearch(address, { signal, chain, network } = {}) {
  const raw = String(address || '').trim();
  if (!raw) throw new Error('Missing token address');

  const classified = classifyAddress(raw);
  const inferredChain = chain
    ? canonicalizeChainForKey(chain)
    : (classified?.type === 'solana' ? 'solana' : classified?.type === 'evm' ? 'evm' : '');

  if (!inferredChain) throw new Error('Invalid token address');

  const resolvedNetwork = inferredChain === 'evm'
    ? normalizeEvmNetwork(network || '')
    : '';

  if (inferredChain === 'evm' && !isValidEvmContractAddress(raw)) {
    throw new Error('Invalid EVM token address');
  }

  const overview = await birdeyeRequest('/defi/token_overview', {
    address: raw,
    ui_amount_mode: 'scaled',
  }, {
    signal,
    headers: {
      'x-chain': birdeyeXChain(inferredChain === 'solana' ? 'solana' : (resolvedNetwork || 'ethereum')),
    },
  });

  const data = overview?.data || {};
  const ext = normalizeExtensions(data?.extensions);

  const priceUsd = Number(
    data?.price ??
    data?.priceUsd ??
    data?.price_usd ??
    data?.value?.price ??
    data?.value?.priceUsd ??
    0
  );

  const marketCapUsd = Number(
    data?.marketCap ??
    data?.market_cap ??
    data?.marketcap ??
    data?.fdv ??
    data?.fdv_usd ??
    0
  );

  const volume24hUsd = Number(
    data?.v24hUSD ??
    data?.v24h_usd ??
    data?.volume24h ??
    data?.volume24hUsd ??
    data?.volume_24h ??
    data?.volume_24h_usd ??
    0
  );

  const liquidityUsd = Number(
    data?.liquidity ??
    data?.liquidityUsd ??
    data?.liquidity_usd ??
    data?.liquidity_1d ??
    0
  );

  const holders = Number(
    data?.holders ??
    data?.holdersCount ??
    data?.holders_count ??
    data?.holder ??
    data?.holderCount ??
    data?.holder_count ??
    data?.stats?.holders ??
    data?.stats?.holdersCount ??
    data?.stats?.holders_count ??
    data?.value?.holders ??
    data?.value?.holdersCount ??
    0
  );

  const circulatingSupply = Number(
    data?.circulatingSupply ??
    data?.circulating_supply ??
    data?.circulating_supply_value ??
    0
  );

  const trades24h = Number(
    data?.trades24h ??
    data?.trades_24h ??
    data?.trades_24h_count ??
    data?.trade24h ??
    data?.trade_24h ??
    data?.trade_24h_count ??
    data?.txns24h ??
    data?.txns_24h ??
    data?.txns_24h_count ??
    data?.stats?.trades24h ??
    data?.stats?.txns24h ??
    data?.value?.trades24h ??
    0
  );

  const change24hPct = Number(
    data?.priceChange24hPercent ??
    data?.price_change_24h_percent ??
    data?.price_change_24h_percent_value ??
    data?.priceChangePercent ??
    data?.price_change_percent ??
    0
  );

  const symbol = String(data?.symbol || '').trim();
  const name = String(data?.name || '').trim();
  const logoUrl = String(data?.logoURI ?? data?.logo_uri ?? data?.logoUrl ?? data?.logo_url ?? '').trim();

  return {
    address: raw,
    chain: inferredChain,
    network: inferredChain === 'evm' ? resolvedNetwork : '',
    chainShort: inferredChain === 'solana' ? 'SOL' : evmNetworkLabel(resolvedNetwork),
    symbol,
    name,
    logoUrl,
    extensions: ext,
    priceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null,
    marketCapUsd: Number.isFinite(marketCapUsd) && marketCapUsd > 0 ? marketCapUsd : null,
    volume24hUsd: Number.isFinite(volume24hUsd) && volume24hUsd > 0 ? volume24hUsd : null,
    liquidityUsd: Number.isFinite(liquidityUsd) && liquidityUsd > 0 ? liquidityUsd : null,
    holders: Number.isFinite(holders) && holders > 0 ? holders : null,
    circulatingSupply: Number.isFinite(circulatingSupply) && circulatingSupply > 0 ? circulatingSupply : null,
    trades24h: Number.isFinite(trades24h) && trades24h > 0 ? trades24h : null,
    change24hPct: Number.isFinite(change24hPct) ? change24hPct : null,
    updatedAt: Date.now(),
  };
}

async function fetchEvmWalletPnl(wallet, { signal } = {}) {
  const cached = getWalletPnlCache('evm', wallet);
  if (cached) return cached;

  const url = new URL(API.zerion, window.location.origin);
  url.searchParams.set('path', `/v1/wallets/${String(wallet).trim()}/pnl`);
  url.searchParams.set('currency', 'usd');

  const response = await fetch(url.toString(), signal ? { signal } : undefined);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { data = null; }

  if (!response.ok) {
    const msg = data?.errors?.[0]?.detail || data?.message || `Zerion error: ${response.status}`;
    throw new Error(msg);
  }

  const attrs = data?.data?.attributes || {};
  const realized = Number(attrs?.realized_gain ?? 0) || 0;
  const unrealized = Number(attrs?.unrealized_gain ?? 0) || 0;
  const fees = Number(attrs?.total_fee ?? 0) || 0;

  const normalized = {
    realizedUsd: realized,
    unrealizedUsd: unrealized,
    feesUsd: fees,
    totalUsd: realized + unrealized,
  };
  setWalletPnlCache('evm', wallet, normalized);
  return normalized;
}

async function fetchSolanaWalletPnl(wallet, { signal } = {}) {
  const cached = getWalletPnlCache('solana', wallet);
  if (cached) return cached;

  const data = await birdeyeRequest('/wallet/v2/pnl/summary', {
    wallet: wallet,
    wallet_address: wallet,

    currency: 'usd',
    chain: 'solana',
  }, { signal });

  const summary = data?.data?.summary || {};
  const pnl = summary?.pnl || {};
  const realized = Number(pnl?.realized_profit_usd ?? 0) || 0;
  const unrealized = Number(pnl?.unrealized_usd ?? 0) || 0;
  const total = Number(pnl?.total_usd ?? (realized + unrealized)) || (realized + unrealized);

  const normalized = {
    realizedUsd: realized,
    unrealizedUsd: unrealized,
    feesUsd: 0,
    totalUsd: total,
  };
  setWalletPnlCache('solana', wallet, normalized);
  return normalized;
}

function birdeyeXChain(chain) {
  const c = String(chain || '').toLowerCase().trim();
  if (c === 'solana' || c === 'sol') return 'solana';
  switch (normalizeEvmNetwork(c)) {
    case 'ethereum': return 'ethereum';
    case 'bsc': return 'bsc';
    case 'arbitrum': return 'arbitrum';
    case 'optimism': return 'optimism';
    case 'polygon': return 'polygon';
    case 'base': return 'base';
    case 'avalanche': return 'avalanche';
    case 'fantom': return 'fantom';
    case 'gnosis': return 'gnosis';
    default: return 'ethereum';
  }
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
  const netWorthUsd = Number(first?.net_worth ?? first?.netWorth ?? 0) || 0;
  return {
    changeUsd: Number(first?.net_worth_change ?? 0) || 0,
    changePct: Number(first?.net_worth_change_percent ?? 0) || 0,
    netWorthUsd,
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

function getChainLogoUrl(chain, network) {
  if (chain === 'solana') {
    return 'https://cryptologos.cc/logos/solana-sol-logo.png';
  }
  
  switch (normalizeEvmNetwork(network)) {
    case 'ethereum': return 'https://cryptologos.cc/logos/ethereum-eth-logo.png';
    case 'bsc': return 'https://cryptologos.cc/logos/bnb-bnb-logo.png';
    case 'arbitrum': return 'https://cryptologos.cc/logos/arbitrum-arb-logo.png';
    case 'optimism': return 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png';
    case 'polygon': return 'https://cryptologos.cc/logos/polygon-matic-logo.png';
    case 'base': return 'https://www.base.org/document/favicon-32x32.png';
    case 'avalanche': return 'https://cryptologos.cc/logos/avalanche-avax-logo.png';
    case 'fantom': return 'https://cryptologos.cc/logos/fantom-ftm-logo.png';
    case 'gnosis': return 'https://cryptologos.cc/logos/gnosis-gno-gno-logo.png';
    default: return '';
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

function dexscreenerChain(chain, network) {
  if (chain === 'solana') return 'solana';
  const n = normalizeEvmNetwork(network);
  switch (n) {
    case 'ethereum': return 'ethereum';
    case 'bsc': return 'bsc';
    case 'arbitrum': return 'arbitrum';
    case 'optimism': return 'optimism';
    case 'polygon': return 'polygon';
    case 'base': return 'base';
    case 'avalanche': return 'avalanche';
    case 'fantom': return 'fantom';
    default: return 'ethereum';
  }
}

function dextoolsChain(chain, network) {
  if (chain === 'solana') return 'solana';
  const n = normalizeEvmNetwork(network);
  switch (n) {
    case 'ethereum': return 'ether';
    case 'bsc': return 'bsc';
    case 'arbitrum': return 'arbitrum';
    case 'optimism': return 'optimism';
    case 'polygon': return 'polygon';
    case 'base': return 'base';
    case 'avalanche': return 'avalanche';
    case 'fantom': return 'fantom';
    default: return 'ether';
  }
}

function buildDexscreenerTokenUrl({ chain, network, address }) {
  const c = dexscreenerChain(chain, network);
  return `https://dexscreener.com/${c}/${address}`;
}

function buildDextoolsTokenUrl({ chain, network, address }) {
  const q = encodeURIComponent(String(address || '').trim());
  return `https://www.dextools.io/app/en/search?query=${q}`;
}

function buildBirdeyeTokenUrl({ chain, network, address }) {
  const c = chain === 'solana' ? 'solana' : birdeyeXChain(normalizeEvmNetwork(network));
  return `https://birdeye.so/token/${address}?chain=${c}`;
}

function closeAllChartPopovers(exceptEl = null) {
  const popovers = document.querySelectorAll('.chart-popover');
  popovers.forEach((p) => {
    if (exceptEl && p === exceptEl) return;
    p.classList.add('hidden');
  });
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
  let mcapChanged = false;
  let lastRenderAt = 0;
  const maybeRender = () => {
    const now = Date.now();
    if (now - lastRenderAt < 1000) return;
    lastRenderAt = now;
    holdingsDataVersion++;
    invalidateHoldingsTableCache();
    scheduleRenderHoldingsTable();
    try { savePortfolioSnapshot(); } catch {}
  };

  const worker = async () => {
    while (idx < candidates.length) {
      const current = candidates[idx++];
      if (!current) continue;
      if (signal?.aborted) break;

      const mcap = await getTokenMcap(current.address, current.chain, { signal });
      if (signal?.aborted) break;

      if (mcap && mcap > 0) {
        current.mcap = mcap;
        mcapChanged = true;
        maybeRender();
      }
    }
  };

  const workers = [];
  for (let i = 0; i < MCAP_CONCURRENCY; i++) workers.push(worker());

  Promise.all(workers).then(() => {
    if (signal?.aborted) return;
    if (!mcapChanged) return;
    holdingsDataVersion++;
    invalidateHoldingsTableCache();
    scheduleRenderHoldingsTable();
    try { savePortfolioSnapshot(); } catch {}
  }).catch(() => {});
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
    wallet: wallet,
    wallet_address: wallet,

    currency: 'usd',
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

  if (active) {
    try {
      closeAllChartPopovers();
    } catch {}
    try {
      forceCollapseResultsSections();
    } catch {}
  }
}

function updateProgress(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  progressPending = p;
  if (progressRaf) return;

  progressRaf = requestAnimationFrame(() => {
    progressRaf = null;
    const fill = $('progressBar')?.querySelector('.progress-fill');
    if (fill && progressPending != null) fill.style.width = `${progressPending}%`;
  });
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

  const totalPnl24hEl = $('totalPnl24h');
  if (totalPnl24hEl) {
    const holdings = Array.isArray(state.holdings) ? state.holdings : [];
    let totalNow = 0;
    let totalPnlUsd = 0;
    let total24hAgo = 0;
    for (const h of holdings) {
      const value = Number(h?.value || 0) || 0;
      const changeUsd = Number(h?.changeUsd || 0) || 0;
      if (value <= 0 && changeUsd === 0) continue;
      totalNow += value;
      totalPnlUsd += changeUsd;
      total24hAgo += Math.max(0, value - changeUsd);
    }

    totalPnl24hEl.textContent = formatCurrency(totalPnlUsd);
    try {
      totalPnl24hEl.classList.remove('pnl-positive', 'pnl-negative', 'pnl-flat');
      const v = Number(totalPnlUsd || 0) || 0;
      const cls = v > 0.0001 ? 'pnl-positive' : v < -0.0001 ? 'pnl-negative' : 'pnl-flat';
      totalPnl24hEl.classList.add(cls);
    } catch {}

    const totalPnl24hPctEl = $('totalPnl24hPct');
    if (totalPnl24hPctEl) {
      if (totalNow <= 0) {
        totalPnl24hPctEl.classList.add('hidden');
        totalPnl24hPctEl.classList.remove('positive', 'negative');
      } else {
        const pct = total24hAgo > 0 ? (totalPnlUsd / total24hAgo) * 100 : 0;
        const pctSafe = Number.isFinite(pct) ? pct : 0;

        totalPnl24hPctEl.classList.remove('hidden');
        totalPnl24hPctEl.classList.toggle('positive', pctSafe > 0.0001);
        totalPnl24hPctEl.classList.toggle('negative', pctSafe < -0.0001);

        const arrow = pctSafe > 0.0001 ? '▲' : pctSafe < -0.0001 ? '▼' : '•';
        totalPnl24hPctEl.textContent = `${arrow} ${Math.abs(pctSafe).toFixed(2)}%`;
      }
    }
  }
  $('tokenCount') && ($('tokenCount').textContent = String(state.holdings.length));

  const largest = state.holdings.reduce((max, h) => (h.value > max.value ? h : max), { value: 0, symbol: '—' });
  $('largestHolding') && ($('largestHolding').textContent = largest.symbol || '—');
  $('largestValue') && ($('largestValue').textContent = formatCurrency(largest.value || 0));

  const summaryScoreEl = $('summaryPortfolioScore');
  const summaryScoreMetaEl = $('summaryPortfolioScoreMeta');
  if (summaryScoreEl && summaryScoreMetaEl) {
    const s = computePortfolioBlendScore();
    if (!Number.isFinite(s?.score)) {
      summaryScoreEl.textContent = '—';
      summaryScoreMetaEl.textContent = '—';
    } else {
      summaryScoreEl.textContent = `${Math.round(s.score)}/100`;
      summaryScoreMetaEl.textContent = String(s?.label || s?.meta || '—');
    }
  }

  const chainCountEl = $('summaryChainCount');
  const chainCountMetaEl = $('summaryChainCountMeta');
  if (chainCountEl && chainCountMetaEl) {
    const holdings = Array.isArray(state.holdings) ? state.holdings : [];
    const buckets = new Set();
    for (const h of holdings) {
      const chain = String(h?.chain || '');
      if (chain === 'solana') {
        buckets.add('solana');
      } else if (chain === 'evm') {
        const network = normalizeEvmNetwork(h?.network || h?.chain || '');
        buckets.add(`evm:${network || 'unknown'}`);
      } else if (chain) {
        buckets.add(chain);
      }
    }

    const n = buckets.size;
    chainCountEl.textContent = n > 0 ? String(n) : '—';
    chainCountMetaEl.textContent = n > 0 ? `chain${n === 1 ? '' : 's'}` : '—';
  }

  renderPortfolioScoreSection();
}

function renderPortfolioScoreSection() {
  const card = $('portfolioScoreCard');
  const valueEl = $('portfolioScoreValue');
  const metaEl = $('portfolioScoreMeta');
  const driversEl = $('portfolioScoreDrivers');
  const subscoresEl = $('portfolioScoreSubscores');
  const recsEl = $('portfolioScoreRecs');

  if (!card || !valueEl || !metaEl || !driversEl) return;

  const s = computePortfolioBlendScore();
  if (!Number.isFinite(s?.score)) {
    valueEl.textContent = '—';
    metaEl.textContent = '—';
    driversEl.innerHTML = '';
    subscoresEl && (subscoresEl.innerHTML = '');
    recsEl && (recsEl.innerHTML = '');
    return;
  }

  const scoreValue = Math.round(s.score);
  valueEl.textContent = `${scoreValue}`;
  metaEl.textContent = s?.label || '—';
  
  // Render circular chart
  const scoreCircle = valueEl.closest('.score-circle');
  if (scoreCircle) {
    const existingSvg = scoreCircle.querySelector('.score-chart-svg');
    if (existingSvg) existingSvg.remove();
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'score-chart-svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = (scoreValue / 100) * circumference;
    
    // Use cyan color for all scores
    const strokeColor = 'rgba(0, 194, 255, 0.95)';
    
    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '100');
    bgCircle.setAttribute('cy', '100');
    bgCircle.setAttribute('r', radius);
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'var(--border)');
    bgCircle.setAttribute('stroke-width', '16');
    bgCircle.setAttribute('opacity', '0.3');
    
    // Progress circle
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('cx', '100');
    progressCircle.setAttribute('cy', '100');
    progressCircle.setAttribute('r', radius);
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', strokeColor);
    progressCircle.setAttribute('stroke-width', '16');
    progressCircle.setAttribute('stroke-linecap', 'round');
    progressCircle.setAttribute('stroke-dasharray', circumference);
    progressCircle.setAttribute('stroke-dashoffset', circumference - progress);
    progressCircle.setAttribute('transform', 'rotate(-90 100 100)');
    progressCircle.setAttribute('class', 'score-progress-circle');
    
    svg.appendChild(bgCircle);
    svg.appendChild(progressCircle);
    
    scoreCircle.insertBefore(svg, scoreCircle.firstChild);
  }

  const penalties = Array.isArray(s?.penalties) ? s.penalties.slice() : [];
  const bonuses = Array.isArray(s?.bonuses) ? s.bonuses.slice() : [];

  penalties.sort((a, b) => (Number(b?.points || 0) || 0) - (Number(a?.points || 0) || 0));
  bonuses.sort((a, b) => (Number(b?.points || 0) || 0) - (Number(a?.points || 0) || 0));

  const items = [];
  for (const b of bonuses.slice(0, 2)) {
    const pts = Math.round(Number(b?.points || 0) || 0);
    const reason = String(b?.reason || '').trim() || '—';
    if (pts > 0) items.push({ kind: 'bonus', pts, reason });
  }
  for (const p of penalties.slice(0, 4)) {
    const pts = Math.round(Number(p?.points || 0) || 0);
    const reason = String(p?.reason || '').trim() || '—';
    if (pts > 0) items.push({ kind: 'penalty', pts, reason });
  }

  const top = items.slice(0, 5);
  if (!top.length) {
    driversEl.innerHTML = '<div class="score-item">Balanced portfolio</div>';
    return;
  }

  driversEl.innerHTML = top
    .map((it) => {
      const iconClass = it.kind === 'bonus' ? 'fa-arrow-up pnl-positive' : 'fa-arrow-down pnl-negative';
      return `<div class="score-item"><i class="fa-solid ${iconClass}"></i> ${escapeHtml(it.reason)}</div>`;
    })
    .join('');

  if (subscoresEl) {
    const sub = s?.subscores && typeof s.subscores === 'object' ? s.subscores : null;
    const parts = sub ? [
      { k: 'diversification', label: 'Diversification' },
      { k: 'quality', label: 'Quality' },
      { k: 'stability', label: 'Stability' },
      { k: 'cleanliness', label: 'Cleanliness' },
      { k: 'custody', label: 'Custody' },
      { k: 'size', label: 'Size' },
    ] : [];

    const rows = parts
      .map((p) => ({ label: p.label, score: Math.round(Number(sub?.[p.k] || 0) || 0) }))
      .filter((r) => Number.isFinite(r.score));

    subscoresEl.innerHTML = rows.length
      ? rows.map((r) => {
          const scoreClass = r.score >= 80 ? 'score-excellent' : r.score >= 60 ? 'score-good' : 'score-poor';
          const percentage = Math.min(100, Math.max(0, r.score));
          return `
            <div class="subscore-card ${scoreClass}">
              <div class="subscore-label">${escapeHtml(r.label)}</div>
              <div class="subscore-value">${r.score}</div>
              <div class="subscore-bar">
                <div class="subscore-bar-fill" style="width: ${percentage}%"></div>
              </div>
            </div>
          `;
        }).join('')
      : '<div class="subscore-card">—</div>';
  }

  if (recsEl) {
    const recs = Array.isArray(s?.recommendations) ? s.recommendations : [];
    const topRecs = recs.slice(0, 3);
    recsEl.innerHTML = topRecs.length
      ? topRecs.map((r) => {
        const txt = String(r?.text || '').trim() || '—';
        return `<div class="score-item"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(txt)}</div>`;
      }).join('')
      : '<div class="score-item">Portfolio is well-optimized</div>';
  }
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function computePortfolioBlendScore(options = {}) {
  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  const total = Number(state.totalValue || 0) || 0;

  if (!holdings.length || total <= 0) {
    return { score: NaN, meta: '—' };
  }

  const pct = (v) => total > 0 ? (Number(v || 0) / total) * 100 : 0;
  const sortedByValue = holdings.slice().sort((a, b) => (Number(b?.value || 0) || 0) - (Number(a?.value || 0) || 0));
  const top1Value = Number(sortedByValue[0]?.value || 0) || 0;
  const top3Value = sortedByValue.slice(0, 3).reduce((s, h) => s + (Number(h?.value || 0) || 0), 0);
  const top5Value = sortedByValue.slice(0, 5).reduce((s, h) => s + (Number(h?.value || 0) || 0), 0);
  const top10Value = sortedByValue.slice(0, 10).reduce((s, h) => s + (Number(h?.value || 0) || 0), 0);
  const top1Pct = pct(top1Value);
  const top3Pct = pct(top3Value);
  const top5Pct = pct(top5Value);
  const top10Pct = pct(top10Value);
  const top1Symbol = String(sortedByValue[0]?.symbol || sortedByValue[0]?.name || 'Top holding');
  
  // Enhanced stablecoin detection
  const stableSymbols = new Set([
    'USDC', 'USDT', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'USDY', 'FRAX', 'LUSD', 'SUSD', 'GUSD',
    'BUSD', 'UST', 'USDJ', 'HUSD', 'USDN', 'USDK', 'USDX', 'CUSD', 'EURS', 'EURT', 'XAUT', 'PAXG'
  ]);
  const stableValue = holdings.reduce((s, h) => {
    const sym = String(h?.symbol || '').toUpperCase();
    if (!stableSymbols.has(sym)) return s;
    return s + (Number(h?.value || 0) || 0);
  }, 0);
  const stablePct = pct(stableValue);
  
  // Blue chip detection (major tokens)
  const blueChipSymbols = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'AVAX', 'MATIC', 'ARB', 'OP']);
  const blueChipValue = holdings.reduce((s, h) => {
    const sym = String(h?.symbol || '').toUpperCase();
    if (!blueChipSymbols.has(sym)) return s;
    return s + (Number(h?.value || 0) || 0);
  }, 0);
  const blueChipPct = pct(blueChipValue);
  const chainTotals = new Map();
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const chain = String(h?.chain || 'unknown');

    let bucketKey = chain;
    let bucketName = chain;

    if (chain === 'solana') {
      bucketKey = 'solana';
      bucketName = 'Solana';
    } else if (chain === 'evm') {
      const network = normalizeEvmNetwork(h?.network || h?.chain || '');
      bucketKey = `evm:${network || 'unknown'}`;
      bucketName = evmNetworkLabel(network);
    }

    if (!chainTotals.has(bucketKey)) chainTotals.set(bucketKey, { name: bucketName, value: 0 });
    chainTotals.get(bucketKey).value += v;
  }

  const chainShares = Array.from(chainTotals.values()).map(v => (total > 0 ? (Number(v.value || 0) / total) : 0));
  const hhi = chainShares.reduce((s, share) => {
    const x = Number(share || 0) || 0;
    return s + (x * x);
  }, 0);
  const topChainPct = chainShares.length ? (Math.max(...chainShares) * 100) : 0;
  const DUST_USD = 1;
  const dust = holdings.reduce((acc, h) => {
    const v = Number(h?.value || 0) || 0;
    if (v > 0 && v < DUST_USD) {
      acc.count += 1;
      acc.value += v;
    }
    return acc;
  }, { count: 0, value: 0 });
  const dustPct = pct(dust.value);
  const walletTotals = new Map();
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean).map(String) : [];
    if (!sources.length || v <= 0) continue;

    const uniq = Array.from(new Set(sources));
    const per = v / Math.max(1, uniq.length);
    for (const w of uniq) walletTotals.set(w, (walletTotals.get(w) || 0) + per);
  }
  const topWalletValue = walletTotals.size ? Math.max(...Array.from(walletTotals.values())) : 0;
  const topWalletPct = pct(topWalletValue);
  const totalNow = Number(state.totalValueForChange || 0) || 0;
  const total24hAgo = Number(state.totalValue24hAgo || 0) || 0;
  const delta = totalNow - total24hAgo;
  const movePct = (total24hAgo > 0) ? (Math.abs(delta) / total24hAgo) * 100 : 0;
  const penalties = [];
  const addPenalty = (key, points, reason) => {
    const p = clamp(points, 0, 100);
    if (p <= 0.0001) return;
    penalties.push({ key, points: p, reason });
  };

  const bonuses = [];
  const addBonus = (key, points, reason) => {
    const p = clamp(points, 0, 100);
    if (p <= 0.0001) return;
    bonuses.push({ key, points: p, reason });
  };

  const targetStablePct = clamp(
    Number(options?.targetStablePct ?? 25),
    0,
    100
  );

  const top1TargetPct = clamp(
    Number(options?.top1TargetPct ?? 25),
    5,
    90
  );
  // CONCENTRATION RISK - More granular penalties
  addPenalty(
    'concentration_top1',
    clamp(((top1Pct - top1TargetPct) / 50) * 20, 0, 20),
    `${top1Symbol} dominates at ${formatPct(top1Pct)}`
  );
  addPenalty(
    'concentration_top3',
    clamp(((top3Pct - 50) / 50) * 12, 0, 12),
    `Top 3 holdings control ${formatPct(top3Pct)}`
  );
  addPenalty(
    'concentration_top5',
    clamp(((top5Pct - 65) / 35) * 10, 0, 10),
    `Top 5 holdings ${formatPct(top5Pct)}`
  );
  
  // QUALITY & STABILITY
  const stableDistance = Math.abs(stablePct - targetStablePct);
  addPenalty(
    'stable_balance',
    clamp((stableDistance / Math.max(10, targetStablePct || 25)) * 8, 0, 8),
    `Stablecoin ${stablePct < targetStablePct ? 'under' : 'over'}weight at ${formatPct(stablePct)}`
  );
  addPenalty(
    'stable_too_high',
    stablePct > 85 ? clamp(((stablePct - 85) / 15) * 12, 0, 12) : 0,
    `Excessive cash position ${formatPct(stablePct)}`
  );
  
  // Blue chip bonus
  if (blueChipPct >= 20) {
    addBonus(
      'blue_chip_exposure',
      clamp((blueChipPct / 10) * 3, 0, 15),
      `Strong blue chip allocation ${formatPct(blueChipPct)}`
    );
  }
  
  // CHAIN DIVERSIFICATION
  addPenalty(
    'chain_domination',
    clamp(((topChainPct - 75) / 25) * 10, 0, 10),
    `Single chain dominance ${formatPct(topChainPct)}`
  );
  addPenalty(
    'chain_diversification',
    clamp(((hhi - 0.4) / 0.6) * 8, 0, 8),
    'Poor cross-chain distribution'
  );
  
  // Multi-chain bonus
  const chainCount = chainTotals.size;
  if (chainCount >= 3) {
    addBonus(
      'multi_chain',
      clamp((chainCount - 2) * 3, 0, 12),
      `Multi-chain strategy (${chainCount} chains)`
    );
  }
  
  // PORTFOLIO CLEANLINESS
  addPenalty(
    'dust_value',
    clamp((dustPct / 3) * 12, 0, 12),
    `Dust drag ${formatPct(dustPct)} (${dust.count} tokens)`
  );
  addPenalty(
    'dust_count',
    clamp((dust.count / 15) * 8, 0, 8),
    `Portfolio bloat: ${dust.count} micro positions`
  );
  
  // CUSTODY RISK
  addPenalty(
    'wallet_concentration',
    clamp(((topWalletPct - 90) / 10) * 12, 0, 12),
    `Single wallet risk ${formatPct(topWalletPct)}`
  );
  
  // Multi-wallet bonus
  const walletCount = walletTotals.size;
  if (walletCount >= 3) {
    addBonus(
      'multi_wallet',
      clamp((walletCount - 2) * 2, 0, 10),
      `Distributed custody (${walletCount} wallets)`
    );
  }
  
  // VOLATILITY & RISK
  addPenalty(
    'volatility',
    clamp((movePct / 15) * 10, 0, 10),
    `High volatility: ${formatPct(movePct)} 24h swing`
  );
  
  // Stability bonus for low volatility
  if (movePct < 5 && total > 1000) {
    addBonus(
      'low_volatility',
      clamp((5 - movePct) * 1.5, 0, 7),
      `Stable portfolio: ${formatPct(movePct)} 24h move`
    );
  }
  
  // PORTFOLIO SIZE & MATURITY
  const sizeBonus = total >= 100000 ? 20
    : total >= 50000 ? 15
    : total >= 25000 ? 12
    : total >= 10000 ? 8
    : total >= 5000 ? 5
    : total >= 1000 ? 3
    : 0;
  
  if (sizeBonus > 0) {
    addBonus(
      'portfolio_size',
      sizeBonus,
      `Established portfolio ${formatCurrency(total)}`
    );
  }
  
  // DIVERSIFICATION BONUS
  const uniqueTokens = holdings.length;
  if (uniqueTokens >= 10 && uniqueTokens <= 30) {
    addBonus(
      'optimal_diversification',
      clamp((Math.min(uniqueTokens, 20) - 9) * 1.5, 0, 15),
      `Well-diversified: ${uniqueTokens} tokens`
    );
  } else if (uniqueTokens > 50) {
    addPenalty(
      'over_diversification',
      clamp((uniqueTokens - 50) / 10, 0, 10),
      `Over-diversified: ${uniqueTokens} tokens`
    );
  } else if (uniqueTokens < 5 && total > 5000) {
    addPenalty(
      'under_diversification',
      clamp((5 - uniqueTokens) * 3, 0, 12),
      `Under-diversified: only ${uniqueTokens} tokens`
    );
  }

  const totalPenalty = penalties.reduce((s, p) => s + p.points, 0);
  const totalBonus = bonuses.reduce((s, b) => s + b.points, 0);
  const score = clamp(100 - totalPenalty + totalBonus, 0, 100);

  // Enhanced scoring labels
  const label = score >= 90 ? 'Elite'
    : score >= 80 ? 'Excellent'
      : score >= 70 ? 'Strong'
        : score >= 60 ? 'Good'
          : score >= 50 ? 'Fair'
            : score >= 40 ? 'Weak'
              : 'High Risk';

  penalties.sort((a, b) => b.points - a.points);
  bonuses.sort((a, b) => b.points - a.points);

  const topPenalty = penalties[0];
  const topPenaltyReason = topPenalty?.reason || 'Balanced portfolio';

  const topBonus = bonuses[0];
  const topBonusPoints = Math.round(Number(topBonus?.points || 0) || 0);
  const topBonusLabel = (topBonus && topBonusPoints > 0)
    ? `+${topBonusPoints} ${String(topBonus?.key || 'bonus').replace(/_/g, ' ')}`
    : '';

  const metaParts = [label];
  if (topBonusLabel) metaParts.push(topBonusLabel);
  if (topPenaltyReason) metaParts.push(topPenaltyReason);
  const meta = metaParts.join(' • ');

  const penaltyByKey = new Map(penalties.map(p => [p.key, p]));
  const recs = [];
  const addRec = (key, text, impactPoints) => {
    const pts = clamp(Number(impactPoints || 0), 0, 100);
    if (!text) return;
    recs.push({ key, text, impactPoints: pts });
  };

  const pTop1 = Number(penaltyByKey.get('concentration_top1')?.points || 0) || 0;
  if (pTop1 > 1) addRec(
    'concentration_top1',
    `Reduce ${top1Symbol} from ${formatPct(top1Pct)} toward ${formatPct(top1TargetPct)} max`,
    pTop1
  );

  const pTop5 = Number(penaltyByKey.get('concentration_top5')?.points || 0) || 0;
  if (pTop5 > 1) addRec(
    'concentration_top5',
    `Reduce top 5 concentration (currently ${formatPct(top5Pct)})`,
    pTop5
  );

  const pStable = Number(penaltyByKey.get('stable_balance')?.points || 0) || 0;
  if (pStable > 1) addRec(
    'stable_balance',
    `Adjust stablecoins from ${formatPct(stablePct)} toward ~${formatPct(targetStablePct)}`,
    pStable
  );

  const pDustValue = Number(penaltyByKey.get('dust_value')?.points || 0) || 0;
  const pDustCount = Number(penaltyByKey.get('dust_count')?.points || 0) || 0;
  if ((pDustValue + pDustCount) > 1) addRec(
    'dust',
    `Consolidate dust: ${dust.count} tiny tokens (<$1) totaling ${formatCurrency(dust.value)}`,
    pDustValue + pDustCount
  );

  const pChainDom = Number(penaltyByKey.get('chain_domination')?.points || 0) || 0;
  const pChainDiv = Number(penaltyByKey.get('chain_diversification')?.points || 0) || 0;
  if ((pChainDom + pChainDiv) > 1) addRec(
    'chains',
    `Reduce chain concentration (top chain is ${formatPct(topChainPct)})`,
    pChainDom + pChainDiv
  );

  const pWallet = Number(penaltyByKey.get('wallet_concentration')?.points || 0) || 0;
  if (pWallet > 1) addRec(
    'wallet_concentration',
    `Spread custody: top wallet holds ${formatPct(topWalletPct)}`,
    pWallet
  );

  const pVol = Number(penaltyByKey.get('volatility')?.points || 0) || 0;
  if (pVol > 1) addRec(
    'volatility',
    `Reduce 24h move magnitude (currently ${formatPct(movePct)})`,
    pVol
  );

  recs.sort((a, b) => (Number(b?.impactPoints || 0) || 0) - (Number(a?.impactPoints || 0) || 0));

  // Enhanced subscores with better calculation
  const pTop3 = Number(penaltyByKey.get('concentration_top3')?.points || 0) || 0;
  const pStableHigh = Number(penaltyByKey.get('stable_too_high')?.points || 0) || 0;
  const pOverDiv = Number(penaltyByKey.get('over_diversification')?.points || 0) || 0;
  const pUnderDiv = Number(penaltyByKey.get('under_diversification')?.points || 0) || 0;
  
  const bBlueChip = Number(bonuses.find(b => b.key === 'blue_chip_exposure')?.points || 0) || 0;
  const bMultiChain = Number(bonuses.find(b => b.key === 'multi_chain')?.points || 0) || 0;
  const bOptimalDiv = Number(bonuses.find(b => b.key === 'optimal_diversification')?.points || 0) || 0;
  const bLowVol = Number(bonuses.find(b => b.key === 'low_volatility')?.points || 0) || 0;
  const bMultiWallet = Number(bonuses.find(b => b.key === 'multi_wallet')?.points || 0) || 0;

  // Calculate portfolio size score
  const bSize = Number(bonuses.find(b => b.key === 'portfolio_size')?.points || 0) || 0;
  const sizeScore = clamp(50 + bSize, 0, 100); // Base 50, can go up with size bonuses

  const subscores = {
    diversification: clamp(100 - pTop1 - pTop3 - pTop5 - pChainDom - pChainDiv - pOverDiv - pUnderDiv + bMultiChain + bOptimalDiv, 0, 100),
    quality: clamp(100 - pStable - pStableHigh + bBlueChip, 0, 100),
    stability: clamp(100 - pVol + bLowVol, 0, 100),
    cleanliness: clamp(100 - pDustValue - pDustCount, 0, 100),
    custody: clamp(100 - pWallet + bMultiWallet, 0, 100),
    size: sizeScore,
  };

  return { score, label, meta, penalties, bonuses, subscores, recommendations: recs, config: { targetStablePct, top1TargetPct } };
}

function formatPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

function renderAllocationAndRisk() {
  const allocationEl = $('allocationBreakdown');
  const chainChartEl = $('chainAllocationChart');
  const insightsEl = $('riskInsights');
  const whatsChangedEl = $('whatsChangedToday');
  if ((!allocationEl && !chainChartEl) || !insightsEl || !whatsChangedEl) return;

  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  const total = Number(state.totalValue || 0) || 0;

  if (!holdings.length || total <= 0) {
    if (allocationEl) allocationEl.innerHTML = '';
    if (chainChartEl) chainChartEl.innerHTML = '';
    insightsEl.innerHTML = '';
    whatsChangedEl.innerHTML = '';
    return;
  }

  const evmNetworkName = (network) => {
    switch (normalizeEvmNetwork(network)) {
      case 'ethereum': return 'Ethereum';
      case 'bsc': return 'BSC';
      case 'arbitrum': return 'Arbitrum';
      case 'optimism': return 'Optimism';
      case 'polygon': return 'Polygon';
      case 'base': return 'Base';
      case 'avalanche': return 'Avalanche';
      case 'fantom': return 'Fantom';
      case 'gnosis': return 'Gnosis';
      default: {
        const s = String(network || '').trim();
        if (!s) return 'EVM';
        return s.toUpperCase();
      }
    }
  };

  const chainTotals = new Map();
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const chain = String(h?.chain || 'unknown');

    let bucketKey = chain;
    let bucketName = chain;

    if (chain === 'solana') {
      bucketKey = 'solana';
      bucketName = 'Solana';
    } else if (chain === 'evm') {
      const network = normalizeEvmNetwork(h?.network || h?.chain || '');
      bucketKey = `evm:${network || 'unknown'}`;
      bucketName = evmNetworkName(network);
    }

    if (!chainTotals.has(bucketKey)) chainTotals.set(bucketKey, { name: bucketName, value: 0 });
    chainTotals.get(bucketKey).value += v;
  }

  const chainRows = Array.from(chainTotals.entries())
    .map(([bucketKey, data]) => ({
      key: `chain:${bucketKey}`,
      name: data.name,
      value: data.value,
      pct: (data.value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);

  const topHoldings = holdings
    .slice()
    .sort((a, b) => (Number(b?.value || 0) || 0) - (Number(a?.value || 0) || 0))
    .slice(0, 5)
    .map((h) => {
      const value = Number(h?.value || 0) || 0;
      return {
        key: h?.key || `${h?.chain}:${h?.address}`,
        name: String(h?.symbol || '—'),
        value,
        pct: (value / total) * 100,
      };
    });

  const ALLOC_MIN_VALUE = 0.000001;

  const chainRowsNonZero = chainRows
    .filter(r => Number(r?.value || 0) > ALLOC_MIN_VALUE)
    .map(r => ({ ...r }));

  const topChains = chainRowsNonZero.slice(0, 6);
  const otherSum = chainRowsNonZero.slice(6).reduce((s, r) => s + (Number(r?.value || 0) || 0), 0);
  const donutRows = otherSum > ALLOC_MIN_VALUE
    ? [...topChains, { key: 'chain:other', name: 'Other', value: otherSum, pct: (otherSum / total) * 100 }]
    : topChains;

  const hashHue = (str) => {
    const s = String(str || '');
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
    return Math.abs(h) % 360;
  };

  const chainBrandColor = (chainKey) => {
    const key = String(chainKey || '').toLowerCase();
    if (key === 'solana') return '#7c3aed'; // purple
    if (key === 'evm:ethereum') return '#3b82f6'; // blue
    if (key === 'evm:base') return '#2563eb'; // deeper blue
    if (key === 'evm:arbitrum') return '#60a5fa'; // light blue
    if (key === 'evm:optimism') return '#ef4444'; // red
    if (key === 'evm:bsc') return '#fbbf24'; // yellow
    if (key === 'evm:polygon') return '#a855f7'; // purple
    if (key === 'evm:avalanche') return '#f43f5e'; // red/pink
    if (key === 'evm:fantom') return '#38bdf8'; // cyan
    if (key === 'evm:gnosis') return '#22c55e'; // green

    if (key === 'other') return '#94a3b8'; // slate
    const hue = hashHue(key);
    return `hsl(${hue} 85% 55%)`;
  };

  const donutSize = 190;
  const donutStroke = 20;
  const r = (donutSize / 2) - (donutStroke / 2);
  const c = 2 * Math.PI * r;

  let offset = 0;
  const segments = donutRows.map((row, idx) => {
    const value = Number(row?.value || 0) || 0;
    const pctRaw = total > 0 ? (value / total) * 100 : 0;
    const pct = Math.max(0, Math.min(100, Number.isFinite(pctRaw) ? pctRaw : 0));
    const dashFull = (pct / 100) * c;
    const dash = dashFull;
    const rawKey = String(row?.key || '');
    const bucketKey = rawKey.startsWith('chain:') ? rawKey.slice('chain:'.length) : rawKey;
    const color = chainBrandColor(bucketKey || String(row?.name || idx));
    const seg = {
      ...row,
      value,
      pct,
      color,
      dash,
      dashFull,
      offset,
    };
    offset += dashFull;
    return seg;
  });

  if (!segments.length) {
    if (chainChartEl) chainChartEl.innerHTML = '';
    $('chainAllocationTooltip')?.classList.add('hidden');
  }

  const svg = `
    <svg viewBox="0 0 ${donutSize} ${donutSize}" role="img" aria-label="Chain allocation">
      <circle cx="${donutSize / 2}" cy="${donutSize / 2}" r="${r}" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="${donutStroke}" />
      ${segments.map(s => `
        <circle
          class="alloc-seg"
          data-name="${escapeHtml(s.name)}"
          data-pct="${String(s.pct)}"
          data-value="${String(s.value)}"
          cx="${donutSize / 2}"
          cy="${donutSize / 2}"
          r="${r}"
          fill="none"
          stroke="${s.color}"
          stroke-opacity="1"
          stroke-width="${donutStroke}"
          stroke-linecap="round"
          stroke-dasharray="${s.dash.toFixed(2)} ${(c - s.dash).toFixed(2)}"
          stroke-dashoffset="${(-s.offset).toFixed(2)}"
          transform="rotate(-90 ${donutSize / 2} ${donutSize / 2})"
        />
      `).join('')}
      <circle cx="${donutSize / 2}" cy="${donutSize / 2}" r="${Math.max(0, r - donutStroke)}" fill="rgba(255,255,255,0.58)" />
      <circle cx="${donutSize / 2}" cy="${donutSize / 2}" r="${Math.max(0, r - donutStroke)}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="2" />
    </svg>
  `;

  if (chainChartEl) {
    chainChartEl.innerHTML = svg;
  } else if (allocationEl) {
    allocationEl.innerHTML = svg;
  }

  // Render chain legend (only show chains > 0.0%)
  const legendEl = $('chainLegend');
  if (legendEl && segments.length) {
    const visibleSegments = segments.filter(s => s.pct > 0.05); // Filter out chains with 0.0%
    const legendHtml = visibleSegments.map(s => `
      <div class="chain-legend-item">
        <div class="chain-legend-color" style="background-color: ${s.color}"></div>
        <div class="chain-legend-name">${escapeHtml(s.name)}</div>
        <div class="chain-legend-value">${formatPct(s.pct)}</div>
      </div>
    `).join('');
    legendEl.innerHTML = legendHtml;
  } else if (legendEl) {
    legendEl.innerHTML = '';
  }

  const tooltipEl = $('chainAllocationTooltip');
  const chartHost = chainChartEl || allocationEl;
  if (tooltipEl && chartHost) {
    let hideTimer = null;

    const hideTooltip = () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = null;
      tooltipEl.classList.add('hidden');
      tooltipEl.innerHTML = '';
    };

    const showTooltip = (segEl) => {
      if (!segEl) return;
      const name = segEl.getAttribute('data-name') || '—';
      const pct = Number(segEl.getAttribute('data-pct') || 0) || 0;
      const value = Number(segEl.getAttribute('data-value') || 0) || 0;
      tooltipEl.innerHTML = `
        <div class="alloc-chain-tooltip-title">${escapeHtml(name)}</div>
        <div class="alloc-chain-tooltip-meta">${formatPct(pct)} · <span class="redacted-field" tabindex="0">${formatCurrency(value)}</span></div>
      `;
      tooltipEl.classList.remove('hidden');
    };

    chartHost.querySelectorAll('.alloc-seg').forEach((segEl) => {
      segEl.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) showTooltip(segEl);
      });
      segEl.addEventListener('mouseleave', () => {
        if (window.matchMedia('(hover: hover)').matches) hideTooltip();
      });
      segEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showTooltip(segEl);
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(hideTooltip, 1800);
      });
    });

    chartHost.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('.alloc-seg')) return;
      hideTooltip();
    });
  }

  // Token allocation list removed - now shown in Portfolio Holdings table

  const sortedByValue = holdings.slice().sort((a, b) => (Number(b?.value || 0) || 0) - (Number(a?.value || 0) || 0));
  const top1 = Number(sortedByValue[0]?.value || 0) || 0;
  const top5Sum = sortedByValue.slice(0, 5).reduce((s, h) => s + (Number(h?.value || 0) || 0), 0);
  const top1Pct = (top1 / total) * 100;
  const top5Pct = (top5Sum / total) * 100;

  const stableSymbols = new Set([
    'USDC', 'USDT', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'USDY', 'FRAX', 'LUSD', 'SUSD', 'GUSD',
  ]);
  const stableValue = holdings.reduce((s, h) => {
    const sym = String(h?.symbol || '').toUpperCase();
    if (!stableSymbols.has(sym)) return s;
    return s + (Number(h?.value || 0) || 0);
  }, 0);
  const stablePct = (stableValue / total) * 100;

  const topChain = chainRowsNonZero[0];
  const topChainPct = topChain ? ((Number(topChain.value || 0) || 0) / total) * 100 : 0;
  const top3ChainsPct = chainRowsNonZero
    .slice(0, 3)
    .reduce((s, r) => s + ((Number(r?.value || 0) || 0) / total) * 100, 0);

  const chainsOver5 = chainRowsNonZero.filter(r => (((Number(r?.value || 0) || 0) / total) * 100) >= 5).length;

  const DUST_USD = 1;
  const dust = holdings.reduce((acc, h) => {
    const v = Number(h?.value || 0) || 0;
    if (v > 0 && v < DUST_USD) {
      acc.count += 1;
      acc.value += v;
    }
    return acc;
  }, { count: 0, value: 0 });

  const walletTotals = new Map();
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean).map(String) : [];
    if (!sources.length || v <= 0) continue;

    const uniq = Array.from(new Set(sources));
    const per = v / Math.max(1, uniq.length);
    for (const w of uniq) walletTotals.set(w, (walletTotals.get(w) || 0) + per);
  }
  let topWallet = null;
  for (const [wallet, value] of walletTotals.entries()) {
    if (!topWallet || value > topWallet.value) topWallet = { wallet, value };
  }
  const topWalletPct = topWallet ? (topWallet.value / total) * 100 : 0;

  // Render "What's Changed Today" section with expanded insights
  const changedItems = [];
  try {
    const data = computeWhatChangedToday();
    const deltaTotal = Number(data?.totalDeltaUsd || 0) || 0;

    // Overall portfolio change
    if (deltaTotal !== 0) {
      const arrow = deltaTotal > 0 ? '↑' : '↓';
      const colorClass = deltaTotal > 0 ? 'pnl-positive' : 'pnl-negative';
      const pctChange = total > 0 ? (Math.abs(deltaTotal) / total) * 100 : 0;
      changedItems.push(`Portfolio <span class="${colorClass}">${arrow} ${formatCurrency(Math.abs(deltaTotal))}</span> (${formatPct(pctChange)})`);
    }

    if (Array.isArray(data?.topTokens) && data.topTokens.length) {
      data.topTokens.forEach((t) => {
        const arrow = t.deltaUsd > 0 ? '↑' : t.deltaUsd < 0 ? '↓' : '';
        const colorClass = t.deltaUsd > 0 ? 'pnl-positive' : 'pnl-negative';
        const pctOfMove = deltaTotal !== 0 ? (Math.abs(t.deltaUsd) / Math.abs(deltaTotal)) * 100 : 0;
        const pctOfPortfolio = total > 0 ? (Math.abs(t.deltaUsd) / total) * 100 : 0;
        const contribution = pctOfMove > 5 ? ` • <span style="color: var(--text-tertiary)">${formatPct(pctOfMove)} of move</span>` : '';
        changedItems.push(`<strong>${escapeHtml(t.symbol)}</strong>: <span class="${colorClass}">${arrow} ${formatCurrency(Math.abs(t.deltaUsd))}</span> (${formatPct(pctOfPortfolio)})${contribution}`);
      });
    }

    if (data?.topWallet && data.topWallet.wallet) {
      const arrow = data.topWallet.deltaUsd > 0 ? '↑' : data.topWallet.deltaUsd < 0 ? '↓' : '';
      const colorClass = data.topWallet.deltaUsd > 0 ? 'pnl-positive' : 'pnl-negative';
      const label = data.topWallet.chain === 'solana' ? 'Solana' : evmNetworkLabel(data.topWallet.chain);
      const pctOfMove = deltaTotal !== 0 ? (Math.abs(data.topWallet.deltaUsd) / Math.abs(deltaTotal)) * 100 : 0;
      changedItems.push(`Top wallet: <strong>${escapeHtml(label)} ${escapeHtml(shortenAddress(data.topWallet.wallet))}</strong> • <span class="${colorClass}">${arrow} ${formatCurrency(Math.abs(data.topWallet.deltaUsd))}</span> (${formatPct(pctOfMove)} of move)`);
    }
  } catch {}

  if (whatsChangedEl) {
    whatsChangedEl.innerHTML = changedItems.length
      ? changedItems.map((t) => `<div class="allocation-item">${t}</div>`).join('')
      : '<div class="allocation-item">No significant changes detected today</div>';
  }

  // Render Key Insights section with enhanced metrics
  const insights = [];
  
  // Concentration insights with risk assessment
  const top1Symbol = sortedByValue[0]?.symbol || '—';
  const concentrationRisk = top1Pct > 50 ? '⚠️ High risk' : top1Pct > 30 ? '⚡ Moderate' : '✓ Balanced';
  insights.push(`<strong>${escapeHtml(top1Symbol)}</strong> dominates: <strong>${formatPct(top1Pct)}</strong> • ${concentrationRisk}`);
  
  // Top 5 concentration
  const top5Risk = top5Pct > 80 ? '⚠️ Very concentrated' : top5Pct > 60 ? '⚡ Concentrated' : '✓ Diversified';
  insights.push(`Top 5 holdings: <strong>${formatPct(top5Pct)}</strong> • ${top5Risk}`);
  
  // Chain distribution
  if (topChain) {
    const chainRisk = topChainPct > 80 ? '⚠️ Single chain risk' : topChainPct > 50 ? '⚡ Chain dependent' : '✓ Multi-chain';
    insights.push(`<strong>${escapeHtml(topChain.name)}</strong> chain: <strong>${formatPct(topChainPct)}</strong> • ${chainRisk}`);
    
    const diversityScore = chainsOver5 >= 3 ? '✓ Well distributed' : chainsOver5 === 2 ? '⚡ Limited spread' : '⚠️ Narrow exposure';
    insights.push(`Active chains: <strong>${chainsOver5}</strong> with ≥5% • ${diversityScore}`);
  }
  
  // Stablecoin analysis
  const stableHealth = stablePct > 50 ? '⚠️ Too defensive' : stablePct > 20 ? '✓ Good buffer' : stablePct > 5 ? '⚡ Low cushion' : '⚠️ No safety net';
  insights.push(`Stablecoins: <strong>${formatPct(stablePct)}</strong> • ${stableHealth}`);
  
  // Dust exposure
  if (dust.count > 0 && dust.value > 0) {
    const dustPct = (dust.value / total) * 100;
    const dustImpact = dustPct > 5 ? '⚠️ Clean up needed' : dustPct > 1 ? '⚡ Minor clutter' : '✓ Minimal impact';
    insights.push(`Dust tokens: <strong>${dust.count}</strong> worth <strong><span class="redacted-field" tabindex="0">${formatCurrency(dust.value)}</span></strong> • ${dustImpact}`);
  }
  
  // Wallet concentration
  if (topWallet && topWallet.value > 0) {
    const walletRisk = topWalletPct > 80 ? '⚠️ Single point of failure' : topWalletPct > 50 ? '⚡ Wallet dependent' : '✓ Distributed custody';
    insights.push(`Top wallet holds: <strong>${formatPct(topWalletPct)}</strong> • ${walletRisk}`);
  }
  
  // Portfolio size assessment
  const sizeCategory = total > 100000 ? 'Whale' : total > 10000 ? 'Large' : total > 1000 ? 'Medium' : 'Small';
  insights.push(`Portfolio size: <strong><span class="redacted-field" tabindex="0">${formatCurrency(total)}</span></strong> • ${sizeCategory}`);

  insightsEl.innerHTML = insights
    .map((t) => `<div class="allocation-item">${t}</div>`)
    .join('') || '<div class="allocation-item">No insights available</div>';
}

function renderHoldingsByWallet() {
  const walletAllocationEl = $('walletAllocationList');
  if (!walletAllocationEl) return;

  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  const total = Number(state.totalValue || 0) || 0;

  if (!holdings.length || total <= 0) {
    walletAllocationEl.innerHTML = '';
    return;
  }

  const ALLOC_MIN_VALUE = 0.000001;

  // Group wallets by chain, then calculate totals
  const chainWallets = new Map(); // chain -> Map(wallet -> value)
  
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const chain = String(h?.chain || 'unknown');
    const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean).map(String) : [];
    if (!sources.length || v <= 0) continue;

    const uniq = Array.from(new Set(sources));
    const per = v / Math.max(1, uniq.length);
    
    for (const w of uniq) {
      if (!chainWallets.has(chain)) {
        chainWallets.set(chain, new Map());
      }
      const walletMap = chainWallets.get(chain);
      walletMap.set(w, (walletMap.get(w) || 0) + per);
    }
  }

  // Build chain rows with nested wallet data
  const chainRows = Array.from(chainWallets.entries())
    .map(([chain, walletMap]) => {
      const chainValue = Array.from(walletMap.values()).reduce((sum, v) => sum + v, 0);
      const wallets = Array.from(walletMap.entries())
        .map(([wallet, value]) => ({
          wallet,
          value,
          pct: chainValue > 0 ? (value / chainValue) * 100 : 0,
        }))
        .filter(w => w.value > ALLOC_MIN_VALUE)
        .sort((a, b) => b.value - a.value);
      
      return {
        chain,
        value: chainValue,
        pct: total > 0 ? (chainValue / total) * 100 : 0,
        wallets,
      };
    })
    .filter(r => r.value > ALLOC_MIN_VALUE)
    .sort((a, b) => b.value - a.value);

  // Build chain sections with nested wallet sections
  const chainHtml = chainRows.map((chainRow) => {
    const chainPct = Math.max(0, Math.min(100, chainRow.pct));
    
    // Get chain display name
    const chainName = chainRow.chain === 'solana' ? 'Solana' : 
                      chainRow.chain === 'ethereum' ? 'Ethereum' :
                      chainRow.chain === 'bsc' ? 'BNB Chain' :
                      chainRow.chain === 'polygon' ? 'Polygon' :
                      chainRow.chain === 'arbitrum' ? 'Arbitrum' :
                      chainRow.chain === 'optimism' ? 'Optimism' :
                      chainRow.chain === 'avalanche' ? 'Avalanche' :
                      chainRow.chain === 'base' ? 'Base' :
                      chainRow.chain.charAt(0).toUpperCase() + chainRow.chain.slice(1);
    
    // Build wallet sections within this chain
    const walletsHtml = chainRow.wallets.map((walletRow) => {
      const walletPct = Math.max(0, Math.min(100, walletRow.pct));
      
      // Get tokens for this wallet and calculate their actual value in this specific wallet
      const walletTokens = holdings
        .filter(h => {
          const sources = Array.isArray(h?.sources) ? h.sources : [];
          const hChain = String(h?.chain || '');
          return hChain === chainRow.chain && sources.includes(walletRow.wallet);
        })
        .map(h => {
          const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean) : [];
          const uniqueSources = Array.from(new Set(sources));
          const totalValue = Number(h?.value || 0) || 0;
          // Divide value equally among wallets that hold this token
          const valueInThisWallet = totalValue / Math.max(1, uniqueSources.length);
          return {
            ...h,
            valueInWallet: valueInThisWallet
          };
        })
        .sort((a, b) => (Number(b?.valueInWallet || 0) || 0) - (Number(a?.valueInWallet || 0) || 0));
    
      const tokenListHtml = walletTokens
        .filter(token => {
          const tokenValue = Number(token?.valueInWallet || 0) || 0;
          const tokenPct = walletRow.value > 0 ? (tokenValue / walletRow.value) * 100 : 0;
          return tokenPct > 0.05; // Only show tokens with more than 0.0% (0.05% rounds to 0.1%)
        })
        .map(token => {
          const tokenValue = Number(token?.valueInWallet || 0) || 0;
          const tokenPct = walletRow.value > 0 ? (tokenValue / walletRow.value) * 100 : 0;
          const chain = String(token?.chain || '');
          const network = String(token?.network || '');
          const address = String(token?.address || '');
          const isFavorite = isTokenInWatchlist({ chain, network, address });
          const favoriteClass = isFavorite ? 'is-active' : '';
          const favoriteIcon = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
          const logoUrl = String(token?.logoUrl || '');
          const symbol = String(token?.symbol || '—');
          const name = String(token?.name || '');
          
          return `
            <div class="wallet-token-item" data-key="${escapeHtml(token?.key || '')}">
              <div class="wallet-token-name">${escapeHtml(symbol)}</div>
              <div class="wallet-token-value"><span class="redacted-field" tabindex="0">${formatCurrency(tokenValue)}</span></div>
              <div class="wallet-token-pct">${formatPct(tokenPct)}</div>
              <div class="wallet-token-actions">
                <a class="holding-action ${favoriteClass}" href="#" data-action="watchlist-add" 
                   data-chain="${escapeAttribute(chain)}" 
                   data-network="${escapeAttribute(network)}" 
                   data-address="${escapeAttribute(address)}"
                   data-symbol="${escapeAttribute(symbol)}"
                   data-name="${escapeAttribute(name)}"
                   data-logo-url="${escapeAttribute(logoUrl)}"
                   aria-label="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
                  <i class="${favoriteIcon}" aria-hidden="true"></i>
                </a>
              </div>
            </div>
          `;
        }).join('');
      
      const visibleTokenCount = walletTokens.filter(t => {
        const tv = Number(t?.valueInWallet || 0) || 0;
        const tp = walletRow.value > 0 ? (tv / walletRow.value) * 100 : 0;
        return tp > 0.05;
      }).length;
      
      return `
        <div class="wallet-subsection" data-wallet="${escapeHtml(walletRow.wallet)}">
          <div class="wallet-subheader" data-wallet="${escapeHtml(walletRow.wallet)}">
            <div class="wallet-subheader-left">
              <i class="wallet-subchevron fa-solid fa-chevron-right"></i>
              <div class="wallet-address mono">${escapeHtml(shortenAddress(walletRow.wallet))}</div>
            </div>
            <div class="wallet-subheader-right">
              <div class="wallet-stats">${visibleTokenCount} token${visibleTokenCount === 1 ? '' : 's'} · ${formatPct(walletPct)}</div>
              <div class="wallet-value"><span class="redacted-field" tabindex="0">${formatCurrency(walletRow.value)}</span></div>
            </div>
          </div>
          <div class="wallet-tokens hidden">
            ${tokenListHtml}
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="chain-section" data-chain="${escapeHtml(chainRow.chain)}">
        <div class="chain-header" data-chain="${escapeHtml(chainRow.chain)}">
          <div class="chain-header-left">
            <i class="chain-chevron fa-solid fa-chevron-right"></i>
            <div class="chain-name">${escapeHtml(chainName)}</div>
          </div>
          <div class="chain-header-right">
            <div class="chain-stats">${chainRow.wallets.length} wallet${chainRow.wallets.length === 1 ? '' : 's'} · ${formatPct(chainPct)}</div>
            <div class="chain-value"><span class="redacted-field" tabindex="0">${formatCurrency(chainRow.value)}</span></div>
          </div>
        </div>
        <div class="chain-wallets hidden">
          ${walletsHtml}
        </div>
      </div>
    `;
  }).join('');
  
  walletAllocationEl.innerHTML = chainHtml;
  
  // Add click handlers for chain expansion
  walletAllocationEl.querySelectorAll('.chain-header').forEach(header => {
    header.addEventListener('click', () => {
      const chain = header.dataset.chain;
      const section = walletAllocationEl.querySelector(`.chain-section[data-chain="${chain}"]`);
      if (!section) return;
      
      const walletsEl = section.querySelector('.chain-wallets');
      const chevron = section.querySelector('.chain-chevron');
      
      if (walletsEl && chevron) {
        const isExpanded = !walletsEl.classList.contains('hidden');
        walletsEl.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-right', isExpanded);
        chevron.classList.toggle('fa-chevron-down', !isExpanded);
      }
      
      hapticFeedback('light');
    });
  });
  
  // Add click handlers for wallet expansion within chains
  walletAllocationEl.querySelectorAll('.wallet-subheader').forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering chain header
      const wallet = header.dataset.wallet;
      const section = walletAllocationEl.querySelector(`.wallet-subsection[data-wallet="${wallet}"]`);
      if (!section) return;
      
      const tokensEl = section.querySelector('.wallet-tokens');
      const chevron = section.querySelector('.wallet-subchevron');
      
      if (tokensEl && chevron) {
        const isExpanded = !tokensEl.classList.contains('hidden');
        tokensEl.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-right', isExpanded);
        chevron.classList.toggle('fa-chevron-down', !isExpanded);
      }
      
      hapticFeedback('light');
    });
  });
}

function filterAndSortHoldingsDOM() {
  const tbody = $('tableBody');
  if (!tbody) return;

  const hideDust = $('hideDust')?.checked ?? true;
  const sortBy = $('sortSelect')?.value || 'valueDesc';
  const showHidden = $('showHiddenHoldings')?.checked ?? !!state.showHiddenHoldings;

  // Get all holding rows
  const rows = Array.from(tbody.querySelectorAll('tr.holding-row, tr.holding-card-row'));
  
  if (rows.length === 0) {
    // No rows to filter/sort, might need to render first
    scheduleRenderHoldingsTable();
    return;
  }
  
  // Filter and sort rows
  rows.forEach(row => {
    const key = row.dataset.key;
    if (!key) return;
    
    const holding = state.holdings.find(h => h.key === key);
    if (!holding) {
      row.style.display = 'none';
      return;
    }

    // Apply filters
    let shouldShow = true;
    if (!showHidden && isHoldingHidden(holding.key)) shouldShow = false;
    if (hideDust && holding.value < 1) shouldShow = false;
    
    row.style.display = shouldShow ? '' : 'none';
    row.dataset.sortValue = getSortValue(holding, sortBy);
  });

  // Sort visible rows
  const visibleRows = rows.filter(row => row.style.display !== 'none');
  visibleRows.sort((a, b) => {
    const aVal = parseFloat(a.dataset.sortValue) || 0;
    const bVal = parseFloat(b.dataset.sortValue) || 0;
    return bVal - aVal; // Descending by default
  });

  // Reorder DOM - append visible rows first, then hidden ones
  visibleRows.forEach(row => tbody.appendChild(row));
  const hiddenRows = rows.filter(row => row.style.display === 'none');
  hiddenRows.forEach(row => tbody.appendChild(row));
  
  try { syncWatchlistStars(); } catch {}
}

function getSortValue(holding, sortBy) {
  switch (sortBy) {
    case 'valueAsc': return holding.value;
    case 'valueDesc': return holding.value;
    case 'pnlAsc': return holding.changeUsd || 0;
    case 'pnlDesc': return holding.changeUsd || 0;
    case 'mcapAsc': return holding.mcap || 0;
    case 'mcapDesc': return holding.mcap || 0;
    case 'nameAsc': return 0; // Handle separately
    default: return holding.value;
  }
}

function renderHoldingsTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  const exportBtn = $('exportButton');
  if (exportBtn) exportBtn.disabled = state.holdings.length === 0;

  const exportJsonBtn = $('exportJsonButton');
  if (exportJsonBtn) exportJsonBtn.disabled = state.holdings.length === 0;

  state.viewMode = 'aggregate';

  const useCardRows = true;
  document.body.classList.toggle('holdings-cards', true);

  const formatPnlCell = (pnlUsd) => {
    const v = Number(pnlUsd || 0) || 0;
    const cls = v > 0.0001 ? 'pnl-positive' : v < -0.0001 ? 'pnl-negative' : 'pnl-flat';
    const sign = v > 0.0001 ? '+' : v < -0.0001 ? '-' : '+';
    return `<strong class="mono redacted-field ${cls}" tabindex="0">${sign}${formatCurrency(Math.abs(v))}</strong>`;
  };

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
            <td><div class="skeleton-line w-40"></div></td>
          </tr>
        `;
      }

      return `
        <tr class="skeleton-row holding-card-row">
          <td colspan="6">
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
    const pageIndicatorTop = $('pageIndicatorTop');
    if (pageIndicatorTop) pageIndicatorTop.textContent = 'Page 1 of 1';
    return;
  }

  const scanTotal = Number(state.scanMeta?.total || 0) || 0;
  const scanCompleted = Number(state.scanMeta?.completed || 0) || 0;
  const scanRemaining = Math.max(0, scanTotal - scanCompleted);
  const scanSkeletonCount = state.scanning ? Math.min(3, Math.max(1, scanRemaining)) : 0;

  const searchTerm = ($('searchInput')?.value || '').toLowerCase();
  const hideDust = $('hideDust')?.checked ?? true;
  const sortBy = $('sortSelect')?.value || 'valueDesc';
  const showHidden = $('showHiddenHoldings')?.checked ?? !!state.showHiddenHoldings;

  const cacheKey = [
    `v:${holdingsDataVersion}`,
    `w:${watchlistDataVersion}`,
    `h:${hiddenHoldingsVersion}`,
    `s:${searchTerm}`,
    `d:${hideDust ? 1 : 0}`,
    `o:${sortBy}`,
    `sh:${showHidden ? 1 : 0}`,
  ].join('|');

  const currentPage = state.holdingsPage || 1;

  const canReuseFiltered = holdingsTableCache.key === cacheKey
    && holdingsTableCache.useCardRows === useCardRows
    && Array.isArray(holdingsTableCache.filtered);

  let filtered = canReuseFiltered ? holdingsTableCache.filtered : null;

  if (!filtered) {
    filtered = state.holdings.filter(h => {
      if (!showHidden && isHoldingHidden(h.key)) return false;
      if (hideDust && h.value < 1) return false;
      if (!searchTerm) return true;
      return h.symbol.toLowerCase().includes(searchTerm) || h.name.toLowerCase().includes(searchTerm) || h.address.toLowerCase().includes(searchTerm);
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'valueAsc': return a.value - b.value;
        case 'pnlAsc': return (a.changeUsd || 0) - (b.changeUsd || 0);
        case 'mcapAsc': return (a.mcap || 0) - (b.mcap || 0);
        case 'nameAsc': return a.name.localeCompare(b.name);
        case 'pnlDesc': return (b.changeUsd || 0) - (a.changeUsd || 0);
        case 'mcapDesc': return (b.mcap || 0) - (a.mcap || 0);
        case 'valueDesc':
        default:
          return b.value - a.value;
      }
    });

    holdingsTableCache.key = cacheKey;
    holdingsTableCache.useCardRows = useCardRows;
    holdingsTableCache.filtered = filtered;
    holdingsTableCache.page = null;
    holdingsTableCache.htmlBase = null;
  }

  if (filtered.length === 0) {
    if (state.scanning) {
      const rows = Array.from({ length: 6 }).map(() => {
        if (!useCardRows) {
          return `
            <tr class="skeleton-row">
              <td><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></td>
              <td><div class="skeleton-line w-30"></div></td>
              <td><div class="skeleton-line w-40"></div></td>
              <td><div class="skeleton-line w-40"></div></td>
              <td><div class="skeleton-line w-50"></div></td>
              <td><div class="skeleton-line w-40"></div></td>
            </tr>
          `;
        }

        return `
          <tr class="skeleton-row holding-card-row">
            <td colspan="6">
              <div class="holding-card" data-whatif-card="1" data-holding-key="${escapeAttribute(String(holdingWhatIfKey(holding) || ''))}" data-whatif-base-price="${escapeAttribute(String(Number(holding.price || 0) || 0))}" data-whatif-base-mcap="${escapeAttribute(String(Number(holding.mcap || 0) || 0))}" data-whatif-base-value="${escapeAttribute(String(Number(holding.value || 0) || 0))}" data-whatif-base-price-text="${escapeAttribute(String(formatPrice(holding.price) || '—'))}" data-whatif-base-mcap-text="${escapeAttribute(String(holding.mcap ? formatCurrency(holding.mcap) : '—'))}" data-whatif-base-value-text="${escapeAttribute(String(formatCurrency(holding.value) || '—'))}">
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
                  <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rows;
      const progressPart = scanTotal > 0 ? ` • Scanning ${scanCompleted}/${scanTotal}` : '';
      $('tableStats') && ($('tableStats').textContent = `Loading holdings…${progressPart}`);
      $('pageIndicator') && ($('pageIndicator').textContent = 'Page 1 of 1');
      $('pageIndicatorTop') && ($('pageIndicatorTop').textContent = 'Page 1 of 1');
      $('pagePrev') && ($('pagePrev').disabled = true);
      $('pagePrev')?.classList?.add('hidden');
      $('pageNext') && ($('pageNext').disabled = true);
      $('pagePrevTop') && ($('pagePrevTop').disabled = true);
      $('pagePrevTop')?.classList?.add('hidden');
      $('pageNextTop') && ($('pageNextTop').disabled = true);
      return;
    }

    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-text">No holdings match your filters</div>
          </div>
        </td>
      </tr>
    `;
    $('tableStats') && ($('tableStats').textContent = 'Showing 0 tokens');
    $('pageIndicator') && ($('pageIndicator').textContent = 'Page 1 of 1');
    $('pageIndicatorTop') && ($('pageIndicatorTop').textContent = 'Page 1 of 1');
    $('pagePrev') && ($('pagePrev').disabled = true);
    $('pagePrev')?.classList?.add('hidden');
    $('pageNext') && ($('pageNext').disabled = true);
    $('pagePrevTop') && ($('pagePrevTop').disabled = true);
    $('pagePrevTop')?.classList?.add('hidden');
    $('pageNextTop') && ($('pageNextTop').disabled = true);
    return;
  }

  const totalItems = filtered.length;
  let filteredTotalValue = 0;
  for (let i = 0; i < filtered.length; i++) filteredTotalValue += Number(filtered[i]?.value || 0) || 0;

  const tableStatsEl = $('tableStats');
  if (tableStatsEl) {
    tableStatsEl.textContent = `Showing ${totalItems} tokens • Total value: ${formatCurrency(filteredTotalValue)}`;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / HOLDINGS_PAGE_SIZE));
  if ((state.holdingsPage || 1) > totalPages) setHoldingsPage(totalPages);
  const page = state.holdingsPage || 1;
  const startIdx = (page - 1) * HOLDINGS_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + HOLDINGS_PAGE_SIZE);
  
  // For DOM manipulation, we need all filtered items, not just current page
  const allFilteredItems = filtered;

  const canReuseHtmlBase =
    holdingsTableCache.key === cacheKey &&
    holdingsTableCache.useCardRows === useCardRows &&
    holdingsTableCache.page === page &&
    typeof holdingsTableCache.htmlBase === 'string';

  const pageIndicator = $('pageIndicator');
  if (pageIndicator) pageIndicator.textContent = `Page ${page} of ${totalPages}`;
  const pageIndicatorTop = $('pageIndicatorTop');
  if (pageIndicatorTop) pageIndicatorTop.textContent = `Page ${page} of ${totalPages}`;
  const prevBtn = $('pagePrev');
  const nextBtn = $('pageNext');
  const prevBtnTop = $('pagePrevTop');
  const nextBtnTop = $('pageNextTop');
  if (prevBtn) {
    prevBtn.disabled = page <= 1;
    prevBtn.classList.toggle('hidden', page <= 1);
  }
  if (prevBtnTop) {
    prevBtnTop.disabled = page <= 1;
    prevBtnTop.classList.toggle('hidden', page <= 1);
  }
  if (nextBtn) {
    nextBtn.disabled = page >= totalPages;
  }
  if (nextBtnTop) {
    nextBtnTop.disabled = page >= totalPages;
  }

  if (!useCardRows) {
    const skeletonRows = state.scanning && scanSkeletonCount > 0
      ? Array.from({ length: scanSkeletonCount }).map(() => `
          <tr class="skeleton-row">
            <td><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-30"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-50"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
          </tr>
        `).join('')
      : '';

    const fullCacheKey = `${cacheKey}|p:${page}|c:${useCardRows ? 1 : 0}`;
    
    // Check if we can manipulate existing DOM instead of using innerHTML
    const existingRows = Array.from(tbody.querySelectorAll('tr.holding-row'));
    const existingKeys = new Set(existingRows.map(r => r.dataset.key).filter(Boolean));
    const allFilteredKeys = new Set(allFilteredItems.map(h => h.key));
    const pageItemKeys = new Set(pageItems.map(h => h.key));
    
    // Check if all filtered items exist in the DOM (not just current page)
    const allItemsExist = allFilteredItems.every(item => existingKeys.has(item.key));
    const canManipulateDOM = existingRows.length > 0 && tbody.dataset.hasRendered === 'true' && allItemsExist;
    
    if (canManipulateDOM) {
      // Use DOM manipulation to avoid image re-requests
      
      // First, reorder all rows based on allFilteredItems order
      allFilteredItems.forEach((holding) => {
        const row = existingRows.find(r => r.dataset.key === holding.key);
        if (row) {
          tbody.appendChild(row);  // Move to end in correct order
        }
      });
      
      // Then show/hide based on current page
      existingRows.forEach(row => {
        const key = row.dataset.key;
        if (!key || !pageItemKeys.has(key)) {
          row.style.display = 'none';
        } else {
          row.style.display = '';
        }
      });
    } else if (canReuseHtmlBase) {
      const newHtml = `${holdingsTableCache.htmlBase}${skeletonRows}`;
      tbody.innerHTML = newHtml;
      tbody.dataset.hasRendered = 'true';
      holdingsTableCache.lastRenderedKey = fullCacheKey;
    } else {
      // Render ALL filtered items (not just current page) so DOM manipulation works for all future changes
      const htmlBase = allFilteredItems.map((holding) => {
        const displayAddress = (holding.chain === 'evm' && isValidEvmContractAddress(holding.contractAddress)) ? holding.contractAddress : holding.address;
        const chartAddress = holding.chain === 'evm' ? displayAddress : holding.address;

        const wlActive = !!getWatchlistMatchKey({
          chain: String(holding.chain || ''),
          network: String(holding.network || ''),
          address: String(chartAddress || ''),
        });

        const isHidden = isHoldingHidden(holding.key);
        const hideIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const hideLabel = isHidden ? 'Unhide token' : 'Hide token';

        return `
          <tr class="holding-row" data-key="${holding.key}">
            <td>
              <div class="token-cell">
                ${(() => {
                  const icon = resolveTokenIcon(holding.logo, holding.symbol, { preferFast: false });
                  const ipfsAttrs = icon.cid
                    ? `data-ipfs-cid=\"${escapeAttribute(icon.cid)}\" data-gateway-idx=\"0\"`
                    : '';
                  return `<img class=\"token-icon\" src=\"${escapeAttribute(icon.src)}\" ${ipfsAttrs} onerror=\"handleSearchTokenIconError(this,'${escapeAttribute(icon.fallback)}')\" alt=\"\">`;
                })()}
                <div class="token-info">
                  <div class="token-symbol">${escapeHtml(holding.symbol)}</div>
                  <div class="token-name">${escapeHtml(holding.name)}</div>
                </div>
                <div class="holding-card-actions" aria-label="Holding actions">
                  <a class="holding-action ${wlActive ? 'is-active' : ''}" href="#" data-action="watchlist-add" data-chain="${escapeAttribute(String(holding.chain || ''))}" data-network="${escapeAttribute(String(holding.network || ''))}" data-address="${escapeAttribute(String(chartAddress || ''))}" data-symbol="${escapeAttribute(String(holding.symbol || ''))}" data-name="${escapeAttribute(String(holding.name || ''))}" data-logo-url="${escapeAttribute(String(holding.logo || ''))}" aria-label="${wlActive ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                    <i class="${wlActive ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i>
                  </a>
                  <a class="holding-action" href="#" data-action="copy-contract" data-address="${escapeAttribute(String(displayAddress || ''))}" aria-label="Copy contract address">
                    <i class="fa-regular fa-copy" aria-hidden="true"></i>
                  </a>
                  <a class="holding-action holding-action-explorer" href="${(() => {
                    const base = holding.chain === 'solana' ? 'https://solscan.io/token/' : evmExplorerBase(holding.network) + '/token/';
                    return escapeAttribute(base + displayAddress);
                  })()}" target="_blank" rel="noopener noreferrer" aria-label="View on ${(() => { const lbl = holding.chain === 'solana' ? 'SOL' : evmNetworkLabel(holding.network); return escapeAttribute(lbl); })()} Explorer">
                    ${(() => {
                      const chainLogoUrl = getChainLogoUrl(holding.chain, holding.network);
                      return chainLogoUrl ? `<img class=\"chain-logo-action\" src=\"${escapeAttribute(chainLogoUrl)}\" alt=\"\" />` : '<i class=\"fa-solid fa-up-right-from-square\" aria-hidden=\"true\"></i>';
                    })()}
                  </a>
                  <a class="holding-action" href="#" data-action="chart" data-chain="${holding.chain}" data-network="${holding.network || ''}" data-address="${chartAddress}" data-symbol="${escapeHtml(holding.symbol || '')}" data-name="${escapeHtml(holding.name || '')}" aria-label="View Chart">
                    <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                  </a>
                  <a class="holding-action" href="#" data-action="holding-hide-toggle" data-holding-key="${escapeAttribute(String(holding.key || ''))}" aria-label="${escapeAttribute(hideLabel)}" title="${escapeAttribute(hideLabel)}">
                    <i class="fa-regular ${hideIcon}" aria-hidden="true"></i>
                  </a>
                  <div class="chart-popover hidden" role="menu" aria-label="Chart providers">
                    <a class="chart-popover-link" role="menuitem" data-provider="dexscreener" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dexscreener">
                      <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.dexscreener) ? window.__peeekChartIcons.dexscreener : 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64','D');">
                    </a>
                    <a class="chart-popover-link" role="menuitem" data-provider="dextools" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dextools">
                      <img class="chart-popover-icon" alt="" src="https://cdn.worldvectorlogo.com/logos/dextools.svg" onerror="this.onerror=null;this.style.display='none';this.parentElement.textContent='T';">
                    </a>
                    <a class="chart-popover-link" role="menuitem" data-provider="birdeye" href="#" target="_blank" rel="noopener noreferrer" aria-label="Birdeye">
                      <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.birdeye) ? window.__peeekChartIcons.birdeye : 'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64','B');">
                    </a>
                  </div>
                </div>
              </div>
            </td>
            <td><strong class="mono redacted-field" tabindex="0">${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong></td>
            <td class="mono"><strong class="redacted-field" tabindex="0">${formatNumber(holding.balance)}</strong></td>
            <td class="mono"><strong class="redacted-field" tabindex="0">${formatPrice(holding.price)}</strong></td>
            <td class="mono"><strong class="redacted-field" tabindex="0">${formatCurrency(holding.value)}</strong></td>
            <td class="mono">${formatPnlCell(holding.changeUsd)}</td>
          </tr>
        `;
      }).join('');

      holdingsTableCache.key = cacheKey;
      holdingsTableCache.useCardRows = useCardRows;
      holdingsTableCache.page = page;
      holdingsTableCache.htmlBase = htmlBase;
      holdingsTableCache.totalItems = totalItems;
      holdingsTableCache.totalPages = totalPages;
      holdingsTableCache.filteredTotalValue = filteredTotalValue;

      const newHtml = `${htmlBase}${skeletonRows}`;
      tbody.innerHTML = newHtml;
      tbody.dataset.hasRendered = 'true';
      holdingsTableCache.lastRenderedKey = fullCacheKey;
      
      // After initial render, hide items not on current page
      requestAnimationFrame(() => {
        const allRows = Array.from(tbody.querySelectorAll('tr.holding-row'));
        allRows.forEach((row, index) => {
          if (index < startIdx || index >= startIdx + HOLDINGS_PAGE_SIZE) {
            row.style.display = 'none';
          }
        });
      });
    }
  } else {
    const skeletonRows = state.scanning && scanSkeletonCount > 0
      ? Array.from({ length: scanSkeletonCount }).map(() => `
          <tr class="skeleton-row holding-card-row">
            <td colspan="6">
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
                  <div class="holding-metric"><div class="skeleton-line w-60"></div></div>
                </div>
              </div>
            </td>
          </tr>
        `).join('')
      : '';

    const fullCacheKey = `${cacheKey}|p:${page}|c:${useCardRows ? 1 : 0}`;
    
    // Check if we can manipulate existing DOM instead of using innerHTML
    const existingRows = Array.from(tbody.querySelectorAll('tr.holding-card-row'));
    const existingKeys = new Set(existingRows.map(r => r.dataset.key).filter(Boolean));
    const allFilteredKeys = new Set(allFilteredItems.map(h => h.key));
    const pageItemKeys = new Set(pageItems.map(h => h.key));
    
    // Check if all filtered items exist in the DOM (not just current page)
    const allItemsExist = allFilteredItems.every(item => existingKeys.has(item.key));
    const canManipulateDOM = existingRows.length > 0 && tbody.dataset.hasRendered === 'true' && allItemsExist;
    
    if (canManipulateDOM) {
      // Use DOM manipulation to avoid image re-requests
      
      // First, reorder all rows based on allFilteredItems order
      allFilteredItems.forEach((holding) => {
        const row = existingRows.find(r => r.dataset.key === holding.key);
        if (row) {
          tbody.appendChild(row);  // Move to end in correct order
        }
      });
      
      // Then show/hide based on current page
      existingRows.forEach(row => {
        const key = row.dataset.key;
        if (!key || !pageItemKeys.has(key)) {
          row.style.display = 'none';
        } else {
          row.style.display = '';
        }
      });
    } else if (canReuseHtmlBase) {
      const newHtml = `${holdingsTableCache.htmlBase}${skeletonRows}`;
      tbody.innerHTML = newHtml;
      tbody.dataset.hasRendered = 'true';
      holdingsTableCache.lastRenderedKey = fullCacheKey;
    } else {
      // Render ALL filtered items (not just current page) so DOM manipulation works for all future changes
      const htmlBase = allFilteredItems.map((holding) => {
        const displayAddress = (holding.chain === 'evm' && isValidEvmContractAddress(holding.contractAddress)) ? holding.contractAddress : holding.address;
        const chartAddress = holding.chain === 'evm' ? displayAddress : holding.address;

        let explorerHref = '#';
        if (holding.chain === 'solana') {
          explorerHref = `https://solscan.io/token/${holding.address}`;
        } else if (isValidEvmContractAddress(displayAddress)) {
          explorerHref = `${evmExplorerBase(holding.network)}/token/${displayAddress}`;
        }
        const explorerDisabled = explorerHref === '#';

        const wlActive = !!getWatchlistMatchKey({
          chain: String(holding.chain || ''),
          network: String(holding.network || ''),
          address: String(chartAddress || ''),
        });

        const isHidden = isHoldingHidden(holding.key);
        const hideIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const hideLabel = isHidden ? 'Unhide token' : 'Hide token';

        const basePriceNum = Number(holding.price || 0) || 0;
        const baseMcapNum = Number(holding.mcap || 0) || 0;
        const baseValueNum = (Number.isFinite(Number(holding.value))
          ? Number(holding.value)
          : ((Number(holding.balance || 0) || 0) * (Number(holding.price || 0) || 0))) || 0;
        const basePriceText = basePriceNum > 0 ? formatPrice(basePriceNum) : '—';
        const baseMcapText = baseMcapNum > 0 ? formatCurrency(baseMcapNum) : '—';
        const baseValueText = formatCurrency(baseValueNum);

        return `
          <tr class="holding-row holding-card-row" data-key="${holding.key}">
            <td colspan="6">
              <div class="holding-card" data-whatif-card="1" data-holding-key="${escapeAttribute(String(holdingWhatIfKey(holding) || ''))}" data-whatif-base-price="${escapeAttribute(String(basePriceNum))}" data-whatif-base-mcap="${escapeAttribute(String(baseMcapNum))}" data-whatif-base-value="${escapeAttribute(String(baseValueNum))}" data-whatif-base-price-text="${escapeAttribute(String(basePriceText))}" data-whatif-base-mcap-text="${escapeAttribute(String(baseMcapText))}" data-whatif-base-value-text="${escapeAttribute(String(baseValueText))}">
                <div class="holding-card-header">
                  <div class="token-cell">
                    ${(() => {
                      const icon = resolveTokenIcon(holding.logo, holding.symbol, { preferFast: false });
                      const ipfsAttrs = icon.cid
                        ? `data-ipfs-cid=\"${escapeAttribute(icon.cid)}\" data-gateway-idx=\"0\"`
                        : '';
                      return `<img class=\"token-icon\" src=\"${escapeAttribute(icon.src)}\" ${ipfsAttrs} onerror=\"handleSearchTokenIconError(this,'${escapeAttribute(icon.fallback)}')\" alt=\"\">`;
                    })()}
                    <div class="token-info">
                      <div class="token-symbol">${escapeHtml(holding.symbol)}</div>
                      <div class="token-name">${escapeHtml(holding.name)}</div>
                    </div>
                  </div>

                  <div class="holding-card-header-right">
                    <div class="holding-card-actions" aria-label="Holding actions">
                      <a class="holding-action ${wlActive ? 'is-active' : ''}" href="#" data-action="watchlist-add" data-chain="${escapeAttribute(String(holding.chain || ''))}" data-network="${escapeAttribute(String(holding.network || ''))}" data-address="${escapeAttribute(String(chartAddress || ''))}" data-symbol="${escapeAttribute(String(holding.symbol || ''))}" data-name="${escapeAttribute(String(holding.name || ''))}" data-logo-url="${escapeAttribute(String(holding.logo || ''))}" aria-label="${wlActive ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                        <i class="${wlActive ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i>
                      </a>
                      <a class="holding-action" href="#" data-action="copy-contract" data-address="${escapeAttribute(String(displayAddress || ''))}" aria-label="Copy contract address">
                        <i class="fa-regular fa-copy" aria-hidden="true"></i>
                      </a>
                      <a class="holding-action holding-action-explorer ${explorerDisabled ? 'disabled' : ''}" href="${explorerHref}" target="_blank" rel="noopener noreferrer" aria-label="View on ${(() => { const lbl = holding.chain === 'solana' ? 'SOL' : evmNetworkLabel(holding.network); return escapeAttribute(lbl); })()} Explorer" ${explorerDisabled ? 'aria-disabled=\"true\" tabindex=\"-1\"' : ''}>
                        ${(() => {
                          const chainLogoUrl = getChainLogoUrl(holding.chain, holding.network);
                          return chainLogoUrl ? `<img class=\"chain-logo-action\" src=\"${escapeAttribute(chainLogoUrl)}\" alt=\"\" />` : '<i class=\"fa-solid fa-up-right-from-square\" aria-hidden=\"true\"></i>';
                        })()}
                      </a>
                      <a class="holding-action" href="#" data-action="chart" data-chain="${holding.chain}" data-network="${holding.network || ''}" data-address="${chartAddress}" data-symbol="${escapeHtml(holding.symbol || '')}" data-name="${escapeHtml(holding.name || '')}" aria-label="View Chart">
                        <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                      </a>
                      <a class="holding-action" href="#" data-action="holding-hide-toggle" data-holding-key="${escapeAttribute(String(holding.key || ''))}" aria-label="${escapeAttribute(hideLabel)}" title="${escapeAttribute(hideLabel)}">
                        <i class="fa-regular ${hideIcon}" aria-hidden="true"></i>
                      </a>
                      <div class="chart-popover hidden" role="menu" aria-label="Chart providers">
                        <a class="chart-popover-link" role="menuitem" data-provider="dexscreener" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dexscreener">
                          <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.dexscreener) ? window.__peeekChartIcons.dexscreener : 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64','D');">
                        </a>
                        <a class="chart-popover-link" role="menuitem" data-provider="dextools" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dextools">
                          <img class="chart-popover-icon" alt="" src="https://cdn.worldvectorlogo.com/logos/dextools.svg" onerror="this.onerror=null;this.style.display='none';this.parentElement.textContent='T';">
                        </a>
                        <a class="chart-popover-link" role="menuitem" data-provider="birdeye" href="#" target="_blank" rel="noopener noreferrer" aria-label="Birdeye">
                          <img class="chart-popover-icon" alt="" src="${(window.__peeekChartIcons && window.__peeekChartIcons.birdeye) ? window.__peeekChartIcons.birdeye : 'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleChartIconError(this,'https://www.google.com/s2/favicons?domain=birdeye.so&sz=64','B');">
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="holding-card-metrics">
                  <div class="holding-metric"><div class="holding-metric-label">Balance</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${formatNumber(holding.balance)}</strong></div></div>
                  <div class="holding-metric"><div class="holding-metric-label">Price</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0" data-whatif-field="price">${formatPrice(holding.price)}</strong></div></div>
                  ${(() => {
                    const total = Number(state.totalValue || 0) || 0;
                    const v = Number(holding.value || 0) || 0;
                    const pct = (total > 0) ? ((v / total) * 100) : NaN;
                    const text = Number.isFinite(pct) ? `${pct.toFixed(2)}%` : '—';
                    return `<div class="holding-metric"><div class="holding-metric-label">Allocation</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${escapeHtml(text)}</strong></div></div>`;
                  })()}
                  ${(() => {
                    const key = holdingWhatIfKey(holding);
                    const mult = key ? (Number(whatIfHolding.get(key) || 1) || 1) : 1;
                    const active = key && mult && mult !== 1;
                    const simValue = (Number(holding.balance || 0) || 0) * (Number(holding.price || 0) || 0) * (Number(mult) || 1);
                    const valueText = active && Number.isFinite(simValue)
                      ? `${formatCurrency(simValue)} (${mult}x)`
                      : formatCurrency(holding.value);
                    const valueClass = active ? 'holding-metric-value is-whatif' : 'holding-metric-value';
                    return `<div class="holding-metric">
                      <div class="holding-metric-label">Value</div>
                      <div class="${valueClass} mono"><strong class="redacted-field" tabindex="0" data-whatif-field="value">${escapeHtml(valueText)}</strong></div>
                    </div>`;
                  })()}
                  <div class="holding-metric"><div class="holding-metric-label">Market Cap</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0" data-whatif-field="mcap">${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong></div></div>
                  <div class="holding-metric"><div class="holding-metric-label">Volume (24h)</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${(Number(holding.volume24hUsd || 0) > 0) ? formatCurrency(holding.volume24hUsd) : '—'}</strong></div></div>
                  <div class="holding-metric"><div class="holding-metric-label">PnL (24h)</div><div class="holding-metric-value mono">${formatPnlCell(holding.changeUsd)}</div></div>
                  <div class="holding-metric"><div class="holding-metric-label">Liquidity</div><div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${(Number(holding.liquidityUsd || 0) > 0) ? formatCurrency(holding.liquidityUsd) : '—'}</strong></div></div>
                  ${(() => {
                    const key = holdingWhatIfKey(holding);
                    const mult = key ? (Number(whatIfHolding.get(key) || 1) || 1) : 1;
                    const buttons = WHATIF_PRESETS.map((m) => {
                      const isActive = Number(m) === Number(mult);
                      return `<button class="whatif-chip ${isActive ? 'is-active' : ''}" type="button" data-action="whatif-mult" data-holding-key="${escapeAttribute(key)}" data-mult="${escapeAttribute(String(m))}" aria-label="What if ${escapeAttribute(String(m))}x">${escapeHtml(String(m))}x</button>`;
                    }).join('');
                    return `<div class="holding-metric holding-metric-whatif">
                      <div class="holding-metric-value">
                        <div class="whatif-chips" role="group" aria-label="What if multipliers">${buttons}</div>
                      </div>
                    </div>`;
                  })()}
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      holdingsTableCache.key = cacheKey;
      holdingsTableCache.useCardRows = useCardRows;
      holdingsTableCache.page = page;
      holdingsTableCache.htmlBase = htmlBase;
      holdingsTableCache.totalItems = totalItems;
      holdingsTableCache.totalPages = totalPages;
      holdingsTableCache.filteredTotalValue = filteredTotalValue;

      const newHtml = `${htmlBase}${skeletonRows}`;
      tbody.innerHTML = newHtml;
      tbody.dataset.hasRendered = 'true';
      holdingsTableCache.lastRenderedKey = fullCacheKey;
      
      // After initial render, hide items not on current page
      requestAnimationFrame(() => {
        const allRows = Array.from(tbody.querySelectorAll('tr.holding-card-row'));
        allRows.forEach((row, index) => {
          if (index < startIdx || index >= startIdx + HOLDINGS_PAGE_SIZE) {
            row.style.display = 'none';
          }
        });
      });
    }
  }

  try { syncWatchlistStars(); } catch {}
}

async function recomputeAggregatesAndRender() {
  const holdingsMap = new Map();
  const wallets = [];
  let total = 0;
  let totalSolValue = 0;
  let totalEvmValue = 0;
  let totalChangeSolUsd = 0;
  let totalChangeEvmUsd = 0;
  let totalForChange = 0;
  let total24hAgo = 0;


  const solDebugContrib = [];

  state.walletHoldings.forEach((items, walletKey) => {
    const [chain, wallet] = walletKey.split(':');
    wallets.push({ address: wallet, chain, count: items.length });
    let solWalletNow = 0;
    let solWalletChange = 0;
    let solWalletHasChange = false;

    const walletTotalValue = items.reduce((s, h) => s + (Number(h?.value || h?.valueUsd || 0) || 0), 0);
    if (chain === 'solana') totalSolValue += walletTotalValue;
    else totalEvmValue += walletTotalValue;

    items.forEach(holding => {
      const rawTokenAddress = (chain === 'solana')
        ? normalizeSolHoldingTokenAddress(holding)
        : (holding.address || holding.token_address || holding.mint || holding.mintAddress || holding.mint_address || holding.tokenAddress);
      const contractAddress = holding.contract_address || holding.contractAddress || (chain === 'evm' ? extractEvmContractAddress(rawTokenAddress) : '');
      const tokenAddress = contractAddress || rawTokenAddress;
      const network = chain === 'evm' ? normalizeEvmNetwork(holding.chain || holding.network) : '';
      const key = `${chain}:${tokenAddress}`;
      const value = Number(holding.value || holding.valueUsd || 0) || 0;
      const amount = Number(holding.amount || holding.uiAmount || holding.balance || 0) || 0;
      const mcap = Number(holding.market_cap ?? holding.marketCap ?? holding.mc ?? holding.fdv ?? holding.fdv_usd ?? 0) || 0;
      const volume24hUsd = Number(
        holding.volume24hUsd ??
        holding.volume_24h_usd ??
        holding.volume24h ??
        holding.volume_24h ??
        0
      ) || 0;
      const liquidityUsd = Number(
        holding.liquidityUsd ??
        holding.liquidity_usd ??
        holding.liquidity ??
        0
      ) || 0;
      const changeUsd = Number(
        holding.changeUsd ??
        holding.change_usd ??
        holding.change_1d_usd ??
        holding.value_change_1d ??
        holding.value_change_24h ??
        holding.valueChange1d ??
        holding.pnlUsd ??
        0
      ) || 0;

      if (holdingsMap.has(key)) {
        const existing = holdingsMap.get(key);
        existing.value += value;
        existing.balance += amount;
        existing.mcap = Math.max(existing.mcap || 0, mcap);
        existing.volume24hUsd = Math.max(Number(existing.volume24hUsd || 0) || 0, volume24hUsd);
        existing.liquidityUsd = Math.max(Number(existing.liquidityUsd || 0) || 0, liquidityUsd);
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
          volume24hUsd: volume24hUsd,
          liquidityUsd: liquidityUsd,
          changeUsd: changeUsd,
          sources: [wallet],
        });
      }
      total += value;
      if (chain === 'solana') {
        const eligible = holding._changeEligible !== false;
        if (DEBUG_SOL_CHANGE) {
          try {
            solDebugContrib.push({
              wallet,
              address: holding.address,
              symbol: holding.symbol,
              valueUsd: value,
              pct24h: Number(holding.changePct || 0) || 0,
              changeUsd,
              eligible,
            });
          } catch {}
        }
        if (eligible) {
          solWalletNow += value;
          solWalletHasChange = true;
          solWalletChange += changeUsd;
        }
      }
      if (chain === 'evm') {
        totalChangeEvmUsd += changeUsd;
        totalForChange += value;
        total24hAgo += Math.max(0, value - changeUsd);
      }
    });

    if (chain === 'solana') {
      if (solWalletNow > 0 && solWalletHasChange) {
        totalChangeSolUsd += solWalletChange;
        totalForChange += solWalletNow;
        total24hAgo += Math.max(0, solWalletNow - solWalletChange);
      }
    }
  });

  state.holdings = Array.from(holdingsMap.values());
  holdingsDataVersion++;
  invalidateHoldingsTableCache();
  state.wallets = wallets;
  state.totalValue = total;
  state.totalSolValue = totalSolValue;
  state.totalEvmValue = totalEvmValue;
  state.totalChangeSolUsd = totalChangeSolUsd;
  state.totalChangeEvmUsd = totalChangeEvmUsd;
  state.totalValueForChange = totalForChange;
  state.totalValue24hAgo = total24hAgo;

  if (DEBUG_SOL_CHANGE) {
    try {
      const absSorted = solDebugContrib
        .slice()
        .sort((a, b) => Math.abs(b.changeUsd || 0) - Math.abs(a.changeUsd || 0));
      const summary = {
        count: solDebugContrib.length,
        eligibleCount: solDebugContrib.filter(x => x.eligible).length,
        ineligibleCount: solDebugContrib.filter(x => !x.eligible).length,
        topByAbsDelta: absSorted.slice(0, 10),
      };
      window.__peekSol24hContrib = summary;
      console.log('[SOL 24h] contrib summary json', JSON.stringify(summary));
    } catch {}
  }

  setHoldingsPage(1);

  updateSummary();
  renderAllocationAndRisk();
  renderHoldingsByWallet();
  renderHoldingsTable();

  try { savePortfolioSnapshot(); } catch {}

  enrichHoldingsWithMcap(state.holdings, { signal: state.scanAbortController?.signal });
  
  // Note: enrichHoldingsWithOverviewMeta is now called explicitly in scanWallets after recompute
  // to ensure it completes before scan finishes
}

let portfolioRefreshInFlight = false;
async function refreshPortfolioMetrics({ force } = {}) {
  if (portfolioRefreshInFlight) return;
  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  if (!holdings.length) return;

  portfolioRefreshInFlight = true;
  try {
    const next = holdings.map((h) => ({ ...h }));
    const queue = next
      .map((h, idx) => ({ h, idx }))
      .filter(({ h }) => {
        if (!h) return false;
        const chain = String(h.chain || '');
        const addr = String(h.address || '').trim();
        if (!chain || !addr) return false;
        if (chain === 'evm' && !isValidEvmContractAddress(addr)) return false;
        return true;
      });

    let cursor = 0;
    const concurrency = window.matchMedia('(max-width: 640px)').matches ? 2 : 4;

    const worker = async () => {
      while (cursor < queue.length) {
        const job = queue[cursor++];
        if (!job) return;
        try {
          const h = job.h;
          const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          const model = await runTokenSearch(h.address, controller ? { signal: controller.signal, chain: h.chain, network: h.network } : { chain: h.chain, network: h.network });
          const priceUsd = Number(model?.priceUsd);
          const mcapUsd = Number(model?.marketCapUsd);
          const pct24h = Number(model?.change24hPct);

          if (Number.isFinite(priceUsd) && priceUsd > 0) {
            h.price = priceUsd;
          }
          if (Number.isFinite(mcapUsd) && mcapUsd > 0) {
            h.mcap = mcapUsd;
          }
          if (Number.isFinite(h.price) && Number.isFinite(h.balance)) {
            const value = (Number(h.balance) || 0) * (Number(h.price) || 0);
            if (Number.isFinite(value)) h.value = value;
          }
          if (Number.isFinite(pct24h)) {
            const delta = holdingDeltaUsdFromPct({ valueUsd: Number(h.value || 0) || 0, pct: pct24h });
            h.changeUsd = delta;
          }
        } catch {}
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker());
    await Promise.allSettled(workers);

    state.holdings = next;

    try {
      let totalValue = 0;
      let totalSolValue = 0;
      let totalEvmValue = 0;
      let totalValue24hAgo = 0;
      for (const h of next) {
        const v = Number(h?.value || 0) || 0;
        const delta = Number(h?.changeUsd || 0) || 0;
        totalValue += v;
        totalValue24hAgo += Math.max(0, v - delta);
        if (h?.chain === 'solana') totalSolValue += v;
        else if (h?.chain === 'evm') totalEvmValue += v;
      }
      state.totalValue = totalValue;
      state.totalSolValue = totalSolValue;
      state.totalEvmValue = totalEvmValue;
      state.totalValue24hAgo = totalValue24hAgo;
    } catch {}

    try {
      updateSummary();
      renderAllocationAndRisk();
    } catch {}

    try {
      syncPortfolioHoldingsInPlace();
    } catch {}

    try {
      enrichHoldingsWithOverviewMeta(state.holdings, { signal: state.scanAbortController?.signal });
    } catch {}

    try { savePortfolioSnapshot(); } catch {}
  } finally {
    portfolioRefreshInFlight = false;
  }
}

async function scanWallets({ queueOverride } = {}) {
  if (state.scanning) return;

  if (!DISABLE_SCAN_COOLDOWN) {
    const last = getLastScanAt();
    const remaining = SCAN_COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      updateScanCooldownUi();
      showStatus(`Try again in ${formatCooldownMs(remaining)}.`, 'info');
      hapticFeedback('light');
      return;
    }
  }

  const walletsQueue = Array.isArray(queueOverride) && queueOverride.length
    ? queueOverride.map((q, i) => ({ wallet: q.wallet, chain: q.chain, index: Number.isFinite(q.index) ? q.index : i }))
    : buildWalletQueue();

  if (walletsQueue.length === 0) {
    clearScanProgress();
    updateProgress(0);
    $('cancelScanButton')?.classList.add('hidden');
    $('retryFailedButton')?.classList.add('hidden');
    setScanningUi(false);
    showStatus('Please enter at least one valid wallet address', 'error');
    hapticFeedback('error');
    return;
  }

  document.body.classList.remove('ui-landing');
  document.body.classList.add('ui-results');
  $('inputSection')?.classList.add('is-minimized');
  setPortfolioMinimizedPreference(true);
  document.body.classList.add('ui-reveal');
  window.setTimeout(() => document.body.classList.remove('ui-reveal'), 520);

  $('resultsSection')?.classList.remove('hidden');

  if (!DISABLE_SCAN_COOLDOWN) {
    setLastScanAt(Date.now());
    updateScanCooldownUi();
  }

  state.scanning = true;
  setScanningUi(true);
  state.walletHoldings = new Map();
  state.walletDayChange = new Map();
  state.lastScanFailedQueue = [];
  state.scanMeta = { completed: 0, total: walletsQueue.length };
  state.scanAbortController = new AbortController();

  const scanButton = $('scanButton');
  if (scanButton) {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="btn-icon"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span><span>Scanning...</span>';
  }

  clearScanProgress();
  $('cancelScanButton')?.classList.remove('hidden');
  $('retryFailedButton')?.classList.add('hidden');
  showStatus('', 'info');
  updateProgress(0);

  const totalWallets = walletsQueue.length;
  const signal = state.scanAbortController.signal;

  let completed = 0;
  const total = Math.max(totalWallets, 1);
  const concurrency = window.matchMedia('(max-width: 640px)').matches ? 2 : 4;
  let cursor = 0;

  const markComplete = () => {
    completed++;
    state.scanMeta = { completed, total: totalWallets };
    updateProgress((completed / total) * 100);
  };

  const worker = async () => {
    while (cursor < walletsQueue.length && !signal.aborted) {
      const current = walletsQueue[cursor++];
      const { wallet, chain, index } = current;
      const walletKey = `${chain}:${wallet}`;

      upsertScanProgressItem(wallet, chain, index, totalWallets, 'fetching portfolio…');

      try {
        const cached = getScanCache(chain, wallet);
        if (cached) {
          let cachedHoldings = cached.holdings || [];
          if (chain === 'solana') {
            try {
              cachedHoldings = await enrichSolHoldingsWith24hChange(cachedHoldings, { signal });
            } catch {}
          }
          state.walletHoldings.set(walletKey, cachedHoldings);
          if (chain === 'solana' && cached.dayChange) {
            state.walletDayChange.set(walletKey, cached.dayChange);
          }
          upsertScanProgressItem(wallet, chain, index, totalWallets, 'cached', 'done');
          markComplete();
          scheduleRecomputeAggregatesAndRender();
          continue;
        }

        let holdings = await fetchWalletHoldings(wallet, chain, { signal });

        if (chain === 'solana') {
          try {
            holdings = await enrichSolHoldingsWith24hChange(holdings, { signal });
          } catch (err) {
            if (DEBUG_SOL_CHANGE) {
              try {
                const info = { reason: 'enrich_throw', message: err?.message || String(err) };
                window.__peekSol24hDebug = info;
                console.warn('[SOL 24h] enrich threw', info);
              } catch {}
            }
          }
        }
        state.walletHoldings.set(walletKey, holdings);

        let dayChange = null;
        if (chain === 'solana') {
          try {
            dayChange = await fetchSolanaNetWorthChange(wallet, { signal });
            state.walletDayChange.set(walletKey, dayChange);
          } catch {}
        }

        setScanCache(chain, wallet, { holdings, dayChange });
        upsertScanProgressItem(wallet, chain, index, totalWallets, 'done', 'done');
        markComplete();
        scheduleRecomputeAggregatesAndRender();
      } catch (error) {
        if (!signal.aborted) {
          state.lastScanFailedQueue.push({ wallet, chain, index });
          const msg = error?.message ? String(error.message) : 'Unknown error';
          const inlineMsg = msg.length > 70 ? `${msg.slice(0, 70)}…` : msg;
          upsertScanProgressItem(wallet, chain, index, totalWallets, `failed: ${inlineMsg}`, 'error');
          showStatus(`Failed to scan ${chain} wallet ${shortenAddress(wallet)}: ${msg}`, 'error');
          try { console.error('Scan wallet failed', { wallet, chain, error }); } catch {}
          markComplete();
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, walletsQueue.length) }, () => worker());
  await Promise.allSettled(workers);

  state.scanning = false;
  setScanningUi(false);
  state.scanAbortController = null;

  updateScanCooldownUi();

  // Recompute aggregates first to populate state.holdings
  console.log('[SCAN] Recomputing aggregates, state.holdings length:', state.holdings?.length);
  await recomputeAggregatesAndRender();
  console.log('[SCAN] After recompute, state.holdings length:', state.holdings?.length);
  
  // Now enrich with overview metadata (marketcap, volume, liquidity) before final render
  console.log('[SCAN] Starting enrichHoldingsWithOverviewMeta');
  try {
    await enrichHoldingsWithOverviewMeta(state.holdings, { signal });
    console.log('[SCAN] Enrichment complete');
  } catch (e) {
    console.error('[SCAN] Failed to enrich holdings with overview metadata:', e);
  }
  
  forceCollapseResultsSections();

  try {
    requestAnimationFrame(() => {
      try { scheduleRenderHoldingsTable(); } catch {}
    });
  } catch {
    try { scheduleRenderHoldingsTable(); } catch {}
  }

  updateScanCooldownUi();

  $('cancelScanButton')?.classList.add('hidden');
  $('retryFailedButton')?.classList.add('hidden');
  updateProgress(100);

  if (signal.aborted) {
    showStatus('', 'info');
  } else {
    hapticFeedback('success');
  }

  setTimeout(() => {
    $('scanStatus')?.classList.add('hidden');
  }, 3000);
}

function setupEyeTracking() {
  const pupils = [
    $('pupil1'),
    $('pupil2'),
  ].filter(Boolean);
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

  const FRAME_INTERVAL_MS = 1000 / 30;
  let lastFrameAt = 0;
  let paused = document.hidden;

  const setPaused = (p) => {
    paused = !!p;
  };

  document.addEventListener('visibilitychange', () => {
    setPaused(document.hidden);
  });

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

    if (paused) {
      requestAnimationFrame(animateEyes);
      return;
    }

    if (now - lastFrameAt < FRAME_INTERVAL_MS) {
      requestAnimationFrame(animateEyes);
      return;
    }
    lastFrameAt = now;

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
      const maxMove = shouldRunIntro ? 16 : 13;
      const moveFactor = shouldRunIntro ? 1 : Math.min(distance / 70, 1);
      const moveDistance = maxMove * moveFactor;
      const jitter = shouldRunIntro ? 0 : (isTyping ? 0.1 : 0.3);
      const jitterX = (Math.random() - 0.5) * jitter;
      const jitterY = (Math.random() - 0.5) * jitter;
      const angle = Math.atan2(dy, dx);
      const moveXRaw = Math.cos(angle) * moveDistance + jitterX;
      const moveYRaw = Math.sin(angle) * moveDistance + jitterY;

      const maxX = shouldRunIntro ? 16 : 11;
      const maxUp = shouldRunIntro ? 16 : 7;
      const maxDown = shouldRunIntro ? 16 : 24;

      const moveX = Math.max(-maxX, Math.min(maxX, moveXRaw));
      const moveY = moveYRaw < 0
        ? Math.max(-maxUp, moveYRaw)
        : Math.min(maxDown, moveYRaw);

      pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
    });

    requestAnimationFrame(animateEyes);
  }

  animateEyes();
}

function lockInputBodyHeight() {
  if (lockInputBodyHeight._raf) return;
  const now = Date.now();
  const lastAt = Number(lockInputBodyHeight._lastAt || 0) || 0;
  if (now - lastAt < 250) return;
  lockInputBodyHeight._lastAt = now;
  lockInputBodyHeight._raf = requestAnimationFrame(() => {
    lockInputBodyHeight._raf = null;
    const body = $('inputBody');
    if (!body) return;

    const portfolioPanel = $('portfolioPanel');
    const watchlistPanel = $('watchlistPanel');
    const searchPanel = $('searchPanel');
    const panels = [portfolioPanel, watchlistPanel, searchPanel].filter(Boolean);

    const activePanel = panels.find((p) => !p.classList.contains('hidden')) || panels[0];
    if (!activePanel) return;

    const h = activePanel.scrollHeight || 0;
    if (h > 0) body.style.minHeight = `${h}px`;
  });
}

function setSearchHint(message, type = 'info') {
  const hint = $('searchHint');
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
}

function renderSearchTokenLoading() {
  const root = $('searchResults');
  if (!root) return;
  root.innerHTML = `
    <div class="search-token-card">
      <div class="holding-card">
        <div class="holding-card-header">
          <div class="token-cell">
            <img class="token-icon" src="${tokenIconDataUri('...')}" alt="" />
            <div class="token-info">
              <div class="token-symbol">Loading…</div>
              <div class="token-name">Fetching token metrics</div>
            </div>
          </div>
        </div>

        <div class="holding-card-metrics">
          <div class="holding-metric"><div class="holding-metric-label">Market Cap</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Price</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">24h Change</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Liquidity</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">24h Volume</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Holders</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Circulating Supply</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Trades (24h)</div><div class="holding-metric-value mono"><strong>—</strong></div></div>
        </div>
      </div>
    </div>
  `;
}

function renderSearchTokenError(message) {
  const root = $('searchResults');
  if (!root) return;
  root.innerHTML = `
    <div class="search-token-card">
      <div class="holding-card">
        <div class="holding-card-header">
          <div class="token-cell">
            <img class="token-icon" src="${tokenIconDataUri('!')}" alt="" />
            <div class="token-info">
              <div class="token-symbol">Could not load token</div>
              <div class="token-name">${escapeHtml(String(message || 'Unknown error'))}</div>
            </div>
          </div>
        </div>
      </div>
  `;
}

function renderSearchTokenCard(model) {
  const root = $('searchResults');
  if (!root) return;

  const name = model?.name || model?.symbol || 'Token';
  const symbol = model?.symbol ? String(model.symbol) : '';

  const mcap = model?.marketCapUsd != null ? `$${formatCompactNumber(model.marketCapUsd)}` : '—';
  const price = model?.priceUsd != null ? formatPrice(model.priceUsd) : '—';
  const liq = model?.liquidityUsd != null ? `$${formatCompactNumber(model.liquidityUsd)}` : '—';
  const vol = model?.volume24hUsd != null ? `$${formatCompactNumber(model.volume24hUsd)}` : '—';
  const holders = model?.holders != null ? formatCompactNumber(model.holders) : '—';
  const circ = model?.circulatingSupply != null ? formatCompactNumber(model.circulatingSupply) : '—';
  const trades = model?.trades24h != null ? formatCompactNumber(model.trades24h) : '—';

  const changePct = Number(model?.change24hPct);
  const changeText = Number.isFinite(changePct) ? formatPct(changePct, 2) : '—';
  const changeClass = Number.isFinite(changePct)
    ? (changePct > 0 ? 'pnl-positive' : changePct < 0 ? 'pnl-negative' : '')
    : '';

  const ext = normalizeExtensions(model?.extensions);
  const subtitle = ext?.description || '';
  const icon = resolveTokenIcon(model?.logoUrl, model?.symbol || model?.name, { preferFast: false });
  const chainBadge = String(model?.chainShort || '').trim();
  const ipfsAttrs = icon.cid
    ? `data-ipfs-cid="${escapeAttribute(icon.cid)}" data-gateway-idx="0"`
    : '';
  const actionsHtml = renderSearchTokenActions(model);
  const titleSymbol = symbol || tokenIconLabel(name);
  const titleName = name || '';

  root.innerHTML = `
    <div class="search-token-card">
      <div class="holding-card">
        <div class="holding-card-header">
          <div class="token-cell">
            <img class="token-icon" src="${escapeAttribute(icon.src)}" ${ipfsAttrs} onerror="handleSearchTokenIconError(this,'${escapeAttribute(icon.fallback)}')" alt="" />
            <div class="token-info">
              <div class="token-symbol">${escapeHtml(titleSymbol)}</div>
              <div class="token-name">${escapeHtml(titleName)}</div>
            </div>
          </div>

          <div class="holding-card-header-right">
            ${actionsHtml}
          </div>
        </div>

        <div class="holding-card-metrics">
          <div class="holding-metric"><div class="holding-metric-label">Market Cap</div><div class="holding-metric-value mono"><strong>${escapeHtml(mcap)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Price</div><div class="holding-metric-value mono"><strong>${escapeHtml(price)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">24h Change</div><div class="holding-metric-value mono"><strong class="${changeClass}">${escapeHtml(changeText)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Liquidity</div><div class="holding-metric-value mono"><strong>${escapeHtml(liq)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">24h Volume</div><div class="holding-metric-value mono"><strong>${escapeHtml(vol)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Holders</div><div class="holding-metric-value mono"><strong>${escapeHtml(holders)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Circulating Supply</div><div class="holding-metric-value mono"><strong>${escapeHtml(circ)}</strong></div></div>
          <div class="holding-metric"><div class="holding-metric-label">Trades (24h)</div><div class="holding-metric-value mono"><strong>${escapeHtml(trades)}</strong></div></div>
        </div>
      </div>
    </div>
  `;

  try { syncWatchlistStars(); } catch {}

}

function setPortfolioMinimizedPreference(isMinimized) {
  document.body.dataset.portfolioMinimized = isMinimized ? '1' : '0';
}

function getPortfolioMinimizedPreference() {
  return document.body.dataset.portfolioMinimized === '1';
}

function setMode(mode) {
  const m = mode === 'watchlist' ? 'watchlist' : mode === 'search' ? 'search' : 'portfolio';

  const scrollY = window.scrollY;

  const watchlistPanel = $('watchlistPanel');
  const portfolioPanel = $('portfolioPanel');
  const searchPanel = $('searchPanel');
  const results = $('resultsSection');
  const inputSection = $('inputSection');

  const wBtn = $('watchlistModeBtn');
  const pBtn = $('portfolioModeBtn');
  const sBtn = $('searchModeBtn');

  if (watchlistPanel) watchlistPanel.classList.toggle('hidden', m !== 'watchlist');
  if (portfolioPanel) portfolioPanel.classList.toggle('hidden', m !== 'portfolio');
  if (searchPanel) searchPanel.classList.toggle('hidden', m !== 'search');

  if (inputSection) {
    if (m !== 'portfolio') {
      inputSection.classList.remove('is-minimized');
    } else if (document.body.classList.contains('ui-results')) {
      inputSection.classList.toggle('is-minimized', getPortfolioMinimizedPreference());
    }
  }

  const shouldShowResults = m === 'portfolio' && document.body.classList.contains('ui-results');
  if (results) results.classList.toggle('hidden', !shouldShowResults);

  requestAnimationFrame(() => {
    lockInputBodyHeight();
    try { window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' }); }
    catch { try { window.scrollTo(0, scrollY); } catch {} }
  });

  if (wBtn) {
    wBtn.classList.toggle('is-active', m === 'watchlist');
    wBtn.setAttribute('aria-selected', m === 'watchlist' ? 'true' : 'false');
  }
  if (pBtn) {
    pBtn.classList.toggle('is-active', m === 'portfolio');
    pBtn.setAttribute('aria-selected', m === 'portfolio' ? 'true' : 'false');
  }
  if (sBtn) {
    sBtn.classList.toggle('is-active', m === 'search');
    sBtn.setAttribute('aria-selected', m === 'search' ? 'true' : 'false');
  }

}

function setupEventListeners() {
  const addressInput = $('addressInput');
  const addressClearBtn = $('addressClearBtn');
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
      if (addressClearBtn) {
        addressClearBtn.classList.toggle('hidden', !String(addressInput.value || '').length);
      }
    });
    addressInput.addEventListener('paste', () => {
      setTimeout(() => {
        $('inputWarning')?.classList.add('hidden');
        if (addressClearBtn) {
          addressClearBtn.classList.toggle('hidden', !String(addressInput.value || '').length);
        }
      }, 10);
    });

    if (addressClearBtn) {
      addressClearBtn.addEventListener('click', () => {
        addressInput.value = '';
        addressClearBtn.classList.add('hidden');
        $('inputHint')?.classList.add('hidden');
        $('inputWarning')?.classList.add('hidden');
        addressInput.focus();
        hapticFeedback('light');
      });
    }
  }

  $('addWalletBtn')?.addEventListener('click', () => {
    addWalletFromInput();
  });

  const searchAddressInput = $('searchAddressInput');
  const searchClearBtn = $('searchClearBtn');
  if (searchAddressInput) {
    searchAddressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('searchFindBtn')?.click();
      }
    });
    searchAddressInput.addEventListener('input', () => {
      const hint = $('searchHint');
      hint?.classList.add('hidden');
      hint?.classList.remove('error');
      const wrap = searchAddressInput.closest('.address-entry');
      wrap?.classList.remove('shake');
      if (searchClearBtn) {
        searchClearBtn.classList.toggle('hidden', !String(searchAddressInput.value || '').length);
      }
    });

    searchAddressInput.addEventListener('paste', () => {
      setTimeout(() => {
        if (searchClearBtn) {
          searchClearBtn.classList.toggle('hidden', !String(searchAddressInput.value || '').length);
        }
      }, 10);
    });

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchAddressInput.value = '';
        searchClearBtn.classList.add('hidden');
        setSearchHint('', 'info');
        $('searchResults') && ($('searchResults').innerHTML = '');
        searchAddressInput.focus();
        hapticFeedback('light');
      });
    }
  }
  $('searchFindBtn')?.addEventListener('click', () => {
    const hint = $('searchHint');
    const raw = String($('searchAddressInput')?.value || '').trim();
    if (!hint) return;
    if (!raw) {
      hint.textContent = 'Paste a token address first.';
      hint.classList.remove('hidden');
      hint.classList.add('error');
      $('searchAddressInput')?.closest('.address-entry')?.classList.add('shake');
      hapticFeedback('error');
      return;
    }
    setSearchHint('', 'info');
    renderSearchTokenLoading();

    const controller = new AbortController();
    runTokenSearch(raw, { signal: controller.signal })
      .then((model) => {
        setSearchHint('', 'info');
        renderSearchTokenCard(model);
        try { lockInputBodyHeight(); } catch {}
        hapticFeedback('light');
      })
      .catch((err) => {
        const msg = err?.message || String(err || 'Unknown error');
        setSearchHint(msg, 'error');
        renderSearchTokenError(msg);
        try { lockInputBodyHeight(); } catch {}
        hapticFeedback('error');
      });
  });

  $('watchlistModeBtn')?.addEventListener('click', () => {
    setMode('watchlist');
    hapticFeedback('light');
  });

  $('searchModeBtn')?.addEventListener('click', () => {
    setMode('search');
    hapticFeedback('light');
  });

  const watchlistRefreshBtn = $('watchlistRefreshBtn');
  if (watchlistRefreshBtn) {
    let watchlistRefreshCooldownTimer = null;
    let watchlistRefreshCooldownTick = null;
    watchlistRefreshBtn.addEventListener('click', async () => {
      if (watchlistRefreshCooldownTimer || watchlistRefreshCooldownTick) return;

      const labelEl = watchlistRefreshBtn.querySelector('span:not(.btn-icon)') || watchlistRefreshBtn.querySelector('span:last-child');
      const baseLabel = labelEl ? String(labelEl.textContent || '').trim() : '';
      try {
        watchlistRefreshBtn.disabled = true;
        try {
          watchlistRefreshBtn.classList.add('is-cooldown');
          watchlistRefreshBtn.style.setProperty('--cooldown-pct', '0');
          watchlistRefreshBtn.setAttribute('aria-busy', 'true');
          if (labelEl) labelEl.textContent = baseLabel || 'Refresh';
        } catch {}
        await refreshWatchlistMetrics({ force: true });
        hapticFeedback('light');
        
        try {
          watchlistRefreshBtn.removeAttribute('aria-busy');
          // Remove is-cooldown class to stop spinner after refresh completes
          watchlistRefreshBtn.classList.remove('is-cooldown');
        } catch {}

        const endsAt = Date.now() + 60_000;
        const tick = () => {
          const remaining = endsAt - Date.now();
          if (remaining > 0) {
            const pct = Math.max(0, Math.min(1, 1 - (remaining / 60_000)));
            try { watchlistRefreshBtn.style.setProperty('--cooldown-pct', String(pct)); } catch {}
            try {
              if (labelEl) labelEl.textContent = `${baseLabel || 'Refresh'} (${formatCooldownMs(remaining)})`;
            } catch {}
            return;
          }
          try {
            if (watchlistRefreshCooldownTick) window.clearInterval(watchlistRefreshCooldownTick);
          } catch {}
          watchlistRefreshCooldownTick = null;
          try {
            watchlistRefreshBtn.disabled = false;
            watchlistRefreshBtn.classList.remove('is-cooldown');
            watchlistRefreshBtn.style.removeProperty('--cooldown-pct');
            watchlistRefreshBtn.removeAttribute('aria-busy');
            if (labelEl) labelEl.textContent = baseLabel || 'Refresh';
          } catch {}
        };

        tick();
        watchlistRefreshCooldownTick = window.setInterval(tick, 1000);
        watchlistRefreshCooldownTimer = window.setTimeout(() => {
          watchlistRefreshCooldownTimer = null;
        }, 60_000);
      } catch {
        try { hapticFeedback('error'); } catch {}
        try {
          watchlistRefreshBtn.classList.remove('is-cooldown');
          watchlistRefreshBtn.style.removeProperty('--cooldown-pct');
          watchlistRefreshBtn.removeAttribute('aria-busy');
          if (labelEl) labelEl.textContent = baseLabel || 'Refresh';
        } catch {}
        try {
          if (watchlistRefreshCooldownTick) window.clearInterval(watchlistRefreshCooldownTick);
        } catch {}
        watchlistRefreshCooldownTick = null;
        watchlistRefreshCooldownTimer = null;
        watchlistRefreshBtn.disabled = false;
      }
    });
  }

  const portfolioRefreshBtn = $('portfolioRefreshBtn');
  if (portfolioRefreshBtn) {
    let portfolioRefreshCooldownTimer = null;
    let portfolioRefreshCooldownTick = null;
    portfolioRefreshBtn.addEventListener('click', async () => {
      try {
        portfolioRefreshBtn.disabled = true;
        
        // Clear cache for all wallets before refresh to force fresh data
        const wallets = Array.isArray(state.wallets) ? state.wallets : [];
        wallets.forEach(w => {
          if (w?.address && w?.chain) {
            clearScanCache(w.chain, w.address);
          }
        });
        
        const queueOverride = wallets
          .map((w, index) => ({ wallet: String(w?.address || ''), chain: String(w?.chain || ''), index }))
          .filter(w => w.wallet && (w.chain === 'solana' || w.chain === 'evm'));
        await scanWallets({ queueOverride });
        hapticFeedback('light');
        
        portfolioRefreshBtn.disabled = false;
      } catch {
        try { hapticFeedback('error'); } catch {}
        try {
          portfolioRefreshBtn.classList.remove('is-cooldown');
          portfolioRefreshBtn.style.removeProperty('--cooldown-pct');
          portfolioRefreshBtn.removeAttribute('aria-busy');
        } catch {}
        try {
          if (portfolioRefreshCooldownTick) window.clearInterval(portfolioRefreshCooldownTick);
        } catch {}
        portfolioRefreshCooldownTick = null;
        portfolioRefreshCooldownTimer = null;
        portfolioRefreshBtn.disabled = false;
      }
    });
  }

  const watchlistSortSelect = $('watchlistSortSelect');
  if (watchlistSortSelect) {
    try {
      watchlistSortSelect.value = getWatchlistSortPreference();
    } catch {}
    watchlistSortSelect.addEventListener('change', () => {
      setWatchlistSortPreference(String(watchlistSortSelect.value || 'change24h'));
      renderWatchlist();
      hapticFeedback('light');
    });
  }

  $('portfolioModeBtn')?.addEventListener('click', () => {
    setMode('portfolio');
    hapticFeedback('light');
  });
  $('exportButton')?.addEventListener('click', () => {
    exportHoldingsToCsv();
    hapticFeedback('light');
  });

  const bindChartPopoverDelegation = (containerEl) => {
    if (!containerEl) return;
    containerEl.addEventListener('click', (e) => {
      const chart = e.target.closest('a.holding-action[data-action="chart"]');
      if (!chart) return;
      e.preventDefault();
      e.stopPropagation();

      const actions = chart.closest('.holding-card-actions');
      if (!actions) return;
      const popover = actions.querySelector('.chart-popover');
      if (!popover) return;

      const isOpening = popover.classList.contains('hidden');
      closeAllChartPopovers(popover);
      if (!isOpening) {
        popover.classList.add('hidden');
        return;
      }

      const chain = chart.dataset.chain || '';
      const network = chart.dataset.network || '';
      const address = chart.dataset.address || '';

      const linkDex = popover.querySelector('a.chart-popover-link[data-provider="dexscreener"]');
      const linkDexTools = popover.querySelector('a.chart-popover-link[data-provider="dextools"]');
      const linkBirdeye = popover.querySelector('a.chart-popover-link[data-provider="birdeye"]');
      if (linkDex) linkDex.href = buildDexscreenerTokenUrl({ chain, network, address });
      if (linkDexTools) linkDexTools.href = buildDextoolsTokenUrl({ chain, network, address });
      if (linkBirdeye) linkBirdeye.href = buildBirdeyeTokenUrl({ chain, network, address });

      popover.classList.remove('hidden');
    });
  };

  bindChartPopoverDelegation($('tableBody'));
  bindChartPopoverDelegation($('searchResults'));
  bindChartPopoverDelegation($('watchlistBody'));

  document.addEventListener('click', (e) => {
    const whatIfBtn = e.target.closest('button[data-action="whatif-mult"]');
    if (whatIfBtn) {
      e.preventDefault();
      try { e.stopPropagation(); } catch {}
      const key = String(whatIfBtn.dataset.holdingKey || '').trim();
      const mult = Number(whatIfBtn.dataset.mult || 1) || 1;
      if (!key) return;
      try { whatIfHolding.set(key, mult); } catch {}
      try {
        const card = whatIfBtn.closest('.holding-card');
        if (card) applyHoldingWhatIfToCard(card, mult);
        const chipsWrap = whatIfBtn.closest('.whatif-chips');
        if (chipsWrap) {
          chipsWrap.querySelectorAll('button.whatif-chip').forEach((b) => {
            b.classList.toggle('is-active', b === whatIfBtn);
          });
        }
      } catch {}
      try { scheduleHoldingWhatIfReset(key); } catch {}
      try { hapticFeedback('light'); } catch {}
      try { console.debug('[whatif] applied', { key, mult }); } catch {}
      return;
    }

    const hideToggle = e.target.closest('[data-action="holding-hide-toggle"]');
    if (hideToggle) {
      e.preventDefault();
      const key = String(hideToggle.dataset.holdingKey || '').trim();
      if (!key) return;
      const wasHidden = isHoldingHidden(key);
      setHoldingHidden(key, !wasHidden);
      try {
        showInlineStarToast(hideToggle, wasHidden ? 'Unhidden' : 'Hidden');
      } catch {}
      try { hapticFeedback('light'); } catch {}
      return;
    }

    const copyBtn = e.target.closest('a.holding-action[data-action="copy-contract"]');
    if (copyBtn) {
      e.preventDefault();
      const addr = String(copyBtn.dataset.address || '').trim();
      copyTextToClipboard(addr);
      try { flashCopySuccess(copyBtn, { ms: 5000 }); } catch {}
      try { hapticFeedback('light'); } catch {}
      return;
    }

    const wlAdd = e.target.closest('a.holding-action[data-action="watchlist-add"]');
    if (wlAdd) {
      e.preventDefault();
      (async () => {
        try {
          const addr = String(wlAdd.dataset.address || '').trim();
          if (!addr) return;

          const chain = String(wlAdd.dataset.chain || '');
          const network = String(wlAdd.dataset.network || '');
          const matchKey = getWatchlistMatchKey({ chain, network, address: addr });
          if (matchKey) {
            removeTokenFromWatchlistByKey(matchKey);
            try { hapticFeedback('light'); } catch {}
            return;
          }

          const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          const model = await runTokenSearch(addr, controller ? { signal: controller.signal } : undefined);
          const resolvedChain = String(chain || model?.chain || '');
          const resolvedNetwork = String(network || model?.network || '');

          try {
            if (resolvedChain) wlAdd.dataset.chain = resolvedChain;
            if (resolvedNetwork) wlAdd.dataset.network = resolvedNetwork;
          } catch {}

          const resolvedMatchKey = getWatchlistMatchKey({ chain: resolvedChain, network: resolvedNetwork, address: addr });
          if (resolvedMatchKey) {
            try { syncWatchlistStars(); } catch {}
            try { hapticFeedback('light'); } catch {}
            return;
          }

          const added = addTokenToWatchlist({
            ...model,
            chain: resolvedChain,
            network: resolvedNetwork,
            address: addr,
            symbol: model?.symbol || wlAdd.dataset.symbol,
            name: model?.name || wlAdd.dataset.name,
            logoUrl: model?.logoUrl || wlAdd.dataset.logoUrl,
            updatedAt: Date.now(),
          });
          if (added) try { hapticFeedback('success'); } catch {}
        } catch {
          const chain = String(wlAdd.dataset.chain || '');
          const network = String(wlAdd.dataset.network || '');
          const addr = String(wlAdd.dataset.address || '').trim();
          const key = normalizeWatchlistTokenKey({ chain, network, address: addr });
          if (addr && isTokenInWatchlist({ chain, network, address: addr })) {
            removeTokenFromWatchlistByKey(key);
            try { hapticFeedback('light'); } catch {}
            return;
          }

          const added = addTokenToWatchlist({
            chain,
            network,
            address: addr,
            symbol: wlAdd.dataset.symbol,
            name: wlAdd.dataset.name,
            logoUrl: wlAdd.dataset.logoUrl,
            updatedAt: Date.now(),
          });
          if (added) try { hapticFeedback('success'); } catch {}
        }
      })();
      return;
    }

    const wlRemove = e.target.closest('a.holding-action[data-action="watchlist-remove"]');
    if (wlRemove) {
      e.preventDefault();
      removeTokenFromWatchlistByKey(wlRemove.dataset.watchlistKey);
      return;
    }

    if (!e.target.closest('.holding-card-actions')) {
      closeAllChartPopovers();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllChartPopovers();
    }
  });

  $('scanButton')?.addEventListener('click', scanWallets);
  updateScanCooldownUi();

  $('amendWalletsBtn')?.addEventListener('click', () => {
    if (!document.body.classList.contains('ui-results')) return;
    const inputSection = $('inputSection');
    const resultsSection = $('resultsSection');
    inputSection?.classList.remove('is-minimized');
    if (inputSection) setPortfolioMinimizedPreference(false);
    if (resultsSection) resultsSection.classList.add('hidden');
    document.body.classList.remove('ui-results');
    document.body.classList.add('ui-landing');
  });

  let deferredInstallPrompt = null;
  const installBtn = $('installAppBtn');
  if (installBtn) installBtn.classList.add('hidden');

  const isIos = () => {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  };

  const isStandalone = () => {
    try {
      return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    } catch {}
    try {
      return !!window.navigator.standalone;
    } catch {}
    return false;
  };

  const updateInstallButtonVisibility = () => {
    if (!installBtn) return;

    if (isStandalone()) {
      installBtn.classList.add('hidden');
      return;
    }

    if (isIos()) {
      installBtn.classList.remove('hidden');
      return;
    }

    installBtn.classList.toggle('hidden', !deferredInstallPrompt);
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButtonVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtonVisibility();
  });

  const showIosInstallHint = () => {
    const el = $('iosInstallHint');
    if (!el) return;
    el.classList.remove('hidden');
    window.setTimeout(() => el.classList.add('hidden'), 6000);
  };

  $('installAppBtn')?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
      } catch {}
      deferredInstallPrompt = null;
      updateInstallButtonVisibility();
      return;
    }
    if (isIos()) {
      showIosInstallHint();
      return;
    }
    showStatus('Install is available on supported browsers (Android Chrome).', 'info');
  });

  updateInstallButtonVisibility();

  const settingsBtn = $('settingsBtn');
  const settingsMenu = $('settingsMenu');
  const resetAppBtn = $('resetAppBtn');

  const setSettingsOpen = (open) => {
    if (!settingsBtn || !settingsMenu) return;
    settingsMenu.classList.toggle('hidden', !open);
    settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const isSettingsOpen = () => {
    if (!settingsMenu) return false;
    return !settingsMenu.classList.contains('hidden');
  };

  const resetAppData = async () => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }

      for (const k of keys) {
        if (
          k.startsWith('peeek:') ||
          k.startsWith('looky:') ||
          k.startsWith('looky_')
        ) {
          try { localStorage.removeItem(k); } catch {}
        }
      }

      try { localStorage.removeItem('looky_watchlist_tokens_v1'); } catch {}
      try { localStorage.removeItem('looky_watchlist_sort_v1'); } catch {}

      try {
        const legacyPrefixA = ['l', 'o', 'o', 'k', 'y', ':'].join('');
        const legacyPrefixB = ['p', 'e', 'e', 'k', ':'].join('');
        for (const suffix of ['lastAddresses', 'profiles', 'activeProfile', 'uiSections', 'redactedMode', 'lastScanAt']) {
          try { localStorage.removeItem(legacyPrefixA + suffix); } catch {}
          try { localStorage.removeItem(legacyPrefixB + suffix); } catch {}
        }
      } catch {}
    } catch {}

    try { sessionStorage.clear(); } catch {}

    try {
      if (typeof caches !== 'undefined' && caches?.keys) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {}

    try {
      if (navigator?.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}

    try { location.reload(); } catch {}
  };

  settingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    setSettingsOpen(!isSettingsOpen());
    hapticFeedback('light');
  });

  resetAppBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    setSettingsOpen(false);
    const ok = confirm('Reset Peeek!? This will remove profiles, wallets, scans, and watchlist data.');
    if (!ok) return;
    hapticFeedback('error');
    await resetAppData();
  });

  document.addEventListener('click', (e) => {
    if (!isSettingsOpen()) return;
    const hit = e.target?.closest?.('#settingsMenu') || e.target?.closest?.('#settingsBtn');
    if (hit) return;
    setSettingsOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!isSettingsOpen()) return;
    setSettingsOpen(false);
  });

  const STORAGE_KEY_THEME = 'peeek:theme';

  const applyTheme = (theme, skipTransition = false) => {
    const t = theme === 'dark' ? 'dark' : 'light';
    
    // Add no-transition class to prevent jarring initial load
    if (skipTransition) {
      document.documentElement.classList.add('no-transition');
    }
    
    document.documentElement.dataset.theme = t;

    try {
      localStorage.setItem(STORAGE_KEY_THEME, t);
    } catch {}

    const btn = $('themeToggleBtn');
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-moon', t !== 'dark');
        icon.classList.toggle('fa-sun', t === 'dark');
      }
      btn.setAttribute('aria-label', t === 'dark' ? 'Disable dark mode' : 'Enable dark mode');
    }
    
    // Remove no-transition class after a frame
    if (skipTransition) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('no-transition');
        });
      });
    }
  };

  const getSystemTheme = () => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {}
    return 'light';
  };

  const loadTheme = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    // Fall back to system preference
    return getSystemTheme();
  };

  // Apply theme on load without transition
  applyTheme(loadTheme(), true);

  // Listen for system theme changes
  try {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
      try {
        const saved = localStorage.getItem(STORAGE_KEY_THEME);
        if (!saved) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      } catch {}
    });
  } catch {}

  $('themeToggleBtn')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    hapticFeedback('light');
  });

  try {
    localStorage.removeItem(['p','e','e','e','k',':','b','a','n','k','s','y','M','o','d','e'].join(''));
  } catch {}

  const applyRedactedMode = (enabled) => {
    document.body.classList.toggle('is-redacted', !!enabled);
    try {
      localStorage.setItem(STORAGE_KEY_REDACTED_MODE, enabled ? '1' : '0');
    } catch {}
    const btn = $('redactedToggleBtn');
    if (btn) {
      const nextLabel = enabled ? 'Show balances' : 'Hide balances';
      try { btn.setAttribute('aria-label', nextLabel); } catch {}
      try { btn.setAttribute('title', nextLabel); } catch {}
    }
  };

  const loadRedactedMode = () => {
    try {
      return localStorage.getItem(STORAGE_KEY_REDACTED_MODE) === '1';
    } catch {
      return false;
    }
  };

  applyRedactedMode(loadRedactedMode());

  $('redactedToggleBtn')?.addEventListener('click', () => {
    const next = !document.body.classList.contains('is-redacted');
    applyRedactedMode(next);
    hapticFeedback('light');
  });
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('is-redacted')) return;
    if (window.matchMedia('(hover: hover)').matches) return;
    const el = e.target?.closest?.('.redacted-field');
    if (!el) return;
    el.classList.add('is-revealed');
    window.setTimeout(() => el.classList.remove('is-revealed'), 1500);
  });

  $('cancelScanButton')?.addEventListener('click', () => {
    if (!state.scanning) return;
    state.scanAbortController?.abort();
    hapticFeedback('light');
  });

  $('retryFailedButton')?.classList.add('hidden');

  $('addressChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.address-chip');
    if (!chip) return;
    const idx = Number(chip.dataset.idx);
    if (!Number.isFinite(idx)) return;

    if (e.target?.dataset?.action === 'remove') {
      state.addressItems.splice(idx, 1);
      renderAddressChips();
      persistAddressItems();
      updateAddressStats();
      hapticFeedback('light');
      return;
    }
  });

  const profileSelect = $('profileSelect');
  const saveProfileBtn = $('saveProfileBtn');
  const deleteProfileBtn = $('deleteProfileBtn');
  const shareLinkBtn = $('shareLinkBtn');

  function refreshProfilesUi() {
    if (!profileSelect) return;
    const profiles = loadProfiles();
    const active = getActiveProfileName();
    const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));

    profileSelect.classList.toggle('hidden', names.length === 0);

    profileSelect.innerHTML = [
      '<option value="">Select profile</option>',
      ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    ].join('');

    if (active && names.includes(active)) profileSelect.value = active;
    else profileSelect.value = '';
  }

  profileSelect?.addEventListener('change', () => {
    const name = String(profileSelect.value || '');
    if (!name) {
      setActiveProfileName('');
      return;
    }

    try { clearPortfolioSnapshot(); } catch {}

    try {
      if (state.scanning) state.scanAbortController?.abort();
    } catch {}
    try {
      state.scanning = false;
      state.scanAbortController = null;
      state.walletHoldings = new Map();
      state.walletDayChange = new Map();
      state.lastScanFailedQueue = [];
      state.scanMeta = { completed: 0, total: 0 };
      state.holdings = [];
      state.totalValue = 0;
      state.totalSolValue = 0;
      state.totalEvmValue = 0;
      state.totalChangeSolUsd = 0;
      state.totalChangeEvmUsd = 0;
      state.totalValueForChange = 0;
      state.totalValue24hAgo = 0;
    } catch {}

    try {
      document.body.classList.remove('ui-results');
      document.body.classList.add('ui-landing');
      $('resultsSection')?.classList.add('hidden');
      $('inputSection')?.classList.remove('is-minimized');
      setPortfolioMinimizedPreference(false);
      setScanningUi(false);
      clearScanProgress();
      updateProgress(0);
      $('cancelScanButton')?.classList.add('hidden');
      $('retryFailedButton')?.classList.add('hidden');
      
    } catch {}

    const profiles = loadProfiles();
    const rawList = Array.isArray(profiles?.[name]?.addresses) ? profiles[name].addresses : [];
    const parsed = getAddressItemsFromText(rawList.join('\n'));
    setAddressItems(parsed.items, { showWarning: parsed.truncated });
    setActiveProfileName(name);

    try {
      state.hiddenHoldings = loadHiddenHoldingsSet();
      hiddenHoldingsVersion++;
      applyShowHiddenHoldings(loadShowHiddenHoldingsPreference());
      const sh = $('showHiddenHoldings');
      if (sh) sh.checked = !!state.showHiddenHoldings;
    } catch {}
    showStatus(`Loaded profile: ${name}`, 'success');
    hapticFeedback('light');

    try {
      updateSummary();
      renderAllocationAndRisk();
      renderHoldingsByWallet();
      scheduleRenderHoldingsTable();
    } catch {}
    try {
      requestAnimationFrame(() => {
        lockInputBodyHeight();
        try { syncWatchlistStars(); } catch {}
      });
    } catch {}
  });

  saveProfileBtn?.addEventListener('click', () => {
    if (state.addressItems.length === 0) {
      showStatus('Add at least one wallet to save a profile', 'info');
      return;
    }

    const name = prompt('Profile name');
    if (!name) return;
    const clean = String(name).trim();
    if (!clean) return;

    const profiles = loadProfiles();
    profiles[clean] = {
      addresses: state.addressItems.map(a => a.raw),
      updatedAt: Date.now(),
    };
    saveProfiles(profiles);
    setActiveProfileName(clean);
    refreshProfilesUi();
    showInputHint(`Saved profile: ${clean}`, 'success');
    hapticFeedback('success');
  });

  deleteProfileBtn?.addEventListener('click', () => {
    const current = profileSelect?.value ? String(profileSelect.value) : getActiveProfileName();
    if (!current) {
      showStatus('Select a profile to delete', 'info');
      return;
    }

    const ok = confirm(`Delete profile "${current}"?`);
    if (!ok) return;

    const profiles = loadProfiles();
    delete profiles[current];
    saveProfiles(profiles);
    if (getActiveProfileName() === current) setActiveProfileName('');
    refreshProfilesUi();
    showStatus(`Deleted profile: ${current}`, 'success');
    hapticFeedback('light');
  });

  // Share Link Popover - Simplified
  const sharePopover = $('sharePopover');
  const shareLinkInput = $('shareLinkInput');
  const copyShareLinkBtn = $('copyShareLinkBtn');
  const shareQrCode = $('shareQrCode');

  function generateQRCode(url) {
    console.log('generateQRCode called with URL:', url);
    
    if (!shareQrCode) {
      console.error('shareQrCode element not found');
      return;
    }
    
    if (typeof QRCode === 'undefined') {
      console.error('QRCode library not loaded');
      return;
    }
    
    console.log('Clearing previous QR code');
    shareQrCode.innerHTML = '';
    
    console.log('Creating new QR code');
    try {
      new QRCode(shareQrCode, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      console.log('QR code created successfully');
    } catch (e) {
      console.error('Failed to create QR code:', e);
      return;
    }
    
    // Add logo overlay after a short delay
    setTimeout(() => {
      console.log('Attempting to add logo overlay');
      const canvas = shareQrCode.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas not found in shareQrCode');
        return;
      }
      console.log('Canvas found, dimensions:', canvas.width, 'x', canvas.height);
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        console.log('Logo image loaded');
        const logoSize = 40;
        const x = (canvas.width - logoSize) / 2;
        const y = (canvas.height - logoSize) / 2;
        
        // White circle background
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 26, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw logo
        ctx.drawImage(img, x, y, logoSize, logoSize);
        console.log('Logo drawn successfully');
      };
      img.onerror = () => console.error('Failed to load logo image');
      img.src = 'peeek-icon.png';
    }, 200);
  }

  function closeSharePopover() {
    if (sharePopover) {
      sharePopover.classList.add('hidden');
    }
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!sharePopover || sharePopover.classList.contains('hidden')) return;
    if (!sharePopover.contains(e.target) && !e.target.closest('#shareLinkBtn')) {
      closeSharePopover();
    }
  });

  // Copy button
  if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', async () => {
      const url = shareLinkInput?.value;
      if (!url) return;
      
      try {
        await navigator.clipboard.writeText(url);
        const originalText = copyShareLinkBtn.innerHTML;
        copyShareLinkBtn.innerHTML = '<span class="btn-icon"><i class="fa-solid fa-check"></i></span><span>Copied!</span>';
        hapticFeedback('success');
        
        setTimeout(() => {
          copyShareLinkBtn.innerHTML = originalText;
          closeSharePopover();
        }, 1500);
      } catch {
        alert('Failed to copy');
      }
    });
  }

  // Share button click handler
  const shareBtn = $('shareLinkBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      if (state.addressItems.length === 0) {
        showStatus('Add wallets first', 'info');
        return;
      }

      // Show loading
      const icon = shareBtn.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      shareBtn.disabled = true;

      try {
        const longUrl = buildShareUrlFromCurrent();
        const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        const url = response.ok ? await response.text() : longUrl;
        
        // Set URL and generate QR
        if (shareLinkInput) shareLinkInput.value = url;
        generateQRCode(url);
        
        // Show popover
        if (sharePopover) {
          sharePopover.classList.remove('hidden');
          hapticFeedback('light');
        }
      } catch (error) {
        const url = buildShareUrlFromCurrent();
        if (shareLinkInput) shareLinkInput.value = url;
        generateQRCode(url);
        if (sharePopover) sharePopover.classList.remove('hidden');
      } finally {
        if (icon) icon.classList.remove('fa-spin');
        shareBtn.disabled = false;
      }
    });
  }

  state._refreshProfilesUi = refreshProfilesUi;
  refreshProfilesUi();

  const uiSections = loadUiSectionState();

  const allocRiskCard = $('allocRiskCard');
  const allocRiskToggle = $('allocRiskToggle');
  const allocRiskContent = $('allocRiskContent');

  const holdingsCard = $('holdingsCard');
  const holdingsToggle = $('holdingsToggle');
  const holdingsContent = $('holdingsContent');

  const walletHoldingsCard = $('walletHoldingsCard');
  const walletHoldingsToggle = $('walletHoldingsToggle');
  const walletHoldingsContent = $('walletHoldingsContent');

  const portfolioScoreCard = $('portfolioScoreCard');
  const portfolioScoreToggle = $('portfolioScoreToggle');
  const portfolioScoreContent = $('portfolioScoreContent');

  function setCollapsed({ card, toggle, content, key, collapsed }) {
    if (!card || !toggle || !content) return;
    const isCollapsed = !!collapsed;
    card.classList.toggle('is-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    content.classList.toggle('hidden', isCollapsed);
    uiSections[key] = !isCollapsed;
    saveUiSectionState(uiSections);
  }

  const allocRiskOpen = Object.prototype.hasOwnProperty.call(uiSections, 'allocRisk') ? !!uiSections.allocRisk : false;
  setCollapsed({ card: allocRiskCard, toggle: allocRiskToggle, content: allocRiskContent, key: 'allocRisk', collapsed: !allocRiskOpen });

  const holdingsOpen = Object.prototype.hasOwnProperty.call(uiSections, 'holdings') ? !!uiSections.holdings : false;
  setCollapsed({ card: holdingsCard, toggle: holdingsToggle, content: holdingsContent, key: 'holdings', collapsed: !holdingsOpen });

  const walletHoldingsOpen = Object.prototype.hasOwnProperty.call(uiSections, 'walletHoldings') ? !!uiSections.walletHoldings : false;
  setCollapsed({ card: walletHoldingsCard, toggle: walletHoldingsToggle, content: walletHoldingsContent, key: 'walletHoldings', collapsed: !walletHoldingsOpen });

  const portfolioScoreOpen = Object.prototype.hasOwnProperty.call(uiSections, 'portfolioScore') ? !!uiSections.portfolioScore : false;
  setCollapsed({ card: portfolioScoreCard, toggle: portfolioScoreToggle, content: portfolioScoreContent, key: 'portfolioScore', collapsed: !portfolioScoreOpen });

  // Accordion behavior for main sections
  const allSections = [
    { card: holdingsCard, toggle: holdingsToggle, content: holdingsContent, key: 'holdings' },
    { card: portfolioScoreCard, toggle: portfolioScoreToggle, content: portfolioScoreContent, key: 'portfolioScore' },
    { card: allocRiskCard, toggle: allocRiskToggle, content: allocRiskContent, key: 'allocRisk' },
    { card: walletHoldingsCard, toggle: walletHoldingsToggle, content: walletHoldingsContent, key: 'walletHoldings' }
  ];

  allocRiskToggle?.addEventListener('click', () => {
    const open = !(allocRiskCard?.classList.contains('is-collapsed'));
    
    // Collapse all other sections (accordion behavior)
    if (!open) {
      allSections.forEach(section => {
        if (section.card !== allocRiskCard && section.card) {
          setCollapsed({ ...section, collapsed: true });
        }
      });
    }
    
    setCollapsed({ card: allocRiskCard, toggle: allocRiskToggle, content: allocRiskContent, key: 'allocRisk', collapsed: open });
    hapticFeedback('light');
  });

  holdingsToggle?.addEventListener('click', () => {
    const open = !(holdingsCard?.classList.contains('is-collapsed'));
    
    // Collapse all other sections (accordion behavior)
    if (!open) {
      allSections.forEach(section => {
        if (section.card !== holdingsCard && section.card) {
          setCollapsed({ ...section, collapsed: true });
        }
      });
    }
    
    setCollapsed({ card: holdingsCard, toggle: holdingsToggle, content: holdingsContent, key: 'holdings', collapsed: open });
    hapticFeedback('light');
  });

  walletHoldingsToggle?.addEventListener('click', () => {
    const open = !(walletHoldingsCard?.classList.contains('is-collapsed'));
    
    // Collapse all other sections (accordion behavior)
    if (!open) {
      allSections.forEach(section => {
        if (section.card !== walletHoldingsCard && section.card) {
          setCollapsed({ ...section, collapsed: true });
        }
      });
    }
    
    setCollapsed({ card: walletHoldingsCard, toggle: walletHoldingsToggle, content: walletHoldingsContent, key: 'walletHoldings', collapsed: open });
    hapticFeedback('light');
  });

  portfolioScoreToggle?.addEventListener('click', () => {
    const open = !(portfolioScoreCard?.classList.contains('is-collapsed'));
    
    // Collapse all other sections (accordion behavior)
    if (!open) {
      allSections.forEach(section => {
        if (section.card !== portfolioScoreCard && section.card) {
          setCollapsed({ ...section, collapsed: true });
        }
      });
    }
    
    setCollapsed({ card: portfolioScoreCard, toggle: portfolioScoreToggle, content: portfolioScoreContent, key: 'portfolioScore', collapsed: open });
    hapticFeedback('light');
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

  $('sortSelect')?.addEventListener('change', () => { 
    setHoldingsPage(1); 
    scheduleRenderHoldingsTable();
  });
  $('hideDust')?.addEventListener('change', () => { 
    setHoldingsPage(1); 
    scheduleRenderHoldingsTable();
  });
  $('showHiddenHoldings')?.addEventListener('change', (e) => {
    const el = e?.target;
    const checked = !!(el && el.checked);
    applyShowHiddenHoldings(checked);
  });

  $('pagePrev')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) - 1);
    scheduleRenderHoldingsTable();
  });
  $('pageNext')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) + 1);
    scheduleRenderHoldingsTable();
  });

  $('pagePrevTop')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) - 1);
    scheduleRenderHoldingsTable();
  });
  $('pageNextTop')?.addEventListener('click', () => {
    setHoldingsPage((state.holdingsPage || 1) + 1);
    scheduleRenderHoldingsTable();
  });

  $('exportButton')?.addEventListener('click', () => {
    if (state.holdings.length === 0) {
      showStatus('No data to export', 'error');
      return;
    }

    const csv = buildHoldingsCsv(state.holdings);
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `peeek-export-${new Date().toISOString().split('T')[0]}.csv`);

    showStatus('CSV exported successfully', 'success');
    hapticFeedback('success');
  });

  $('exportJsonButton')?.addEventListener('click', () => {
    if (state.holdings.length === 0) {
      showStatus('No data to export', 'error');
      return;
    }

    const payload = buildHoldingsJson();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `peeek-export-${new Date().toISOString().split('T')[0]}.json`);
    showStatus('JSON exported successfully', 'success');
    hapticFeedback('success');
  });

}

function setupFooterRotator() {
  const el = $('footerRotatorText');
  if (!el) return;

  const phrases = [
  'Peeek!',
  'No Bullshit!',
  'No Wallet Connect!',
  'No Login!',
  'Multichain',
  'Search Tokens',
  'Watchlist',
  'Portfolio',
  'Analytics',
  'Peeek!',
  'Just Looking',
  'Eyes On-Chain',
  'Spot The Bags',
  'See It All',
  'Portfolio',
  'Scoring',  
  'Insights',
  ];

  let idx = 0;
  let timer = null;

  const setText = (text) => {
    el.textContent = text;
  };

  const tick = () => {
    if (!document.body.contains(el)) {
      if (timer) window.clearTimeout(timer);
      timer = null;
      return;
    }

    el.classList.remove('is-in');
    el.classList.add('is-out');

    window.setTimeout(() => {
      idx = (idx + 1) % phrases.length;
      setText(phrases[idx]);
      void el.offsetWidth;

      el.classList.remove('is-out');
      el.classList.add('is-in');
    }, 180);

    timer = window.setTimeout(tick, 2600);
  };

  setText(phrases[idx]);
  el.classList.add('is-in');
  timer = window.setTimeout(tick, 2600);
}

function initialize() {
  migrateLegacyStorageKeys();

  try { document.body?.setAttribute('data-js-ready', '1'); } catch {}

  setupEyeTracking();
  setupEventListeners();
  setupFooterRotator();

  const appliedFromUrl = applyAddressesFromUrlIfPresent();

  if (!appliedFromUrl) {
    const activeProfile = getActiveProfileName();
    const profiles = loadProfiles();
    const profileList = activeProfile && Array.isArray(profiles?.[activeProfile]?.addresses)
      ? profiles[activeProfile].addresses
      : null;

    const saved = profileList && profileList.length ? profileList : loadPersistedAddressItems();
    if (saved && saved.length) {
      const parsed = getAddressItemsFromText(saved.join('\n'));
      state.addressItems = parsed.items;
      $('inputWarning')?.classList.toggle('hidden', !parsed.truncated);
      renderAddressChips();
    }
  }

  if (typeof state._refreshProfilesUi === 'function') {
    try { state._refreshProfilesUi(); } catch {}
  }

  updateAddressStats();

  state.watchlistTokens = loadWatchlistTokens();
  renderWatchlist();

  try {
    state.hiddenHoldings = loadHiddenHoldingsSet();
    hiddenHoldingsVersion++;
    applyShowHiddenHoldings(loadShowHiddenHoldingsPreference());
    const sh = $('showHiddenHoldings');
    if (sh) sh.checked = !!state.showHiddenHoldings;
  } catch {}

  try { restorePortfolioSnapshot(); } catch {}

  try { renderHoldingsTable(); } catch {}

  setMode('portfolio');
}

function safeInitialize() {
  try {
    initialize();
  } catch (err) {
    try {
      console.error('Initialize failed', err);
    } catch {}
    try {
      document.body?.setAttribute('data-js-error', '1');
      const msg = err?.message || String(err);
      const status = document.getElementById('statusContent');
      if (status) status.textContent = `Init failed: ${String(msg).slice(0, 140)}`;
      const scanStatus = document.getElementById('scanStatus');
      scanStatus?.classList.remove('hidden');
    } catch {}
  }
}

let lastEyeExpressionChange = 0;
const EYE_EXPRESSIONS = ['happy', 'angry', 'sad'];
let currentEyeExpression = null;

function changeEyeExpression() {
  const now = Date.now();
  if (now - lastEyeExpressionChange < 2000) return;
  
  if (Math.random() > 0.3) return;
  
  lastEyeExpressionChange = now;
  
  const availableExpressions = EYE_EXPRESSIONS.filter(e => e !== currentEyeExpression);
  const newExpression = availableExpressions[Math.floor(Math.random() * availableExpressions.length)];
  
  document.body.classList.remove('eye-expression-happy', 'eye-expression-angry', 'eye-expression-sad');
  
  if (Math.random() > 0.2) {
    document.body.classList.add(`eye-expression-${newExpression}`);
    currentEyeExpression = newExpression;
  } else {
    currentEyeExpression = null;
  }
}

function setupEyeExpressionTriggers() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, a, .btn, .holding-action')) {
      changeEyeExpression();
    }
  });
  
  let mouseMoveTimeout;
  document.addEventListener('mousemove', () => {
    clearTimeout(mouseMoveTimeout);
    mouseMoveTimeout = setTimeout(() => {
      if (Math.random() > 0.95) {
        changeEyeExpression();
      }
    }, 500);
  });
  
  const originalAddWallet = window.addWalletFromInput;
  if (typeof originalAddWallet === 'function') {
    window.addWalletFromInput = function(...args) {
      changeEyeExpression();
      return originalAddWallet.apply(this, args);
    };
  }
  
  const originalScan = window.scanPortfolio;
  if (typeof originalScan === 'function') {
    window.scanPortfolio = function(...args) {
      changeEyeExpression();
      return originalScan.apply(this, args);
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    safeInitialize();
    setupEyeExpressionTriggers();
  });
} else {
  safeInitialize();
  setupEyeExpressionTriggers();
}
