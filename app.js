// Looky - Modern Crypto Portfolio Viewerhhg
// Enhanced UI with smooth animations and better UX

const $ = (id) => document.getElementById(id);

const MAX_ADDRESSES = 20;
const STORAGE_KEY_ADDRESSES = 'looky:lastAddresses';
const STORAGE_KEY_PROFILES = 'looky:profiles';
const STORAGE_KEY_ACTIVE_PROFILE = 'looky:activeProfile';
const STORAGE_KEY_UI_SECTIONS = 'looky:uiSections';
const STORAGE_KEY_REDACTED_MODE = 'looky:redactedMode';

const HOLDINGS_PAGE_SIZE = 5;

const SCAN_CACHE_TTL_MS = 10 * 60 * 1000;
const scanCache = new Map();

const SOL_CHANGE_CACHE_TTL_MS = 10 * 60 * 1000;
const solTokenChangeCache = new Map();

const SOL_OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const solTokenOverviewCache = new Map();

const SOL_CHANGE_CACHE_TTL_ZERO_MS = 30 * 1000;

const DEBUG_SOL_CHANGE = (() => {
  try { return localStorage.getItem('looky:debugSolChange') === '1'; }
  catch { return false; }
})();

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
  const v = d?.value || d?.data || d?.result || {};
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
  // Query closest price around (now - 24h). Birdeye supports Solana coverage for this endpoint.
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

  // If Birdeye provides priceChange24h directly, it appears to be a percent value.
  const direct = Number(d?.priceChange24h ?? d?.price_change_24h ?? 0);
  if (Number.isFinite(direct) && Math.abs(direct) > 0) return direct;

  const price24hAgo = Number(d?.value ?? 0);
  if (!Number.isFinite(price24hAgo) || price24hAgo <= 0) return 0;

  // Compute pct from current price.
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

  // Prefer /defi/price which is designed to return price + 24h change fields.
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

  // Fallback: token_overview with frames=24h (Solana).
  if (!Number.isFinite(pct24h) || Math.abs(pct24h) < 1e-9) {
    try {
      const d = (await fetchSolTokenOverview(tokenAddress, { signal })) || {};
      const v = d?.value || d?.data || {};

      // Be defensive: response schema can differ by package/endpoint version.
      const frame24 = d?.['24h'] || d?.frame_24h || d?.frame24h || d?.frames?.['24h'] || d?.frames?.frame_24h || null;
      const pct = Number(
        // Some Birdeye responses use priceChange24hPercent.
        d?.priceChange24hPercent ??
        d?.price_change_24h_percent ??
        d?.price_change_24h_percent_value ??
        v?.priceChange24hPercent ??
        v?.price_change_24h_percent ??
        v?.price_change_24h_percent_value ??
        frame24?.priceChange24hPercent ??
        frame24?.price_change_24h_percent ??

        // Some Birdeye responses put the 24h percent at top-level.
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

  // Final fallback: compute from historical price at ~24h ago.
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

function holdingDeltaUsdFromPct({ valueUsd, pct }) {
  const v = Number(valueUsd) || 0;
  const p = Number(pct);
  if (!Number.isFinite(v) || !Number.isFinite(p) || v <= 0) return 0;
  const r = p / 100;
  const denom = 1 + r;
  if (Math.abs(denom) < 1e-9) return 0;
  // value_now = value_24h_ago * (1 + r)
  // delta = value_now - value_24h_ago = value_now * r/(1+r)
  return v * (r / denom);
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
        window.__lookySol24hDebug = summary;
        console.warn('[SOL 24h] enrich skipped', summary);
      } catch {}
    }
    return holdings;
  }

  const out = holdings.map((h) => ({ ...h }));
  const uniq = Array.from(new Set(out
    .map((h) => String(h?.address || h?.token_address || '').trim())
    .filter(Boolean)));

  if (uniq.length === 0) return out;

  // Keep concurrency conservative.
  const concurrency = 4;
  const pctByAddr = new Map();
  const metaByAddr = new Map();
  let idx = 0;

  const isNativeSol = (addr) => String(addr) === 'So11111111111111111111111111111111111111111';

  async function fetchSolTokenMeta(addr) {
    // token_overview often includes liquidity/volume stats; reuse cached response.
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
    const addr = String(h?.address || h?.token_address || '').trim();
    if (!addr) return;
    const pct24h = Number(pctByAddr.get(addr) ?? 0) || 0;
    const valueUsd = Number(h?.value || h?.valueUsd || 0) || 0;

    const meta = metaByAddr.get(addr) || { liquidityUsd: 0, volume24hUsd: 0 };
    const eligible = isNativeSol(addr) ||
      (Number(meta?.liquidityUsd || 0) >= SOL_CHANGE_ELIGIBLE_LIQUIDITY_USD) ||
      (Number(meta?.volume24hUsd || 0) >= SOL_CHANGE_ELIGIBLE_VOLUME24H_USD);

    // Overwrite/change fields used by aggregation, so SOL portfolio change becomes price-based.
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

      window.__lookySol24hDebug = summary;
      console.debug('[SOL 24h] missing pct24h summary', summary);
      console.log('[SOL 24h] missing pct24h summary json', JSON.stringify(summary));
    } catch {}
  }

  return out;
}

let holdingsRenderQueued = false;
let holdingsRenderLastAt = 0;
let holdingsRenderThrottleTimer = null;
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
};

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
function scheduleRecomputeAggregatesAndRender() {
  if (recomputeQueued) return;
  recomputeQueued = true;
  requestAnimationFrame(() => {
    recomputeQueued = false;
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
    // ignore
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

  const uiSections = loadUiSectionState();
  uiSections.holdings = false;
  uiSections.allocRisk = false;
  uiSections.walletHoldings = false;
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

function encodeShareParamFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  const payload = list
    .filter(Boolean)
    .slice(0, MAX_ADDRESSES)
    .map(x => ({ t: x.type, a: x.raw }));
  try {
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

function decodeShareParamToRawList(param) {
  if (!param) return null;
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

  // Eye tiredness: start showing veins at 3+ wallets, scale up to the max.
  const count = state.addressItems.length;
  const startAt = 3;
  const maxAt = MAX_ADDRESSES;
  const t = (count < startAt)
    ? 0
    : Math.min(1, Math.max(0, (count - startAt) / Math.max(1, (maxAt - startAt))));
  document.body.style.setProperty('--eye-tired', String(t));
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
  zerion: '/api/zerion',
  birdeye: '/api/birdeye',
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
    const totalNow = Number(state.totalValueForChange || 0) || 0;
    const total24hAgo = Number(state.totalValue24hAgo || 0) || 0;
    const delta = totalNow - total24hAgo;

    if (totalNow <= 0) {
      totalChangeEl.classList.add('hidden');
      totalChangeEl.classList.remove('positive', 'negative');
    } else {
      const pct = total24hAgo > 0 ? (delta / total24hAgo) * 100 : 0;
      const pctSafe = Number.isFinite(pct) ? pct : 0;

      totalChangeEl.classList.remove('hidden');
      totalChangeEl.classList.toggle('positive', pctSafe > 0.0001);
      totalChangeEl.classList.toggle('negative', pctSafe < -0.0001);
      const arrow = pctSafe > 0.0001 ? '▲' : pctSafe < -0.0001 ? '▼' : '•';
      const sign = delta > 0 ? '+' : delta < 0 ? '-' : '+';
      totalChangeEl.textContent = `${arrow} ${Math.abs(pctSafe).toFixed(2)}% (${sign}${formatCurrency(Math.abs(delta))})`;
    }
  }
  $('tokenCount') && ($('tokenCount').textContent = String(state.holdings.length));

  const largest = state.holdings.reduce((max, h) => (h.value > max.value ? h : max), { value: 0, symbol: '—' });
  $('largestHolding') && ($('largestHolding').textContent = largest.symbol || '—');
  $('largestValue') && ($('largestValue').textContent = formatCurrency(largest.value || 0));
}

function formatPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

function renderAllocationAndRisk() {
  const allocationEl = $('allocationBreakdown');
  const chainChartEl = $('chainAllocationChart');
  const tokenAllocationEl = $('tokenAllocationList');
  const insightsEl = $('riskInsights');
  if ((!allocationEl && (!chainChartEl || !tokenAllocationEl)) || !insightsEl) return;

  const holdings = Array.isArray(state.holdings) ? state.holdings : [];
  const total = Number(state.totalValue || 0) || 0;

  if (!holdings.length || total <= 0) {
    if (allocationEl) allocationEl.innerHTML = '';
    if (chainChartEl) chainChartEl.innerHTML = '';
    if (tokenAllocationEl) tokenAllocationEl.innerHTML = '';
    insightsEl.innerHTML = '';
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

    // Non-EVM
    if (key === 'solana') return '#7c3aed'; // purple

    // EVM networks
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

    // Stable fallback color
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

  const tokenRows = topHoldings
    .filter(r => Number(r?.value || 0) > ALLOC_MIN_VALUE);

  const tokenHtml = tokenRows.map((r) => {
    const pct = Math.max(0, Math.min(100, r.pct));
    return `
      <div class="alloc-row" data-key="${escapeHtml(r.key)}">
        <div class="alloc-row-top">
          <div class="alloc-row-name">${escapeHtml(r.name)}</div>
          <div class="alloc-row-meta">${formatPct(pct)} · <span class="redacted-field" tabindex="0">${formatCurrency(r.value)}</span></div>
        </div>
        <div class="alloc-bar"><div class="alloc-bar-fill" style="width:${pct.toFixed(2)}%"></div></div>
      </div>
    `;
  }).join('');

  if (tokenAllocationEl) {
    tokenAllocationEl.innerHTML = tokenHtml;
  }

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

  const insights = [];
  insights.push(`Top holding concentration: <strong>${formatPct(top1Pct)}</strong> of portfolio`);
  insights.push(`Top 5 holdings: <strong>${formatPct(top5Pct)}</strong> of portfolio`);
  if (topChain) {
    insights.push(`Top chain concentration: <strong>${formatPct(topChainPct)}</strong> on ${escapeHtml(topChain.name || '—')}`);
    insights.push(`Top 3 chains: <strong>${formatPct(top3ChainsPct)}</strong> of portfolio`);
    insights.push(`Chains with meaningful exposure: <strong>${chainsOver5}</strong> chain${chainsOver5 === 1 ? '' : 's'} ≥ 5%`);
  }
  insights.push(`Stablecoin exposure: <strong>${formatPct(stablePct)}</strong> (est.)`);
  if (dust.count > 0 && dust.value > 0) {
    insights.push(`Dust exposure: <strong><span class="redacted-field" tabindex="0">${formatCurrency(dust.value)}</span></strong> across <strong>${dust.count}</strong> token${dust.count === 1 ? '' : 's'} (&lt; <span class="redacted-field" tabindex="0">${formatCurrency(DUST_USD)}</span>)`);
  }
  if (topWallet && topWallet.value > 0) {
    insights.push(`Wallet concentration: <strong>${formatPct(topWalletPct)}</strong> in top wallet`);
  }

  insightsEl.innerHTML = insights
    .slice(0, 7)
    .map((t) => `<div class="insight-item">${t}</div>`)
    .join('');
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

  const walletNetworks = new Map();
  for (const [walletKey, walletHoldings] of state.walletHoldings.entries()) {
    const parts = String(walletKey || '').split(':');
    const chain = parts[0] || '';
    const wallet = parts.slice(1).join(':') || '';
    if (!wallet) continue;

    if (!walletNetworks.has(wallet)) walletNetworks.set(wallet, { hasSol: false, evm: new Set() });
    const info = walletNetworks.get(wallet);
    if (chain === 'solana') {
      info.hasSol = true;
    } else if (chain === 'evm') {
      const list = Array.isArray(walletHoldings) ? walletHoldings : [];
      for (const h of list) {
        const net = normalizeEvmNetwork(h?.network || h?.chain || '');
        if (net) info.evm.add(net);
      }
    }
  }

  const walletTotals = new Map();
  for (const h of holdings) {
    const v = Number(h?.value || 0) || 0;
    const sources = Array.isArray(h?.sources) ? h.sources.filter(Boolean).map(String) : [];
    if (!sources.length || v <= 0) continue;

    const uniq = Array.from(new Set(sources));
    const per = v / Math.max(1, uniq.length);
    for (const w of uniq) walletTotals.set(w, (walletTotals.get(w) || 0) + per);
  }

  const walletRows = Array.from(walletTotals.entries())
    .map(([wallet, value]) => {
      const v = Number(value || 0) || 0;
      return {
        wallet,
        value: v,
        pct: total > 0 ? (v / total) * 100 : 0,
      };
    })
    .filter(r => r.value > ALLOC_MIN_VALUE)
    .sort((a, b) => b.value - a.value);

  walletAllocationEl.innerHTML = walletRows
    .map((r) => {
      const pct = Math.max(0, Math.min(100, r.pct));
      const info = walletNetworks.get(r.wallet) || { hasSol: false, evm: new Set() };
      const tags = [];
      if (info.hasSol) {
        tags.push(
          `<a class="chain-badge-small solana wallet-chain-tag" href="https://solscan.io/account/${encodeURIComponent(r.wallet)}" target="_blank" rel="noopener noreferrer">SOL</a>`
        );
      }
      if (info.evm && info.evm.size) {
        const nets = Array.from(info.evm.values());
        nets.sort((a, b) => evmNetworkLabel(a).localeCompare(evmNetworkLabel(b)));
        for (const n of nets) {
          const label = evmNetworkLabel(n);
          const href = `${evmExplorerBase(n)}/address/${r.wallet}`;
          tags.push(
            `<a class="chain-badge-small evm wallet-chain-tag" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
          );
        }
      }
      const tagsHtml = tags.length ? `<span class="wallet-chain-tags">${tags.join('')}</span>` : '';
      return `
        <div class="alloc-row" data-key="wallet:${escapeHtml(r.wallet)}">
          <div class="alloc-row-top">
            <div class="alloc-row-name mono">${escapeHtml(shortenAddress(r.wallet))}${tagsHtml}</div>
            <div class="alloc-row-meta">${formatPct(pct)} · <span class="redacted-field" tabindex="0">${formatCurrency(r.value)}</span></div>
          </div>
          <div class="alloc-bar"><div class="alloc-bar-fill" style="width:${pct.toFixed(2)}%"></div></div>
        </div>
      `;
    })
    .join('');
}

function renderHoldingsTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  const exportBtn = $('exportButton');
  if (exportBtn) exportBtn.disabled = state.holdings.length === 0;

  const exportJsonBtn = $('exportJsonButton');
  if (exportJsonBtn) exportJsonBtn.disabled = state.holdings.length === 0;

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

  const scanTotal = Number(state.scanMeta?.total || 0) || 0;
  const scanCompleted = Number(state.scanMeta?.completed || 0) || 0;
  const scanRemaining = Math.max(0, scanTotal - scanCompleted);
  const scanSkeletonCount = state.scanning ? Math.min(3, Math.max(1, scanRemaining)) : 0;

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
      const progressPart = scanTotal > 0 ? ` • Scanning ${scanCompleted}/${scanTotal}` : '';
      $('tableStats') && ($('tableStats').textContent = `Loading holdings…${progressPart}`);
      $('pageIndicator') && ($('pageIndicator').textContent = 'Page 1 of 1');
      $('pagePrev') && ($('pagePrev').disabled = true);
      $('pagePrev')?.classList?.add('hidden');
      $('pageNext') && ($('pageNext').disabled = true);
      return;
    }

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
    const skeletonRows = state.scanning && scanSkeletonCount > 0
      ? Array.from({ length: scanSkeletonCount }).map(() => `
          <tr class="skeleton-row">
            <td><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-30"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-40"></div></td>
            <td><div class="skeleton-line w-50"></div></td>
          </tr>
        `).join('')
      : '';

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
          <strong class="mono redacted-field" tabindex="0">${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong>
        </td>
        <td class="mono"><strong class="redacted-field" tabindex="0">${formatNumber(holding.balance)}</strong></td>
        <td class="mono"><strong class="redacted-field" tabindex="0">${formatPrice(holding.price)}</strong></td>
        <td class="mono"><strong class="redacted-field" tabindex="0">${formatCurrency(holding.value)}</strong></td>
      </tr>
    `).join('') + skeletonRows;
  } else {
    const skeletonRows = state.scanning && scanSkeletonCount > 0
      ? Array.from({ length: scanSkeletonCount }).map(() => `
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
        `).join('')
      : '';

    tbody.innerHTML = pageItems.map(holding => {
      const displayAddress = (holding.chain === 'evm' && isValidEvmContractAddress(holding.contractAddress)) ? holding.contractAddress : holding.address;

      let explorerHref = '#';
      if (holding.chain === 'solana') {
        explorerHref = `https://solscan.io/token/${holding.address}`;
      } else if (isValidEvmContractAddress(displayAddress)) {
        explorerHref = `${evmExplorerBase(holding.network)}/token/${displayAddress}`;
      }

      const chartAddress = holding.chain === 'evm' ? displayAddress : holding.address;

      const sourceWallet = holding.sources?.[0] || '';
      const walletHref = sourceWallet
        ? (holding.chain === 'solana'
          ? `https://solscan.io/account/${sourceWallet}`
          : `${evmExplorerBase(holding.network)}/address/${sourceWallet}`)
        : '#';

      const explorerDisabled = explorerHref === '#';
      const walletDisabled = walletHref === '#';

      return `
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

              <div class="holding-card-header-right">
                <span class="chain-badge-small ${holding.chain}">${holding.chain === 'solana' ? 'SOL' : evmNetworkLabel(holding.network)}</span>
                <div class="holding-card-actions" aria-label="Holding actions">
                  <a class="holding-action ${explorerDisabled ? 'disabled' : ''}" href="${explorerHref}" target="_blank" rel="noopener noreferrer" aria-label="View on Explorer" ${explorerDisabled ? 'aria-disabled=\"true\" tabindex=\"-1\"' : ''}>
                    <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>
                  </a>
                  <a class="holding-action" href="#" data-action="chart" data-chain="${holding.chain}" data-network="${holding.network || ''}" data-address="${chartAddress}" data-symbol="${escapeHtml(holding.symbol || '')}" data-name="${escapeHtml(holding.name || '')}" aria-label="View Chart">
                    <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                  </a>
                  <div class="chart-popover hidden" aria-label="Chart links">
                    <a class="chart-popover-link" data-provider="dexscreener" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dexscreener">
                      <img class="chart-popover-icon" src="https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64" alt="Dexscreener" />
                    </a>
                    <a class="chart-popover-link" data-provider="dextools" href="#" target="_blank" rel="noopener noreferrer" aria-label="Dextools">
                      <img class="chart-popover-icon" src="https://www.google.com/s2/favicons?domain=dextools.io&sz=64" alt="Dextools" />
                    </a>
                    <a class="chart-popover-link" data-provider="birdeye" href="#" target="_blank" rel="noopener noreferrer" aria-label="Birdeye">
                      <img class="chart-popover-icon" src="https://www.google.com/s2/favicons?domain=birdeye.so&sz=64" alt="Birdeye" />
                    </a>
                  </div>
                  <a class="holding-action ${walletDisabled ? 'disabled' : ''}" href="${walletHref}" target="_blank" rel="noopener noreferrer" aria-label="View Wallet" ${walletDisabled ? 'aria-disabled=\"true\" tabindex=\"-1\"' : ''}>
                    <i class="fa-solid fa-wallet" aria-hidden="true"></i>
                  </a>
                </div>
              </div>
            </div>

            <div class="holding-card-metrics">
              <div class="holding-metric">
                <div class="holding-metric-label">Balance</div>
                <div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${formatNumber(holding.balance)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">Price</div>
                <div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${formatPrice(holding.price)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">Value</div>
                <div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${formatCurrency(holding.value)}</strong></div>
              </div>
              <div class="holding-metric">
                <div class="holding-metric-label">MCap</div>
                <div class="holding-metric-value mono"><strong class="redacted-field" tabindex="0">${holding.mcap ? formatCurrency(holding.mcap) : '—'}</strong></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
      `;
    }).join('') + skeletonRows;
  }

  const progressPart = (state.scanning && scanTotal > 0) ? ` • Scanning ${scanCompleted}/${scanTotal}` : '';
  if ($('tableStats')) {
    $('tableStats').innerHTML = `Showing ${totalItems} tokens • Total value: <span class="redacted-field" tabindex="0">${formatCurrency(filteredTotalValue)}</span>${escapeHtml(progressPart)}`;
  }
}

function recomputeAggregatesAndRender() {
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

    // For Solana, prefer a price/market-based 24h change by summing per-holding 1d deltas.
    // This tends to match Phantom better than "net worth change" which can include transfers.
    let solWalletNow = 0;
    let solWalletChange = 0;
    let solWalletHasChange = false;

    const walletTotalValue = items.reduce((s, h) => s + (Number(h?.value || h?.valueUsd || 0) || 0), 0);
    if (chain === 'solana') totalSolValue += walletTotalValue;
    else totalEvmValue += walletTotalValue;

    items.forEach(holding => {
      const rawTokenAddress = holding.address || holding.token_address;
      const contractAddress = holding.contract_address || holding.contractAddress || (chain === 'evm' ? extractEvmContractAddress(rawTokenAddress) : '');
      const tokenAddress = contractAddress || rawTokenAddress;
      const network = chain === 'evm' ? normalizeEvmNetwork(holding.chain || holding.network) : '';
      const key = `${chain}:${tokenAddress}`;
      const value = Number(holding.value || holding.valueUsd || 0) || 0;
      const amount = Number(holding.amount || holding.uiAmount || holding.balance || 0) || 0;
      const mcap = Number(holding.market_cap ?? holding.marketCap ?? holding.mc ?? holding.fdv ?? holding.fdv_usd ?? 0) || 0;
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
      if (chain === 'solana') {
        // To match Phantom more closely, only include tokens that appear to have real price discovery
        // (liquidity/volume), otherwise spam/illiquid tokens can dominate and flip sign.
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
      window.__lookySol24hContrib = summary;
      console.log('[SOL 24h] contrib summary json', JSON.stringify(summary));
    } catch {}
  }

  setHoldingsPage(1);

  updateSummary();
  renderAllocationAndRisk();
  renderHoldingsByWallet();
  renderHoldingsTable();

  enrichHoldingsWithMcap(state.holdings, { signal: state.scanAbortController?.signal });
}

async function scanWallets({ queueOverride } = {}) {
  if (state.scanning) return;

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
  document.body.classList.add('ui-reveal');
  window.setTimeout(() => document.body.classList.remove('ui-reveal'), 520);

  $('resultsSection')?.classList.remove('hidden');

  state.scanning = true;
  setScanningUi(true);
  state.walletHoldings = new Map();
  state.walletDayChange = new Map();
  state.lastScanFailedQueue = [];
  state.scanMeta = { completed: 0, total: walletsQueue.length };
  state.scanAbortController = new AbortController();
  updateTelegramMainButton();

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
  const concurrency = (isTelegram() || window.matchMedia('(max-width: 640px)').matches) ? 2 : 4;
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
                window.__lookySol24hDebug = info;
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

  scheduleRecomputeAggregatesAndRender();
  forceCollapseResultsSections();

  if (scanButton) {
    scanButton.disabled = false;
    scanButton.innerHTML = '<span>Lets Looky!</span>';
  }

  $('cancelScanButton')?.classList.add('hidden');
  $('retryFailedButton')?.classList.add('hidden');
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

  document.addEventListener('click', (e) => {
    const chart = e.target.closest('a.holding-action[data-action="chart"]');
    if (chart) {
      e.preventDefault();
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

  $('amendWalletsBtn')?.addEventListener('click', () => {
    if (!document.body.classList.contains('ui-results')) return;
    $('inputSection')?.classList.toggle('is-minimized');
  });

  const applyRedactedMode = (enabled) => {
    document.body.classList.toggle('is-redacted', !!enabled);
    try {
      localStorage.setItem(STORAGE_KEY_REDACTED_MODE, enabled ? '1' : '0');
    } catch {}
    const btn = $('redactedToggleBtn');
    if (btn) {
      const label = btn.querySelector('span:last-child');
      if (label) label.textContent = enabled ? 'Show Balances' : 'Hide Balances';
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

  // Tap to reveal (mobile): temporarily unblur a single field.
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

  const profileSelect = $('profileSelect');
  const saveProfileBtn = $('saveProfileBtn');
  const deleteProfileBtn = $('deleteProfileBtn');
  const shareLinkBtn = $('shareLinkBtn');

  function refreshProfilesUi() {
    if (!profileSelect) return;
    const profiles = loadProfiles();
    const active = getActiveProfileName();
    const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));

    profileSelect.innerHTML = [
      '<option value="">Profiles</option>',
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

    const profiles = loadProfiles();
    const rawList = Array.isArray(profiles?.[name]?.addresses) ? profiles[name].addresses : [];
    const parsed = getAddressItemsFromText(rawList.join('\n'));
    setAddressItems(parsed.items, { showWarning: parsed.truncated });
    setActiveProfileName(name);
    showStatus(`Loaded profile: ${name}`, 'success');
    hapticFeedback('light');
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

  shareLinkBtn?.addEventListener('click', async () => {
    if (state.addressItems.length === 0) {
      showStatus('Add wallets to generate a share link', 'info');
      return;
    }

    const url = buildShareUrlFromCurrent();
    try {
      await navigator.clipboard.writeText(url);
      showInputHint('Share link copied', 'success');
      hapticFeedback('success');
    } catch {
      showInputHint('Copy share link', 'info');
      prompt('Copy share link', url);
    }
  });

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

  allocRiskToggle?.addEventListener('click', () => {
    const open = !(allocRiskCard?.classList.contains('is-collapsed'));
    setCollapsed({ card: allocRiskCard, toggle: allocRiskToggle, content: allocRiskContent, key: 'allocRisk', collapsed: open });
    hapticFeedback('light');
  });

  holdingsToggle?.addEventListener('click', () => {
    const open = !(holdingsCard?.classList.contains('is-collapsed'));
    setCollapsed({ card: holdingsCard, toggle: holdingsToggle, content: holdingsContent, key: 'holdings', collapsed: open });
    hapticFeedback('light');
  });

  walletHoldingsToggle?.addEventListener('click', () => {
    const open = !(walletHoldingsCard?.classList.contains('is-collapsed'));
    setCollapsed({ card: walletHoldingsCard, toggle: walletHoldingsToggle, content: walletHoldingsContent, key: 'walletHoldings', collapsed: open });
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

  $('exportButton')?.addEventListener('click', () => {
    if (state.holdings.length === 0) {
      showStatus('No data to export', 'error');
      return;
    }

    const csv = buildHoldingsCsv(state.holdings);
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `looky-export-${new Date().toISOString().split('T')[0]}.csv`);

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
    downloadBlob(blob, `looky-export-${new Date().toISOString().split('T')[0]}.json`);
    showStatus('JSON exported successfully', 'success');
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
      $('inputSection')?.classList.toggle('is-minimized');
    });
  }
}

function setupFooterRotator() {
  const el = $('footerRotatorText');
  if (!el) return;

  const phrases = [
  'Looky!',
  'No Bullshit!',
  'No Wallet Connect!',
  'No Login!',
  'Multichain',
  'View Value',
  'View Analytics',
  'Looky!',
  'Just Looking',
  'Eyes On-Chain',
  'Spot The Bags',
  'See It All',
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

      // force reflow so transition always fires
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
  setupTelegram();
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
  updateTelegramMainButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
