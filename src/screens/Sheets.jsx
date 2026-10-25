import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { exitGhost } from '../components/motion.js';
import { Sheet, TokenPicker, AmountInput, fireConfetti, fireSparkles } from '../components/ui.jsx';
import { Jar } from '../components/Jar.jsx';
import { Icon } from '../components/icons.jsx';
import { GOAL_COLORS } from '../components/Jar.jsx';
import { useAppState, closeSheet, openSheet, navigate, replace, toast, back, getState } from '../store.js';
import { computeFunds, allocate, release, deleteGoal, resetWallet, quoteLock, lockToGoal } from '../actions.js';
import { explainSendError } from '../lib/errors.js';
import { goalAlloc, goalProgress, goalSavedUsd, smartOpen, hasActiveLocks, isProtected, goalHoldsMoney } from '../lib/goals-math.js';
import { fmtToken, fmtTokenExact, fmtUsd, parseAmount, floorTo, toInput, normalizeAmount, fmtDateLong, fmtSol } from '../lib/format.js';
import { t, inAllLangs } from '../i18n.js';

// The confirmation word works in any of our languages.
const matches = (value, words) => words.includes(value.trim().toLowerCase());
import { TOKENS, dateFromUnix, explorerTx, SOL_FEE_RESERVE } from '../lib/config.js';
import { SkipBackupSheet } from './Onboarding.jsx';
import { useDragScroll } from '../components/useDragScroll.js';

const DECIMALS = { USDC: 2, USDT: 2, SOL: 6 };

function priceOf(prices, sym) {
  return prices[sym] ?? (sym === 'SOL' ? 0 : 1);
}

// ---------------------------------------------------------------- allocate

/** 25 / 50 / 75 % of a goal: a cheerful toast and a small burst once the coin has landed. */
function celebrateMilestone(m, goalName) {
  setTimeout(() => {
    fireSparkles();
    toast(t(`milestone.${m}`, { goal: goalName }), 'milestone');
  }, 700);
}

function AllocateSheet({ params }) {
  const s = useAppState();
  const pickRef = useDragScroll();
  const net = s.settings.network;
  const funds = computeFunds(s);
  const goals = s.goals.filter((g) => !g.archived);
  const avail = funds.allocatable; // free money, minus the SOL kept for network fees
  const firstToken = () => {
    if (params.token && avail[params.token] > 0) return params.token;
    return ['USDC', 'USDT', 'SOL'].find((sym) => avail[sym] > 0.000001) || 'USDC';
  };
  const [goalId, setGoalId] = useState(
    params.goalId || goals.find((g) => goalProgress(g, s.prices, net) < 1)?.id || goals[0]?.id,
  );
  const [token, setToken] = useState(firstToken);
  const [amount, setAmount] = useState(
    params.amount ? toInput(floorTo(Math.min(params.amount, avail[firstToken()]), DECIMALS[firstToken()])) : '',
  );
  const [busy, setBusy] = useState(false);
  const goal = goals.find((g) => g.id === goalId);
  const free = floorTo(avail[token] || 0, DECIMALS[token]);
  const num = parseAmount(amount);
  const tooMuch = num > free + 1e-9;
  const valid = num > 0 && !tooMuch && goal;
  const price = priceOf(s.prices, token);
  const nothingFree = ['USDC', 'USDT', 'SOL'].every((sym) => avail[sym] < 0.000001);

  const needToken = useMemo(() => {
    if (!goal || !price) return 0;
    const left = goal.target - goalSavedUsd(goal, s.prices, net);
    return left > 0 ? Math.ceil((left / price) * 10 ** DECIMALS[token]) / 10 ** DECIMALS[token] : 0;
  }, [goal, token, s.prices]);

  const after = goal && valid ? Math.min(1, (goalSavedUsd(goal, s.prices, net) + num * price) / goal.target) : null;

  if (!goals.length) {
    return (
      <Sheet title={t('allocate.title')}>
        <div class="center" style={{ padding: '6px 0 4px' }}>
          <div style={{ width: 80, margin: '0 auto 8px' }}>
            <Jar level={0} emoji="🎯" />
          </div>
          <p class="muted" style={{ marginTop: 0 }}>
            {t('allocate.noGoals')}
          </p>
          <button class="btn btn-coin block" onClick={() => navigate('goal-edit')}>
            {t('goals.setGoal')}
          </button>
        </div>
      </Sheet>
    );
  }

  const goalPicker = (
    <div class="goal-pick" role="radiogroup" aria-label={t('goals.goal')} ref={pickRef}>
      {goals.map((g) => (
        <button key={g.id} class={g.id === goalId ? 'on' : ''} onClick={() => setGoalId(g.id)} role="radio" aria-checked={g.id === goalId}>
          <span class="e" style={{ background: (GOAL_COLORS[g.color] || GOAL_COLORS.coin).fill }}>
            {g.emoji}
          </span>
          <span class="n">{g.name}</span>
          {g.smart && smartOpen(g) && <Icon name="lock" size={14} />}
        </button>
      ))}
    </div>
  );

  if (goal?.smart && smartOpen(goal)) {
    return (
      <Sheet title={t('smart.sheetTitle')}>
        <div class="label">{t('allocate.whichGoal')}</div>
        {goalPicker}
        <LockPanel goal={goal} key={goal.id} />
      </Sheet>
    );
  }

  if (nothingFree) {
    return (
      <Sheet title={t('allocate.title')}>
        <p class="muted" style={{ marginTop: 0 }}>
          {s.balances && funds.totalUsd > 0 ? t('allocate.allAllocated') : t('allocate.empty')}
        </p>
        <button class="btn btn-primary block" onClick={() => navigate('deposit')}>
          <Icon name="down" />
          {t('deposit.title')}
        </button>
      </Sheet>
    );
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { completedNow, milestone } = await allocate(goalId, token, num);
      closeSheet();
      if (completedNow) {
        setTimeout(() => openSheet('goal-done', { goalId }), 900);
      } else if (milestone) {
        celebrateMilestone(milestone, goal.name);
      } else {
        toast(t('allocate.done', { amount: `${fmtToken(num, token)} ${token}`, goal: goal.name }));
      }
    } catch (e) {
      toast(t('allocate.failed'), 'err');
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('allocate.title')}>
      <div class="label">{t('allocate.whichGoal')}</div>
      {goalPicker}
      {goal?.smart && !smartOpen(goal) && (
        <div class="hint" style={{ marginTop: 6 }}>
          {t('smart.closedNote')}
        </div>
      )}

      <div class="label" style={{ marginTop: 14 }}>
        {t('allocate.fromFree')}
      </div>
      <TokenPicker
        value={token}
        onChange={(sym) => {
          setToken(sym);
          setAmount('');
        }}
        amounts={avail}
        disabledFor={(sym) => avail[sym] < 0.000001}
      />
      {token === 'SOL' && <div class="hint">{t('allocate.solReserve')}</div>}

      <div style={{ marginTop: 12 }}>
        <AmountInput
          value={amount}
          onInput={setAmount}
          symbol={token}
          decimals={DECIMALS[token]}
          usd={token === 'SOL' && num > 0 ? num * price : null}
          error={tooMuch}
          autoFocus
        />
        {tooMuch ? (
          <div class="hint err">
            {t('allocate.onlyFree', { amount: `${fmtToken(free, token)} ${token}` })}
          </div>
        ) : (
          after != null && (
            <div class="hint ok">
              {after >= 1 ? t('allocate.willComplete') : t('allocate.willFill', { pct: Math.floor(after * 100) })}
            </div>
          )
        )}
      </div>

      <div class="chips" style={{ marginTop: 10 }}>
        {needToken > 0 && needToken <= free && (
          <button class="chip" onClick={() => setAmount(toInput(needToken))}>
            {t('allocate.toGoal', { amount: fmtToken(needToken, token) })}
          </button>
        )}
        {[0.25, 0.5].map((k) => (
          <button
            class="chip"
            key={k}
            onClick={() => setAmount(toInput(floorTo(free * k, DECIMALS[token])))}
            disabled={!free}
          >
            {k * 100}%
          </button>
        ))}
        <button class="chip" onClick={() => setAmount(toInput(free))} disabled={!free}>
          {t('allocate.allFree')}
        </button>
      </div>

      <button class="btn btn-coin block" style={{ marginTop: 16 }} disabled={!valid || busy} onClick={submit}>
        <Icon name="coinIn" />
        {valid ? t('allocate.cta', { amount: `${fmtToken(num, token)} ${token}` }) : t('home.putAside')}
      </button>
      <p class="hint center" style={{ marginTop: 10 }}>
        {t('allocate.note')}
      </p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- smart-contract lock

function LockPanel({ goal }) {
  const s = useAppState();
  const net = s.settings.network;
  const funds = computeFunds(s);
  const usable = (sym) => (sym === 'USDC' || sym === 'USDT') && !!TOKENS[sym].mint[net];
  const [token, setToken] = useState(() => ['USDC', 'USDT'].find((sym) => usable(sym) && funds.free[sym] > 0.000001) || 'USDC');
  const [amount, setAmount] = useState('');
  const [base, setBase] = useState(null); // deposit + network fee, the same for any amount
  const [quoteState, setQuoteState] = useState('loading');
  const [quoteErr, setQuoteErr] = useState('');
  const [ack, setAck] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [sig, setSig] = useState('');
  const num = parseAmount(amount);
  const unlockIso = dateFromUnix(goal.smart.unlockAt);
  const date = fmtDateLong(unlockIso);

  useEffect(() => {
    setQuoteState('loading');
    quoteLock(token, '1')
      .then((q) => {
        setBase(q);
        setQuoteState('ok');
      })
      .catch((e) => {
        setQuoteErr(e?.message || '');
        setQuoteState('error');
      });
  }, [token]);

  const quote = base && num > 0 ? { ...base, totalToken: num } : null;
  const maxAmount = floorTo(funds.free[token] || 0, TOKENS[token].decimals);
  const tooMuchToken = num > (funds.free[token] || 0) + 1e-9;
  const solNeed = base ? base.totalSol + SOL_FEE_RESERVE : 0; // the claim later needs a fee too
  const solShort = !!base && solNeed > funds.free.SOL + 1e-9;
  const busy = stage === 'preparing' || stage === 'confirming';
  const canLock = !!quote && num > 0 && !tooMuchToken && !solShort && ack && !busy;

  async function submit() {
    if (!canLock) return;
    setStage('preparing');
    setError('');
    setSig('');
    try {
      const res = await lockToGoal({
        goalId: goal.id,
        token,
        amount: normalizeAmount(amount),
        quote,
        onStage: (st, sg) => {
          setStage(st);
          if (sg) setSig(sg);
        },
      });
      if (getState().sheet?.name === 'allocate') closeSheet(); // unless the person already moved on
      if (res.completedNow) {
        setTimeout(() => openSheet('goal-done', { goalId: goal.id }), 900);
      } else if (res.milestone) {
        celebrateMilestone(res.milestone, goal.name);
      } else {
        toast(t('smart.lockedToast', { amount: `${fmtTokenExact(num, token)} ${token}`, date }));
      }
    } catch (e) {
      if (e.signature) setSig(e.signature);
      setError(explainSendError(e));
      setStage('error');
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div class="banner smart">
        <Icon name="shield" />
        <div>{t('smart.sheetLead', { date })}</div>
      </div>

      <div class="label" style={{ marginTop: 14 }}>
        {t('allocate.fromFree')}
      </div>
      <TokenPicker
        value={token}
        onChange={(sym) => {
          setToken(sym);
          setAmount('');
        }}
        amounts={funds.free}
        disabledFor={(sym) => !usable(sym)}
      />
      <div class="hint">{t('smart.stablesOnly')}</div>

      <div style={{ marginTop: 12 }}>
        <AmountInput
          value={amount}
          onInput={setAmount}
          symbol={token}
          max={maxAmount}
          onMax={() => setAmount(toInput(maxAmount))}
          maxLabel={t('common.max')}
          error={tooMuchToken}
        />
        {tooMuchToken && <div class="hint err">{t('smart.tooMuch', { amount: `${fmtToken(maxAmount, token)} ${token}` })}</div>}
      </div>

      {base && (
        <div class="kv" style={{ marginTop: 12 }}>
          {quote && (
            <div>
              <span class="k">{t('smart.qLocked')}</span>
              <span class="v num">
                {fmtTokenExact(num, token)} {token}
              </span>
            </div>
          )}
          <div>
            <span class="k">{t('smart.qFee')}</span>
            <span class="v free-fee">{t('smart.noFee')}</span>
          </div>
          <div>
            <span class="k">
              {t('smart.qDeposit')} <span class="refund-tag">{t('smart.qDepositSub')}</span>
            </span>
            <span class="v num">{fmtSol(base.rentSol)} SOL</span>
          </div>
          <div>
            <span class="k">{t('smart.qNetwork')}</span>
            <span class="v num">{fmtSol(base.networkFeeSol)} SOL</span>
          </div>
          {quote && (
            <div>
              <span class="k">{t('smart.qTotal')}</span>
              <span class="v num">
                {fmtTokenExact(quote.totalToken, token)} {token} + {fmtSol(quote.totalSol)} SOL
              </span>
            </div>
          )}
        </div>
      )}
      {base && <div class="hint">{t('smart.depositNote', { date })}</div>}
      {quoteState === 'loading' && !base && <div class="hint">{t('smart.quoteLoading')}</div>}
      {quoteState === 'error' && (
        <div class="banner danger" style={{ marginTop: 10 }}>
          <Icon name="globe" />
          <div>{quoteErr === 'lock-program-missing' ? t('smart.unavailable') : t('smart.quoteError')}</div>
        </div>
      )}
      {solShort && (
        <div class="banner danger" style={{ marginTop: 10 }}>
          <Icon name="alert" />
          <div>{t('smart.solShort', { need: fmtSol(solNeed), have: fmtSol(funds.free.SOL) })}</div>
        </div>
      )}

      <label class="ack">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
        <span>{t('smart.ack', { date })}</span>
      </label>

      {stage === 'error' && (
        <div class="banner danger" style={{ marginTop: 10 }}>
          <Icon name="alert" />
          <div>
            {error}
            {sig && (
              <div class="actions">
                <a class="link-btn" href={explorerTx(sig, net)} target="_blank" rel="noreferrer">
                  {t('send.viewSolscan')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <button class="btn btn-coin block" style={{ marginTop: 14 }} disabled={!canLock} onClick={submit}>
        {busy ? <div class="spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} /> : <Icon name="lock" />}
        {stage === 'preparing' ? t('smart.preparing') : stage === 'confirming' ? t('smart.confirming') : t('smart.lockUntil', { date })}
      </button>
      <p class="hint center" style={{ marginTop: 10 }}>
        {t('smart.footnote')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- release

function ReleaseSheet({ params }) {
  const s = useAppState();
  const net = s.settings.network;
  const goal = s.goals.find((g) => g.id === params.goalId);
  const alloc = goal ? goalAlloc(goal, net) : {};
  const p = goal ? goalProgress(goal, s.prices, net) : 0;
  const protectedGoal = !!goal && isProtected(goal, s.prices, net);
  const [token, setToken] = useState(() => ['USDC', 'USDT', 'SOL'].find((sym) => alloc[sym] > 0) || 'USDC');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  if (!goal) return null;
  const max = alloc[token] || 0;
  const num = parseAmount(amount);
  const tooMuch = num > max + 1e-9;
  const valid = num > 0 && !tooMuch;

  if (protectedGoal) {
    // A protected goal keeps its money until it is reached: no word to type, no way around it here.
    const saved = goalSavedUsd(goal, s.prices, net);
    return (
      <Sheet title={t('guard.title')}>
        <div class="guard-art" aria-hidden="true">
          <div class="guard-jar">
            <Jar level={p} color={goal.color} emoji={goal.emoji} />
          </div>
          <span class="guard-lock">
            <Icon name="lock" />
          </span>
        </div>
        <p class="muted" style={{ marginTop: 0, textAlign: 'center' }}>
          {t('guard.text', { goal: goal.name, target: fmtUsd(goal.target) })}
        </p>
        <div class="guard-progress">
          <div class="bar">
            <i style={{ width: `${Math.max(2, Math.min(100, p * 100))}%`, background: (GOAL_COLORS[goal.color] || GOAL_COLORS.coin).fill }} />
          </div>
          <div class="guard-nums num">
            <span>{fmtUsd(saved)}</span>
            <span>{t('guard.left', { left: fmtUsd(Math.max(0, goal.target - saved)) })}</span>
          </div>
        </div>
        <p class="hint" style={{ textAlign: 'center' }}>
          {t('guard.yours')}
        </p>
        <div class="onb-foot">
          <button class="btn btn-coin block" onClick={() => openSheet('allocate', { goalId: goal.id })}>
            <Icon name="coinIn" />
            {t('guard.addMore')}
          </button>
          <button class="btn btn-ghost block" onClick={closeSheet}>
            {t('guard.ok')}
          </button>
        </div>
      </Sheet>
    );
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    await release(goal.id, token, num);
    closeSheet();
    toast(t('release.done', { amount: `${fmtToken(num, token)} ${token}` }));
  }

  return (
    <Sheet title={t('release.title', { goal: goal.name })}>
      <TokenPicker
        value={token}
        onChange={(sym) => {
          setToken(sym);
          setAmount('');
        }}
        amounts={alloc}
        disabledFor={(sym) => !(alloc[sym] > 0)}
      />
      <div style={{ marginTop: 12 }}>
        <AmountInput
          value={amount}
          onInput={setAmount}
          symbol={token}
          max={max}
          onMax={() => setAmount(toInput(max))}
          error={tooMuch}
          autoFocus
          usd={token === 'SOL' && num > 0 ? num * priceOf(s.prices, 'SOL') : null}
        />
        {tooMuch && (
          <div class="hint err">
            {t('release.onlyInGoal', { amount: `${fmtToken(max, token)} ${token}` })}
          </div>
        )}
      </div>
      <button class="btn btn-primary block" style={{ marginTop: 16 }} disabled={!valid || busy} onClick={submit}>
        {valid ? t('release.cta', { amount: `${fmtToken(num, token)} ${token}` }) : t('goals.takeOut')}
      </button>
      <p class="hint center" style={{ marginTop: 10 }}>
        {t('release.note')}
      </p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- misc

function GoalDoneSheet({ params }) {
  const s = useAppState();
  const goal = s.goals.find((g) => g.id === params.goalId);
  // confetti as the sheet comes up, and once more when the lock springs open
  useEffect(() => {
    if (!goal) return undefined;
    fireConfetti();
    if (!goal.locked || goal.smart) return undefined;
    const id = setTimeout(fireSparkles, 1150);
    return () => clearTimeout(id);
  }, []);
  if (!goal) return null;
  const net = s.settings.network;
  const amount = fmtUsd(goalSavedUsd(goal, s.prices, net));
  const unlocked = goal.locked && !goal.smart; // "lock until reached" has just come off
  const text = goal.smart
    ? t('done.smartText', { goal: goal.name, amount, date: fmtDateLong(dateFromUnix(goal.smart.unlockAt || 0)) })
    : unlocked
      ? t('done.unlockedText', { goal: goal.name, amount })
      : t('done.text', { goal: goal.name, amount });
  return (
    <Sheet title="">
      <div class="center">
        <div class="done-art" style={{ width: 110, margin: '0 auto' }}>
          <Jar level={1} color={goal.color} emoji={goal.emoji} interactive />
          {unlocked && (
            <span class="done-lock" aria-hidden="true">
              <Icon name="lock" class="closed" />
              <Icon name="unlock" class="open" />
            </span>
          )}
        </div>
        <h2 class="h1" style={{ marginTop: 12 }}>
          {t('done.title')}
        </h2>
        {unlocked && (
          <div class="done-free">
            <Icon name="unlock" size={15} />
            {t('done.lockOff')}
          </div>
        )}
        <p class="muted">{text}</p>
        <div class="onb-foot">
          <button class="btn btn-coin block" onClick={closeSheet}>
            {t('done.yay')}
          </button>
          {unlocked && goalHoldsMoney(goal, net) ? (
            <button class="btn btn-ghost block" onClick={() => openSheet('release', { goalId: goal.id })}>
              <Icon name="minus" />
              {t('done.takeOut')}
            </button>
          ) : (
            <button class="btn btn-ghost block" onClick={() => navigate('goal-edit')}>
              {t('done.newGoal')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function DeleteGoalSheet({ params }) {
  const s = getState();
  const goal = s.goals.find((g) => g.id === params.id);
  if (!goal) return null;
  const net = s.settings.network;
  if (['mainnet', 'devnet'].some((n) => hasActiveLocks(goal, n))) {
    return (
      <Sheet title={t('delGoal.title')}>
        <p class="muted" style={{ marginTop: 0 }}>
          {t('delGoal.hasLocks', { goal: goal.name, date: fmtDateLong(dateFromUnix(goal.smart?.unlockAt || 0)) })}
        </p>
        <button class="btn btn-soft block" onClick={closeSheet}>
          {t('common.close')}
        </button>
      </Sheet>
    );
  }
  const softProtected = isProtected(goal, s.prices, net) && goalHoldsMoney(goal, net);
  if (softProtected) {
    return (
      <Sheet title={t('delGoal.title')}>
        <div class="banner">
          <Icon name="lock" />
          <div>{t('delGoal.protected', { goal: goal.name, target: fmtUsd(goal.target) })}</div>
        </div>
        <button class="btn btn-soft block" style={{ marginTop: 14 }} onClick={closeSheet}>
          {t('common.close')}
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet title={t('delGoal.title')}>
      <p class="muted" style={{ marginTop: 0 }}>
        {t('delGoal.text', { goal: goal.name })}
      </p>
      <div class="onb-foot">
        <button
          class="btn btn-danger block"
          onClick={async () => {
            try {
              await deleteGoal(goal.id);
              replace('goals');
              toast(t('goals.deleted'));
            } catch (e) {
              toast(explainSendError(e), 'err');
            }
          }}
        >
          {t('goals.delete')}
        </button>
        <button class="btn btn-ghost block" onClick={closeSheet}>
          {t('common.cancel')}
        </button>
      </div>
    </Sheet>
  );
}

function ForgotSheet() {
  return (
    <Sheet title={t('unlock.forgot')}>
      <p class="muted" style={{ marginTop: 0 }}>
        {t('forgot.text')}
      </p>
      <div class="banner warn">
        <Icon name="alert" />
        <div>{t('forgot.warn')}</div>
      </div>
      <div class="onb-foot">
        <button class="btn btn-danger block" onClick={() => openSheet('reset')}>
          {t('forgot.reset')}
        </button>
        <button class="btn btn-ghost block" onClick={closeSheet}>
          {t('forgot.remember')}
        </button>
      </div>
    </Sheet>
  );
}

function ResetSheet() {
  const [word, setWord] = useState('');
  const ok = matches(word, inAllLangs('reset.word').map((w) => w.toLowerCase()));
  return (
    <Sheet title={t('reset.title')}>
      <p class="muted" style={{ marginTop: 0 }}>
        {t('reset.text')}
      </p>
      <label class="label" for="reset-word">
        {t('reset.confirm')}
      </label>
      <div class="field">
        <input id="reset-word" value={word} onInput={(e) => setWord(e.currentTarget.value)} placeholder={t('reset.word')} autoFocus />
      </div>
      <div class="onb-foot">
        <button class="btn btn-danger block" disabled={!ok} onClick={resetWallet}>
          <Icon name="trash" />
          {t('reset.cta')}
        </button>
        <button class="btn btn-ghost block" onClick={closeSheet}>
          {t('common.cancel')}
        </button>
      </div>
    </Sheet>
  );
}

export function SheetHost() {
  const { sheet } = useAppState();
  const host = useRef(null);
  const had = useRef(false);
  // a closing sheet slides away instead of vanishing
  if (had.current && !sheet) exitGhost(host.current?.querySelector(':scope > :not(.leaving)'), 260);
  // a new sheet takes the stage at once
  if (!had.current && sheet) host.current?.querySelectorAll(':scope > .leaving').forEach((n) => n.remove());
  had.current = !!sheet;
  return (
    <div class="sheet-host" ref={host}>
      {sheet ? <SheetFor sheet={sheet} /> : null}
    </div>
  );
}

function SheetFor({ sheet }) {
  const params = sheet.params || {};
  switch (sheet.name) {
    case 'allocate':
      return <AllocateSheet params={params} key={JSON.stringify(params)} />;
    case 'release':
      return <ReleaseSheet params={params} />;
    case 'goal-done':
      return <GoalDoneSheet params={params} />;
    case 'delete-goal':
      return <DeleteGoalSheet params={params} />;
    case 'forgot':
      return <ForgotSheet />;
    case 'reset':
      return <ResetSheet />;
    case 'skip-backup':
      return (
        <Sheet title={t('skip.title')}>
          <SkipBackupSheet />
        </Sheet>
      );
    default:
      return null;
  }
}
