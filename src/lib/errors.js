import { t } from '../i18n.js';

/** Turns a raw RPC/send error into a short explanation for the user. */
export function explainSendError(e) {
  const msg = `${e?.message || ''} ${JSON.stringify(e?.data || '')}`.toLowerCase();
  if (e?.message === 'source-insufficient') return t('err.sourceInsufficient');
  const own = {
    'lock-insufficient-sol': 'err.lockSol',
    'lock-insufficient-token': 'err.lockToken',
    'lock-closed': 'err.lockClosed',
    'still-locked': 'err.stillLocked',
    'token-unavailable': 'err.tokenUnavailable',
    'has-locks': 'err.hasLocks',
    'lock-too-small': 'err.lockTooSmall',
    'not-enough-free': 'err.notEnoughFree',
    'lock-program-missing': 'err.lockProgramMissing',
    'swap-mainnet-only': 'swap.err.mainnet',
    'swap-too-small': 'swap.err.tooSmall',
    'swap-busy': 'swap.err.busy',
    'swap-no-route': 'swap.err.noRoute',
    'swap-unavailable': 'swap.err.unavailable',
    'swap-unsafe': 'swap.err.unsafe',
    'swap-bad-rate': 'swap.err.badRate',
    'swap-slippage': 'swap.err.slippage',
    'swap-insufficient-sol': 'swap.err.sol',
    'swap-insufficient-token': 'swap.err.token',
    'swap-sim-failed': 'swap.err.sim',
    'swap-too-big': 'swap.err.unavailable',
    'swap-rate-changed': 'swap.err.rateChanged',
    'swap-pair': 'swap.err.unavailable',
    'swap-fee-wallet': 'swap.err.feeWallet',
    locked: 'err.walletLocked',
  }[e?.message];
  if (own) return t(own);
  if (msg.includes('insufficient funds for rent') || msg.includes('insufficientfundsforrent')) return t('err.rent');
  if (msg.includes('insufficient') || /custom program error: 0x1(?![0-9a-f])/.test(msg) || msg.includes('debit an account'))
    return t('err.insufficient');
  if (e?.code === 'expired') return t('err.expired');
  if (e?.code === 'timeout') return t('err.timeout');
  if (e?.code === 'tx-failed') return t('err.txFailed');
  if (e?.code === 'http' || e?.name === 'AbortError' || msg.includes('failed to fetch')) return t('err.network');
  if (msg.includes('custom program error') || msg.includes('instructionerror')) return t('err.program');
  return t('err.generic', { reason: e?.message || '?' });
}
