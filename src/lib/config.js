// Network-level constants shared by the popup and the background worker.

export const NETWORKS = {
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    // Free public nodes, no keys in the build. Each user's requests count
    // against their own IP, so the limits are per person, not shared. If one
    // node fails or rate-limits, the next one is used; a person can put their
    // own node in front in Settings → RPC address.
    // Ranked by how they answered last time (lib/rpc.js), so a dead one is skipped.
    rpc: [
      'https://solana-rpc.publicnode.com',
      'https://public.rpc.solanavibestation.com',
      'https://api.mainnet-beta.solana.com',
      'https://api.mainnet.solana.com',
      'https://solana-mainnet.gateway.tatum.io',
      'https://solana.api.pocket.network',
    ],
    explorerSuffix: '',
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    rpc: ['https://api.devnet.solana.com'],
    explorerSuffix: '?cluster=devnet',
  },
};

/** Who runs each default node, for the RPC screen. */
export const RPC_NAMES = {
  'solana-rpc.publicnode.com': 'PublicNode',
  'public.rpc.solanavibestation.com': 'Solana Vibe Station',
  'api.mainnet-beta.solana.com': 'Solana Foundation',
  'api.mainnet.solana.com': 'Solana Labs',
  'solana-mainnet.gateway.tatum.io': 'Tatum',
  'solana.api.pocket.network': 'Pocket Network',
  'api.devnet.solana.com': 'Solana Foundation',
};

/** Where to get a free personal node key (opened in a new tab). */
export const RPC_PROVIDERS = [
  { name: 'Helius', url: 'https://www.helius.dev' },
  { name: 'QuickNode', url: 'https://www.quicknode.com' },
  { name: 'Alchemy', url: 'https://www.alchemy.com/solana' },
];

export const GENESIS = {
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

export const SOL_MINT = 'So11111111111111111111111111111111111111112';

// SPL token mints per network. USDT has no official devnet mint.
export const TOKENS = {
  SOL: { symbol: 'SOL', name: 'Solana', decimals: 9, mint: { mainnet: null, devnet: null } },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    mint: {
      mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    mint: {
      mainnet: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      devnet: null,
    },
  },
};

export const TOKEN_ORDER = ['USDC', 'USDT', 'SOL'];

/**
 * Swaps between SOL, USDC and USDT go through Jupiter's router (mainnet only).
 * PiggyBank keeps `feeBps` of what is swapped: a separate transfer in the same
 * transaction, to `feeWallet`, shown to the person before they confirm.
 * `apiKey` is optional: without it Jupiter allows 30 requests a minute per user.
 */
export const SWAP = {
  api: 'https://api.jup.ag/swap/v2',
  apiKey: '',
  feeBps: 70,
  feeWallet: 'D52FHmr9jZF7TQT26VpDoZcu77qtSWPmPGcb36c8ThmQ',
  slippageBps: 50,
  minAmount: { USDC: 1, USDT: 1, SOL: 0.01 },
  quoteTtlMs: 20_000,
  retryMs: [1500, 3000], // pauses before asking again after a rate-limit answer
};

// Keep a little SOL untouchable so the wallet can always pay network fees.
export const SOL_FEE_RESERVE = 0.002;
// Rent for a new token account, paid when the recipient has never held the token.
export const ATA_RENT_SOL = 0.00203928;

export const DEFAULT_SETTINGS = {
  network: 'mainnet',
  customRpc: { mainnet: '', devnet: '' },
  autoLockMinutes: 15,
  notifyDeposits: true,
  reminder: 'off', // off | daily | weekly
  hideBalances: false,
  language: 'auto', // auto | ru | en
  theme: 'auto', // auto | light | dark
};

export function explorerTx(sig, network) {
  return `https://solscan.io/tx/${sig}${NETWORKS[network].explorerSuffix}`;
}

export function explorerAccount(addr, network) {
  return `https://solscan.io/account/${addr}${NETWORKS[network].explorerSuffix}`;
}

export function rpcList(settings) {
  const net = settings?.network || 'mainnet';
  const custom = settings?.customRpc?.[net]?.trim();
  return custom ? [custom, ...NETWORKS[net].rpc] : NETWORKS[net].rpc;
}

export function streamflowUrl(id, network) {
  return `https://app.streamflow.finance/contract/solana/${network}/${id}`;
}

/** Unlock moment for a goal date: noon local time on that day, in unix seconds. */
export function unlockAtFromDate(iso) {
  return Math.floor(new Date(iso + 'T12:00:00').getTime() / 1000);
}

export function dateFromUnix(sec) {
  const d = new Date(sec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
