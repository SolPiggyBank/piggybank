import { useState, useEffect } from 'preact/hooks';
import { TopBar, TokenPicker, AmountInput } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { TokenIcon } from '../components/TokenIcon.jsx';
import { useAppState, replace, navigate, back, toast, getState } from '../store.js';
import { computeFunds, send, recipientRiskFor, loadHistory } from '../actions.js';
import { addrParts } from '../lib/poison.js';
import { isValidAddress, inspectRecipient, estimateFeeSol, parsePaymentText } from '../lib/solana.js';
import { explainSendError } from '../lib/errors.js';
import { rpcList, TOKENS, explorerTx } from '../lib/config.js';
import { fmtToken, fmtTokenExact, fmtUsd, parseAmount, normalizeAmount, floorTo, shortAddr, toInput } from '../lib/format.js';
import { t } from '../i18n.js';

const DECIMALS = { USDC: 6, USDT: 6, SOL: 9 };

/** The whole address with the part a look-alike fakes (start and end) kept plain and the middle marked. */
function AddrDiff({ addr }) {
  const [head, mid, tail] = addrParts(addr);
  return (
    <code class="addr-diff">
      {head}
      <mark>{mid}</mark>
      {tail}
    </code>
  );
}

export function Send() {
  const s = useAppState();
  const net = s.settings.network;
  const funds = computeFunds(s);
  // exact amounts (to the token's precision), so "Max" can empty the wallet
  const available = (sym) => (sym === 'SOL' || TOKENS[sym].mint[net] ? floorTo(funds.sendable[sym], DECIMALS[sym]) : 0);
  const [step, setStep] = useState('form');
  const [token, setToken] = useState(() => ['USDC', 'USDT', 'SOL'].find((sym) => available(sym) > 0) || 'USDC');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [checking, setChecking] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [stage, setStage] = useState('');
  const [sig, setSig] = useState('');
  const [error, setError] = useState('');
  const [risk, setRisk] = useState({});
  const [ack, setAck] = useState(false);

  // the look-alike check needs the on-chain history: fetch it quietly if this popup hasn't yet
  useEffect(() => {
    const st = getState();
    if (st.history?.network !== net && st.historyStatus !== 'loading') loadHistory().catch(() => {});
  }, [net]);

  const max = available(token);
  const num = parseAmount(amount);
  const toTrim = to.trim();
  const addrValid = isValidAddress(toTrim);
  const isSelf = toTrim === s.wallet.publicKey;
  const addrErr = toTrim && !addrValid ? t('send.badAddr') : isSelf ? t('send.selfAddr') : '';
  const inGoals = funds.allocated[token] || 0;
  const overFree = num > max + 1e-9;
  const solForFee = token === 'SOL' ? 0 : 0.00002;
  const lowSol = token !== 'SOL' && (funds.balances.SOL || 0) < solForFee;
  const price = s.prices[token] ?? (token === 'SOL' ? 0 : 1);
  const canContinue = addrValid && !isSelf && num > 0 && !overFree && !lowSol && !checking;

  /** A pasted address, or a Solana Pay link that also brings the amount and token. */
  function applyPasted(text) {
    const parsed = parsePaymentText(text, net);
    setFormErr('');
    if (!parsed) {
      setTo(text.trim()); // shows "not a Solana address"
      return;
    }
    setTo(parsed.address);
    if (parsed.token && (parsed.token === 'SOL' || TOKENS[parsed.token].mint[net])) {
      if (parsed.token !== token) setToken(parsed.token);
      if (parsed.amount) setAmount(toInput(Number(parsed.amount)));
    }
  }

  async function review() {
    if (!canContinue) return;
    setChecking(true);
    setFormErr('');
    try {
      const r = await inspectRecipient(rpcList(s.settings), net, token, toTrim);
      if (r.kind === 'error') {
        setFormErr(
          r.reason === 'wrong-token-account'
            ? t('send.wrongTokenAccount', { token })
            : r.reason === 'off-curve'
              ? t('send.offCurve')
              : t('send.cantSend'),
        );
      } else {
        setRisk(await recipientRiskFor(toTrim).catch(() => ({})));
        setAck(false);
        setRecipient(r);
        setStep('review');
      }
    } catch (e) {
      setFormErr(explainSendError(e));
    }
    setChecking(false);
  }

  async function confirm() {
    setStep('status');
    setStage('signing');
    setError('');
    setSig('');
    try {
      const signature = await send({
        token,
        to: toTrim,
        amount: normalizeAmount(amount),
        recipient,
        onStage: (st, sg) => {
          setStage(st);
          if (sg) setSig(sg);
        },
      });
      setSig(signature);
      setStage('done');
    } catch (e) {
      if (e.signature) setSig(e.signature);
      setError(explainSendError(e));
      setStage('error');
    }
  }

  if (step === 'status') {
    return (
      <div class="screen">
        <TopBar title="" noBack />
        <div class="status-wrap">
          {stage === 'done' ? (
            <>
              <div class="send-done" aria-hidden="true">
                <span class="trail" />
                <span class="coin">
                  <TokenIcon symbol={token} size={44} />
                </span>
                <span class="tick">
                  <Icon name="check" />
                </span>
              </div>
              <h2 class="h1">{t('send.sent')}</h2>
              <div class="send-amount num">
                −{fmtTokenExact(num, token)} {token}
              </div>
              <p class="muted" style={{ margin: 0 }}>
                {t('send.sentToAddr', { to: shortAddr(toTrim, 5) })}
              </p>
            </>
          ) : stage === 'error' ? (
            <>
              <div class="status-ring err shake">
                <Icon name="alert" />
              </div>
              <h2 class="h1">{t('send.notSent')}</h2>
              <p class="muted" style={{ margin: 0 }}>
                {error}
              </p>
            </>
          ) : (
            <>
              <div class={`send-radar ${stage === 'signing' ? 'signing' : 'flying'}`} aria-hidden="true">
                <span class="ring" />
                <span class="ring r2" />
                <span class="coin">
                  <TokenIcon symbol={token} size={60} />
                </span>
              </div>
              <h2 class="h1">{stage === 'signing' ? t('send.signing') : t('send.sending')}</h2>
              <p class="muted" style={{ margin: 0 }}>
                {stage === 'signing' ? t('send.preparing') : t('send.waiting')}
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
            <button class="btn btn-primary block" onClick={() => replace('home')}>
              {t('send.done')}
            </button>
          )}
          {stage === 'error' && (
            <div class="onb-foot">
              <button class="btn btn-primary block" onClick={() => setStep('form')}>
                {t('common.retry')}
              </button>
              <button class="btn btn-ghost block" onClick={() => replace('home')}>
                {t('common.goHome')}
              </button>
            </div>
          )}
          {stage !== 'done' && stage !== 'error' && (
            <p class="hint center">{t('send.canClose')}</p>
          )}
        </div>
      </div>
    );
  }

  if (step === 'review') {
    const fee = estimateFeeSol({ token, needsAta: recipient?.needsAta });
    const solNeeded = fee.fee + fee.rent + (token === 'SOL' ? num : 0);
    const notEnoughSol = (funds.balances.SOL || 0) < solNeeded;
    const risky = !!(risk.twin || risk.dustOnly);
    return (
      <div class="screen">
        <TopBar title={t('send.reviewTitle')} onBack={() => setStep('form')} />
        <div class="scroll">
          <div class="pad" style={{ paddingBottom: 18 }}>
            <div class="review">
              <TokenIcon symbol={token} size={44} />
              <div class="big num" style={{ marginTop: 8 }}>
                {fmtTokenExact(num, token)} {token}
              </div>
              <div class="muted">≈ {fmtUsd(num * price)}</div>
            </div>
            <div class="kv" style={{ marginTop: 14 }}>
              <div>
                <span class="k">{t('send.recipient')}</span>
                <span class="v">{toTrim}</span>
              </div>
              <div>
                <span class="k">{t('send.network')}</span>
                <span class="v">Solana {net === 'devnet' ? 'Devnet' : 'Mainnet'}</span>
              </div>
              <div>
                <span class="k">{t('send.fee')}</span>
                <span class="v num">≈ {fmtToken(fee.fee, 'SOL')} SOL</span>
              </div>
              {fee.rent > 0 && (
                <div>
                  <span class="k">{t('send.ataFee', { token })}</span>
                  <span class="v num">{fmtToken(fee.rent, 'SOL')} SOL</span>
                </div>
              )}
            </div>
            {fee.rent > 0 && (
              <p class="hint">
                {t('send.ataHint', { token })}
              </p>
            )}
            {recipient?.warnTokenAccount && (
              <div class="banner warn" style={{ marginTop: 10 }}>
                <Icon name="alert" />
                <div>{t('send.tokenAccountWarn')}</div>
              </div>
            )}
            {notEnoughSol && (
              <div class="banner danger" style={{ marginTop: 10 }}>
                <Icon name="alert" />
                <div>
                  {t('send.notEnoughSol', { need: fmtToken(solNeeded, 'SOL'), have: fmtToken(funds.balances.SOL, 'SOL') })}
                </div>
              </div>
            )}
            {risk.twin && (
              <div class="banner danger poison" style={{ marginTop: 10 }} role="alert">
                <Icon name="alert" />
                <div>
                  <b>{t('send.poisonTitle')}</b> {t('send.poisonText')}
                  <div class="addr-compare">
                    <span class="k">{t('send.poisonKnown')}</span>
                    <AddrDiff addr={risk.twin} />
                    <span class="k">{t('send.poisonNow')}</span>
                    <AddrDiff addr={toTrim} />
                  </div>
                </div>
              </div>
            )}
            {risk.dustOnly && (
              <div class="banner danger" style={{ marginTop: 10 }} role="alert">
                <Icon name="alert" />
                <div>
                  <b>{t('send.dustTitle')}</b> {t('send.dustText')}
                </div>
              </div>
            )}
            {risky && (
              <label class="ack">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
                <span>{t('send.ackAddr')}</span>
              </label>
            )}
            <div class="banner" style={{ marginTop: 10 }}>
              <Icon name="info" />
              <div>{t('send.irreversible')}</div>
            </div>
            <div class="onb-foot">
              <button class="btn btn-primary block" onClick={confirm} disabled={notEnoughSol || (risky && !ack)}>
                <Icon name="up" />
                {t('send.cta', { amount: `${fmtTokenExact(num, token)} ${token}` })}
              </button>
              <button class="btn btn-ghost block" onClick={() => setStep('form')}>
                {t('send.edit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="screen">
      <TopBar title={t('home.withdraw')} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 18 }}>
          <div class="label">{t('send.what')}</div>
          <TokenPicker
            value={token}
            onChange={(sym) => {
              setToken(sym);
              setAmount('');
            }}
            amounts={{ USDC: available('USDC'), USDT: available('USDT'), SOL: available('SOL') }}
            disabledFor={(sym) => sym !== 'SOL' && !TOKENS[sym].mint[net]}
          />

          <label class="label" for="to" style={{ marginTop: 14 }}>
            {t('send.to')}
          </label>
          <div class={`field${addrErr ? ' error' : ''}`}>
            <input
              id="to"
              value={to}
              onInput={(e) => {
                setTo(e.currentTarget.value);
                setFormErr('');
              }}
              onPaste={(e) => {
                const text = e.clipboardData?.getData('text') || '';
                if (parsePaymentText(text, net)?.address && text.trim() !== parsePaymentText(text, net).address) {
                  e.preventDefault(); // a link or a sentence: keep just the address
                  applyPasted(text);
                }
              }}
              placeholder={t('send.toPh')}
              spellcheck={false}
              autocomplete="off"
            />
            <div class="suffix">
              <button
                class="btn btn-ghost sm"
                onClick={async () => {
                  let text = '';
                  try {
                    text = (await navigator.clipboard.readText()).trim();
                  } catch {
                    // reading the clipboard can be blocked: fall back to the keyboard
                    document.getElementById('to')?.focus();
                    toast(t('send.pasteManually'));
                    return;
                  }
                  if (!text) {
                    toast(t('send.clipboardEmpty'));
                    return;
                  }
                  applyPasted(text);
                }}
              >
                <Icon name="paste" />
                {t('send.paste')}
              </button>
            </div>
          </div>
          {addrErr && <div class="hint err">{addrErr}</div>}

          <div class="label" style={{ marginTop: 14 }}>
            {t('send.howMuch')}
          </div>
          <AmountInput
            value={amount}
            onInput={setAmount}
            symbol={token}
            usd={num > 0 ? num * price : null}
            decimals={DECIMALS[token]}
            max={max}
            onMax={() => setAmount(toInput(max))}
            maxLabel={t('common.max')}
            error={overFree}
          />
          {overFree ? (
            <div class="hint err">
              {t('send.canWithdraw', { amount: `${fmtTokenExact(max, token)} ${token}` })}
              {inGoals > 0 && (
                <>
                  {' '}
                  {t('send.moreInGoals', { amount: fmtToken(inGoals, token) })}{' '}
                  <button class="link-btn" onClick={() => navigate('goals')}>
                    {t('send.takeFromGoal')}
                  </button>
                  .
                </>
              )}
            </div>
          ) : (
            <div class="hint">
              {t('send.available', { amount: `${fmtTokenExact(max, token)} ${token}` })}
              {inGoals > 0 ? t('send.availableGoals', { amount: fmtToken(inGoals, token) }) : ''}
              {token === 'SOL' ? t('send.solReserve') : ''}
            </div>
          )}

          {lowSol && (
            <div class="banner warn" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <div>
                {t('send.lowSol', { token })}
              </div>
            </div>
          )}
          {formErr && (
            <div class="banner danger" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <div>{formErr}</div>
            </div>
          )}

          <button class="btn btn-primary block" style={{ marginTop: 18 }} disabled={!canContinue} onClick={review}>
            {checking ? t('send.checking') : t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
