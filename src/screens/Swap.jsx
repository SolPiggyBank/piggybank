import { useEffect, useRef, useState } from 'preact/hooks';
import { TopBar, fireConfetti, Collapse } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { TokenIcon } from '../components/TokenIcon.jsx';
import { useAppState, replace, navigate } from '../store.js';
import { computeFunds, quoteSwap, swap } from '../actions.js';
import { explainSendError } from '../lib/errors.js';
import { ATA_RENT_SOL, SWAP, explorerTx } from '../lib/config.js';
import { fmtToken, fmtTokenExact, fmtUsd, fmtSol, fmtPct, parseAmount, normalizeAmount, floorTo, toInput, acceptAmountText } from '../lib/format.js';
import { useAnimatedNumber } from './Home.jsx';
import { t } from '../i18n.js';

const TOKENS = ['USDC', 'USDT', 'SOL'];
const TOKEN_NAMES = { USDC: 'USD Coin', USDT: 'Tether USD', SOL: 'Solana' };
const DECIMALS = { USDC: 6, USDT: 6, SOL: 9 };
// SOL kept back by "Max" when paying in SOL: the network fee and the temporary wSOL account
const SOL_SWAP_HEADROOM = 0.003;
const pct = (bps) => `${fmtPct(bps / 100)}%`;

/** A coin picker: the current token as a pill, the three tokens in a small menu. */
function TokenSelect({ value, onPick, amounts, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div class="tok-select" ref={ref}>
      <button class={`tok-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
        <span class="tok-coin" key={value}>
          <TokenIcon symbol={value} size={28} />
        </span>
        <b>{value}</b>
        <Icon name="chev" class="chev" />
      </button>
      {open && (
        <div class="tok-menu" role="listbox" aria-label={label}>
          {TOKENS.map((sym, i) => (
            <button
              key={sym}
              role="option"
              aria-selected={sym === value}
              class={sym === value ? 'on' : ''}
              style={{ '--i': i }}
              onClick={() => {
                setOpen(false);
                onPick(sym);
              }}
            >
              <span class="tok-menu-coin">
                <TokenIcon symbol={sym} size={30} />
              </span>
              <span class="tok-menu-name">
                <b>{sym}</b>
                <small>{TOKEN_NAMES[sym]}</small>
              </span>
              <span class="tok-menu-amt num">{fmtToken(amounts[sym] || 0, sym)}</span>
              <Icon name="check" class="tok-menu-tick" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A ring that empties until the quote refreshes; tap it to refresh now. */
function RefreshRing({ quote, loading, onRefresh }) {
  return (
    <button class={`quote-ring${loading ? ' busy' : ''}`} onClick={onRefresh} disabled={loading} aria-label={t('swap.refresh')} title={t('swap.refresh')}>
      <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="track" cx="12" cy="12" r="9" />
        {quote && !loading && <circle class="left" cx="12" cy="12" r="9" pathLength="100" key={quote.createdAt} style={{ animationDuration: `${SWAP.quoteTtlMs}ms` }} />}
      </svg>
      <Icon name="refresh" class="ico" />
    </button>
  );
}

function AnimatedOut({ value, sym }) {
  const v = useAnimatedNumber(value, 600);
  return <>{fmtToken(Math.abs(v - value) < 1e-12 ? value : v, sym)}</>;
}

function QuoteDetails({ quote }) {
  const rate = quote.outAmount / quote.swapAmount;
  // SOL is always quoted as "1 SOL ≈ … USDC"; between stablecoins four decimals tell more
  const rateText =
    quote.from === 'SOL'
      ? `1 SOL ≈ ${fmtToken(rate, quote.to)} ${quote.to}`
      : quote.to === 'SOL'
        ? `1 SOL ≈ ${fmtToken(1 / rate, quote.from)} ${quote.from}`
        : `1 ${quote.from} ≈ ${fmtToken(rate, 'SOL')} ${quote.to}`;
  return (
    <div class="kv swap-kv">
      <div>
        <span class="k">{t('swap.rate')}</span>
        <span class="v num">{rateText}</span>
      </div>
      <div class="fee-row">
        <span class="k">{t('swap.fee', { pct: pct(SWAP.feeBps) })}</span>
        <span class="v num">
          {fmtTokenExact(quote.fee, quote.from)} {quote.from}
        </span>
      </div>
      <div>
        <span class="k">{t('swap.minOut')}</span>
        <span class="v num">
          {fmtToken(quote.minOut, quote.to)} {quote.to}
        </span>
      </div>
      <div>
        <span class="k">{t('swap.network')}</span>
        <span class="v num">≈ {fmtSol(quote.networkFeeSol)} SOL</span>
      </div>
      {quote.needsOutAccount && (
        <div>
          <span class="k">{t('swap.newAccount', { token: quote.to })}</span>
          <span class="v num">{fmtSol(ATA_RENT_SOL)} SOL</span>
        </div>
      )}
      {!quote.feeAccountExists && (
        <div>
          <span class="k">{t('swap.feeAccount')}</span>
          <span class="v num">{fmtSol(ATA_RENT_SOL)} SOL</span>
        </div>
      )}
      {quote.priceImpact >= 0.01 && (
        <div>
          <span class="k">{t('swap.impact')}</span>
          <span class="v num warn-text">{(quote.priceImpact * 100).toFixed(2)}%</span>
        </div>
      )}
      {quote.route.length > 0 && (
        <div>
          <span class="k">{t('swap.route')}</span>
          <span class="v">Jupiter: {quote.route.slice(0, 3).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

export function Swap({ params }) {
  const s = useAppState();
  const net = s.settings.network;
  const mainnet = net === 'mainnet';
  const funds = computeFunds(s);
  const needsAccount = (sym) => sym !== 'SOL' && !(s.balances?.accounts?.[sym] || []).length;
  // the most that can go in: free money only, and in SOL some stays back for the swap itself
  const maxFor = (sym, other) => {
    const free = funds.sendable[sym] || 0;
    if (sym !== 'SOL') return floorTo(free, DECIMALS[sym]);
    const keep = SOL_SWAP_HEADROOM + (needsAccount(other) ? ATA_RENT_SOL : 0);
    return floorTo(Math.max(0, free - keep), 9);
  };

  const [from, setFrom] = useState(() => params.from || TOKENS.find((sym) => (funds.sendable[sym] || 0) > 0) || 'USDC');
  const [to, setTo] = useState(() => params.to || (from === 'SOL' ? 'USDC' : 'SOL'));
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [qState, setQState] = useState('idle'); // idle | loading | ok | error
  const [qErr, setQErr] = useState('');
  const [tick, setTick] = useState(0);
  const [flipKey, setFlipKey] = useState(0);
  const [step, setStep] = useState('form'); // form | review | status
  const [stage, setStage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sig, setSig] = useState('');
  const [rateNote, setRateNote] = useState('');
  const [prevQuote, setPrevQuote] = useState(null); // the last quote, shown dimmed while the next one loads
  const reqRef = useRef(0);
  const lastKey = useRef('');

  const num = parseAmount(amount);
  const max = maxFor(from, to);
  const over = num > max + 1e-9;
  const tooSmall = num > 0 && num < SWAP.minAmount[from];
  const inGoals = funds.allocated[from] || 0;
  const priceOf = (sym) => s.prices[sym] ?? (sym === 'SOL' ? 0 : 1);
  const shown = quote && quote.from === from && quote.to === to ? quote : null;
  const solShort = shown ? Math.max(0, shown.solNeeded - funds.sendable.SOL) : 0;
  const busy = step === 'status';

  // fetch a quote shortly after typing stops; a refresh keeps the old numbers on screen meanwhile
  useEffect(() => {
    if (!mainnet || busy) return;
    const key = `${from}>${to}:${normalizeAmount(amount)}`;
    const sameInput = key === lastKey.current;
    lastKey.current = key;
    if (!(num > 0) || over || tooSmall) {
      reqRef.current++;
      setQuote(null);
      setPrevQuote(null);
      setQState('idle');
      setQErr('');
      return;
    }
    if (!sameInput) {
      setPrevQuote((p) => quote || p);
      setQuote(null);
    }
    setQState('loading');
    setQErr('');
    const id = ++reqRef.current;
    const timer = setTimeout(
      async () => {
        try {
          const q = await quoteSwap({ from, to, amount: normalizeAmount(amount) });
          if (id !== reqRef.current) return;
          setQuote(q);
          setQState('ok');
        } catch (e) {
          if (id !== reqRef.current) return;
          setQErr(explainSendError(e));
          setQState('error');
        }
      },
      sameInput ? 0 : 650,
    );
    return () => clearTimeout(timer);
  }, [from, to, amount, tick, mainnet]);

  // a fresh rate every SWAP.quoteTtlMs while the person is looking at it
  useEffect(() => {
    if (qState !== 'ok' || busy) return;
    const timer = setTimeout(() => setTick((x) => x + 1), SWAP.quoteTtlMs);
    return () => clearTimeout(timer);
  }, [qState, quote, busy]);

  function pickFrom(sym) {
    if (sym === from) return;
    if (sym === to) return flip();
    setFrom(sym);
    setAmount('');
  }
  function pickTo(sym) {
    if (sym === to) return;
    if (sym === from) return flip();
    setTo(sym);
  }
  function flip() {
    setFlipKey((k) => k + 1);
    setFrom(to);
    setTo(from);
    // what was coming out becomes what goes in
    if (shown && shown.outAmount > 0) setAmount(toInput(floorTo(shown.outAmount, Math.min(DECIMALS[to], 6))));
    else setAmount('');
  }

  async function confirm() {
    const q = shown;
    if (!q) return;
    setStep('status');
    setStage('signing');
    setError('');
    setSig('');
    setRateNote('');
    try {
      const res = await swap({
        quote: q,
        onStage: (st, sg) => {
          setStage(st);
          if (sg) setSig(sg);
        },
      });
      setResult(res);
      setSig(res.signature);
      setStage('done');
      setTimeout(fireConfetti, 650);
    } catch (e) {
      if (e.message === 'swap-rate-changed' && e.quote) {
        setQuote(e.quote);
        setQState('ok');
        setRateNote(t('swap.rateChangedNote', { amount: `${fmtToken(e.quote.outAmount, e.quote.to)} ${e.quote.to}` }));
        setStep('review');
        return;
      }
      if (e.signature) setSig(e.signature);
      setError(explainSendError(e));
      setStage('error');
    }
  }

  // ---- status: swapping, done, failed --------------------------------------
  if (step === 'status') {
    const q = result?.quote || shown || quote;
    return (
      <div class="screen">
        <TopBar title="" noBack />
        <div class="status-wrap">
          {stage === 'done' && q ? (
            <>
              <div class="swap-done" aria-hidden="true">
                <span class="gone">
                  <TokenIcon symbol={q.from} size={44} />
                </span>
                <span class="got">
                  <TokenIcon symbol={q.to} size={76} />
                </span>
                <span class="tick">
                  <Icon name="check" />
                </span>
              </div>
              <h2 class="h1">{t('swap.done')}</h2>
              <div class="swap-received num">
                +<AnimatedOut value={result.received} sym={q.to} /> {q.to}
              </div>
              <p class="muted small" style={{ margin: 0 }}>
                {t('swap.gave', { amount: `${fmtTokenExact(q.amountIn, q.from)} ${q.from}`, fee: `${fmtTokenExact(q.fee, q.from)} ${q.from}` })}
              </p>
            </>
          ) : stage === 'error' ? (
            <>
              <div class="status-ring err">
                <Icon name="alert" />
              </div>
              <h2 class="h1">{t('swap.failed')}</h2>
              <p class="muted" style={{ margin: 0 }}>
                {error}
              </p>
            </>
          ) : (
            <>
              <div class="swap-orbit" aria-hidden="true">
                <span class="a">
                  <TokenIcon symbol={q?.from || from} size={40} />
                </span>
                <span class="b">
                  <TokenIcon symbol={q?.to || to} size={40} />
                </span>
              </div>
              <h2 class="h1">{stage === 'confirming' ? t('swap.status.sending') : stage === 'requoting' ? t('swap.status.requoting') : t('swap.status.signing')}</h2>
              <p class="muted" style={{ margin: 0 }}>
                {stage === 'confirming' ? t('swap.status.waiting') : t('swap.status.preparing')}
              </p>
            </>
          )}
          {sig && (
            <a class="link-btn" href={explorerTx(sig, net)} target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>
              {t('send.viewSolscan')}
            </a>
          )}
        </div>
        <div class="pad" style={{ paddingBottom: 18 }}>
          {stage === 'done' && (
            <div class="onb-foot">
              <button class="btn btn-primary block" onClick={() => replace('home')}>
                {t('send.done')}
              </button>
              <button
                class="btn btn-ghost block"
                onClick={() => {
                  setResult(null);
                  setAmount('');
                  setQuote(null);
                  setQState('idle');
                  setStep('form');
                }}
              >
                {t('swap.again')}
              </button>
            </div>
          )}
          {stage === 'error' && (
            <div class="onb-foot">
              <button
                class="btn btn-primary block"
                onClick={() => {
                  setStep('form');
                  setTick((x) => x + 1);
                }}
              >
                {t('common.retry')}
              </button>
              <button class="btn btn-ghost block" onClick={() => replace('home')}>
                {t('common.goHome')}
              </button>
            </div>
          )}
          {stage !== 'done' && stage !== 'error' && <p class="hint center">{t('swap.canClose')}</p>}
        </div>
      </div>
    );
  }

  // ---- review -----------------------------------------------------------
  if (step === 'review' && shown) {
    return (
      <div class="screen">
        <TopBar title={t('swap.review')} onBack={() => setStep('form')} right={<RefreshRing quote={shown} loading={qState === 'loading'} onRefresh={() => setTick((x) => x + 1)} />} />
        <div class="scroll">
          <div class="pad" style={{ paddingBottom: 18 }}>
            <div class="swap-pair">
              <div class="side">
                <TokenIcon symbol={shown.from} size={48} />
                <div class="amt num">
                  {fmtTokenExact(shown.amountIn, shown.from)} {shown.from}
                </div>
                <div class="muted small">≈ {fmtUsd(shown.amountIn * priceOf(shown.from))}</div>
              </div>
              <div class="arrow" aria-hidden="true">
                <svg viewBox="0 0 48 24">
                  <path class="dash" d="M4 12h34" />
                  <path d="m32 5 8 7-8 7" />
                </svg>
              </div>
              <div class="side">
                <TokenIcon symbol={shown.to} size={48} />
                <div class={`amt num${qState === 'loading' ? ' dim' : ''}`}>
                  ≈ <AnimatedOut value={shown.outAmount} sym={shown.to} /> {shown.to}
                </div>
                <div class="muted small">≈ {fmtUsd(shown.outAmount * priceOf(shown.to))}</div>
              </div>
            </div>
            {rateNote && (
              <div class="banner warn" style={{ marginBottom: 10 }}>
                <Icon name="alert" />
                <div>{rateNote}</div>
              </div>
            )}
            {qState === 'error' && qErr && (
              <div class="banner danger" style={{ marginBottom: 10 }}>
                <Icon name="alert" />
                <div>
                  {qErr}
                  <div class="actions">
                    <button class="btn btn-soft sm" onClick={() => setTick((x) => x + 1)}>
                      {t('common.retry')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <QuoteDetails quote={shown} />
            <p class="hint">{t('swap.reviewNote', { slippage: pct(SWAP.slippageBps) })}</p>
            {solShort > 0 && (
              <div class="banner danger" style={{ marginTop: 10 }}>
                <Icon name="alert" />
                <div>{t('swap.needSol', { need: fmtSol(shown.solNeeded), have: fmtSol(funds.sendable.SOL) })}</div>
              </div>
            )}
            <div class="onb-foot">
              <button class="btn btn-primary block swap-go" onClick={confirm} disabled={solShort > 0 || qState === 'loading' || qState === 'error'}>
                <Icon name="swap" />
                {t('swap.confirm', { amount: `${fmtTokenExact(shown.amountIn, shown.from)} ${shown.from}`, to: shown.to })}
              </button>
              <button class="btn btn-ghost block" onClick={() => setStep('form')}>
                {t('swap.edit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- form ---------------------------------------------------------------
  const amounts = { USDC: funds.sendable.USDC, USDT: funds.sendable.USDT, SOL: funds.sendable.SOL };
  const loading = qState === 'loading';
  const stale = !shown && loading && prevQuote && prevQuote.from === from && prevQuote.to === to ? prevQuote : null;
  const details = shown || stale;
  return (
    <div class="screen">
      <TopBar title={t('swap.title')} right={mainnet && shown ? <RefreshRing quote={shown} loading={loading} onRefresh={() => setTick((x) => x + 1)} /> : null} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 18 }}>
          {!mainnet && (
            <div class="banner warn" style={{ marginBottom: 12 }}>
              <Icon name="globe" />
              <div>
                <b>{t('swap.mainnetTitle')}</b> {t('swap.mainnetText')}
                <div class="actions">
                  <button class="btn btn-soft sm" onClick={() => navigate('settings')}>
                    {t('swap.openSettings')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div class={`swap-box${mainnet ? '' : ' off'}`}>
            <div class={`swap-card${over || tooSmall ? ' error' : ''}`}>
              <div class="swap-head">
                <span>{t('swap.pay')}</span>
                <button class="max-btn" onClick={() => setAmount(toInput(max))} disabled={!max || !mainnet}>
                  {t('common.max')}
                </button>
              </div>
              <div class="swap-row" key={`f${flipKey}`} data-flip={flipKey ? 'down' : null}>
                <TokenSelect value={from} onPick={pickFrom} amounts={amounts} label={t('swap.pay')} />
                <input
                  class="swap-input num"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  disabled={!mainnet}
                  aria-label={t('common.amountIn', { symbol: from })}
                  onInput={(e) => {
                    const v = acceptAmountText(e.currentTarget.value, DECIMALS[from]);
                    if (v == null) {
                      e.currentTarget.value = amount;
                      return;
                    }
                    e.currentTarget.value = v;
                    setAmount(v);
                  }}
                />
              </div>
              <div class="swap-sub">
                <span>
                  {t('swap.available', { amount: `${fmtToken(max, from)} ${from}` })}
                </span>
                <span>{num > 0 ? `≈ ${fmtUsd(num * priceOf(from))}` : ''}</span>
              </div>
            </div>

            <button class="swap-flip" onClick={flip} disabled={!mainnet} aria-label={t('swap.flip')} title={t('swap.flip')}>
              <span key={flipKey} class={flipKey ? 'spin' : ''}>
                <Icon name="swapV" />
              </span>
            </button>

            <div class="swap-card to">
              <div class="swap-head">
                <span>{t('swap.get')}</span>
              </div>
              <div class="swap-row" key={`t${flipKey}`} data-flip={flipKey ? 'up' : null}>
                <TokenSelect value={to} onPick={pickTo} amounts={amounts} label={t('swap.get')} />
                <div class={`swap-out num${loading && !details ? ' skeleton' : ''}${loading && details ? ' dim' : ''}${details ? '' : ' blank'}`}>
                  {details ? <AnimatedOut value={details.outAmount} sym={to} /> : loading ? '0.000' : '0'}
                </div>
              </div>
              <div class="swap-sub">
                <span>{details ? t('swap.after', { pct: pct(SWAP.feeBps) }) : ' '}</span>
                <span>{details ? `≈ ${fmtUsd(details.outAmount * priceOf(to))}` : ''}</span>
              </div>
            </div>
          </div>

          <Collapse open={over}>
            <div class="hint err">
              {t('send.canWithdraw', { amount: `${fmtTokenExact(max, from)} ${from}` })}
              {inGoals > 0 && <> {t('send.moreInGoals', { amount: fmtToken(inGoals, from) })}</>}
              {from === 'SOL' && <> {t('swap.solKept')}</>}
            </div>
          </Collapse>
          <Collapse open={tooSmall}>
            <div class="hint err">{t('swap.min', { amount: `${fmtToken(SWAP.minAmount[from], from)} ${from}` })}</div>
          </Collapse>
          <Collapse open={!over && !tooSmall && inGoals > 0 && !(num > 0)}>
            <div class="hint">{t('swap.goalsKept', { amount: `${fmtToken(inGoals, from)} ${from}` })}</div>
          </Collapse>

          <Collapse open={!!details}>
            <div class={`swap-details${shown ? '' : ' dim'}`}>{details && <QuoteDetails quote={details} />}</div>
          </Collapse>
          <Collapse open={qState === 'error' && !!qErr}>
            <div class="banner danger" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <div>
                {qErr}
                <div class="actions">
                  <button class="btn btn-soft sm" onClick={() => setTick((x) => x + 1)}>
                    {t('common.retry')}
                  </button>
                </div>
              </div>
            </div>
          </Collapse>
          <Collapse open={solShort > 0}>
            <div class="banner danger" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <div>{shown && t('swap.needSol', { need: fmtSol(shown.solNeeded), have: fmtSol(funds.sendable.SOL) })}</div>
            </div>
          </Collapse>

          <button class="btn btn-primary block swap-go" style={{ marginTop: 16 }} disabled={!shown || solShort > 0 || !mainnet} onClick={() => setStep('review')}>
            {loading && !shown ? t('swap.quoting') : t('swap.cta')}
          </button>
          <p class="hint center">{t('swap.feeNote', { pct: pct(SWAP.feeBps) })}</p>
        </div>
      </div>
    </div>
  );
}
