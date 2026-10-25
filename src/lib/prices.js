import { SOL_MINT, TOKENS } from './config.js';

// USD prices with two independent sources. Stablecoins always count as exactly
// $1: goals are kept in dollars and a $100 goal holding 100 USDC must read as
// reached, not 99.98% because the market quote wobbled.
export async function fetchPrices() {
  const fallback = { SOL: null, USDC: 1, USDT: 1 };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      return {
        SOL: j.solana?.usd ?? null,
        USDC: 1,
        USDT: 1,
        solChange24h: j.solana?.usd_24h_change ?? null,
        ts: Date.now(),
      };
    }
  } catch {
    /* try the next source */
  }
  // Coinbase's public spot price
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot', { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const p = Number((await r.json())?.data?.amount);
      if (p > 0) return { SOL: p, USDC: 1, USDT: 1, solChange24h: null, ts: Date.now() };
    }
  } catch {
    /* try the next source */
  }
  // Jupiter's price API: the keyless host first, the older one as a last resort
  const ids = [SOL_MINT, TOKENS.USDC.mint.mainnet, TOKENS.USDT.mint.mainnet].join(',');
  for (const host of ['https://api.jup.ag', 'https://lite-api.jup.ag']) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${host}/price/v3?ids=${ids}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      if (!(j[SOL_MINT]?.usdPrice > 0)) continue;
      return {
        SOL: j[SOL_MINT].usdPrice,
        USDC: 1,
        USDT: 1,
        solChange24h: j[SOL_MINT]?.priceChange24h ?? null,
        ts: Date.now(),
      };
    } catch {
      /* try the next one */
    }
  }
  return { ...fallback, ts: 0 };
}
