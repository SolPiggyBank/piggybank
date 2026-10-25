import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Jar, GOAL_COLORS } from '../components/Jar.jsx';
import { Icon } from '../components/icons.jsx';
import { TokenIcon } from '../components/TokenIcon.jsx';
import { TabBar, TopBar, Empty, Toggle, Collapse } from '../components/ui.jsx';
import { MainHeader, GoalTile, CountUpProgress, useAnimatedNumber } from './Home.jsx';
import { useDragScroll } from '../components/useDragScroll.js';
import { useAppState, navigate, back, openSheet, toast, getState } from '../store.js';
import { saveGoal, syncGoalLocks, withdrawGoalLock, quoteLock } from '../actions.js';
import { explainSendError } from '../lib/errors.js';
import { streamflowUrl, explorerAccount, unlockAtFromDate, dateFromUnix } from '../lib/config.js';
import { goalSavedUsd, goalProgress, goalAlloc, savingPace, goalLocks, smartOpen, hasActiveLocks, isProtected } from '../lib/goals-math.js';
import { fmtUsd, fmtToken, fmtDaysLeft, fmtDateLong, parseAmount, daysLeft, fmtDate, fmtDays, toInput, fmtSol, barWidth } from '../lib/format.js';
import { t, tn } from '../i18n.js';

const TEMPLATE_DEFS = [
  { key: 'trip', emoji: '🏝️', color: 'sky' },
  { key: 'phone', emoji: '📱', color: 'plum' },
  { key: 'safety', emoji: '🛡️', color: 'mint' },
  { key: 'laptop', emoji: '💻', color: 'sky' },
  { key: 'gift', emoji: '🎁', color: 'berry' },
  { key: 'car', emoji: '🚗', color: 'tangerine' },
  { key: 'study', emoji: '🎓', color: 'coin' },
];

/** Starter goals, named in the current language. */
export function goalTemplates() {
  return TEMPLATE_DEFS.map((d) => ({ ...d, name: t(`tpl.${d.key}`) }));
}

const EMOJIS = ['🎯', '🏝️', '✈️', '📱', '💻', '🚗', '🏠', '🛡️', '🎓', '🎁', '💍', '🎮', '🚲', '🐶', '👶', '🎸', '📷', '⌚', '🛋️', '🏥', '💰', '🌍', '🎄', '⭐'];

// ---------------------------------------------------------------- goals tab

export function Goals() {
  const s = useAppState();
  const net = s.settings.network;
  const goals = s.goals.filter((g) => !g.archived);
  const active = goals.filter((g) => goalProgress(g, s.prices, net) < 1);
  const done = goals.filter((g) => goalProgress(g, s.prices, net) >= 1);
  const saved = goals.reduce((sum, g) => sum + goalSavedUsd(g, s.prices, net), 0);
  const target = goals.reduce((sum, g) => sum + (g.target || 0), 0);
  const hide = s.settings.hideBalances;

  return (
    <div class="screen">
      <MainHeader />
      <div class="scroll">
        <div class="pad">
          {goals.length === 0 ? (
            <>
              <Empty
                art={
                  <div style={{ width: 90, margin: '0 auto' }}>
                    <Jar level={0} emoji="🎯" />
                  </div>
                }
                title={t('goals.emptyTitle')}
                text={t('goals.emptyText')}
                action={
                  <button class="btn btn-coin" onClick={() => navigate('goal-edit')}>
                    <Icon name="plus" />
                    {t('goals.setGoal')}
                  </button>
                }
              />
              <div class="list-group-title">{t('goals.ideas')}</div>
              <div class="chips">
                {goalTemplates().map((tpl) => (
                  <button class="chip" key={tpl.key} onClick={() => navigate('goal-edit', { template: tpl })}>
                    {tpl.emoji} {tpl.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '6px 0 2px' }}>
                <div class="h1 num">{hide ? '••••' : fmtUsd(saved)}</div>
                <div class="muted small">
                  {t('goals.summary', {
                    target: hide ? '••••' : fmtUsd(target, { round: true }),
                    count: tn('unit.goals', goals.length),
                  })}
                </div>
                <div class="progress-row">
                  <div class="bar">
                    <i style={{ width: barWidth(target ? saved / target : 0), background: 'var(--coin)' }} />
                  </div>
                  <span class="pct num">
                    <CountUpProgress value={target ? Math.min(1, saved / target) : 0} />
                  </span>
                </div>
              </div>
              <div class="section-head">
                <h2 class="h2">{t('goals.saving')}</h2>
              </div>
              <div class="jar-grid">
                {active.map((g) => (
                  <GoalTile key={g.id} goal={g} prices={s.prices} net={net} hide={hide} />
                ))}
                <button class="jar-tile new" onClick={() => navigate('goal-edit')}>
                  <span class="plus-circle">
                    <Icon name="plus" />
                  </span>
                  {t('goals.new')}
                </button>
              </div>
              {done.length > 0 && (
                <>
                  <div class="section-head">
                    <h2 class="h2">{t('goals.done')}</h2>
                  </div>
                  <div class="jar-grid">
                    {done.map((g) => (
                      <GoalTile key={g.id} goal={g} prices={s.prices} net={net} hide={hide} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <div style={{ height: 18 }} />
        </div>
      </div>
      <TabBar active="goals" />
    </div>
  );
}

// ---------------------------------------------------------------- goal detail

function LockRow({ goal, lock, net, hide }) {
  const [busy, setBusy] = useState(false);
  const nowSec = Date.now() / 1000;
  const unlocked = nowSec >= lock.unlockAt;
  const iso = dateFromUnix(lock.unlockAt);
  let sub;
  if (lock.status === 'pending') sub = t('smart.pending');
  else if (lock.status === 'withdrawing') sub = t('smart.withdrawing');
  else if (unlocked) sub = t('smart.ready');
  else sub = t('smart.until', { date: fmtDateLong(iso), left: fmtDaysLeft(iso) });

  async function withdraw() {
    setBusy(true);
    try {
      await withdrawGoalLock({ goalId: goal.id, lockId: lock.id });
      toast(t('smart.withdrawnToast', { amount: `${fmtToken(lock.amount, lock.token)} ${lock.token}` }));
    } catch (e) {
      toast(explainSendError(e), 'err');
    }
    setBusy(false);
  }

  return (
    <div class="list-row">
      <span class={`glyph lock-glyph${unlocked ? ' open' : ''}`}>
        {lock.status === 'pending' || lock.status === 'withdrawing' || busy ? (
          <div class="spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} />
        ) : (
          <Icon name={unlocked ? 'unlock' : 'lock'} />
        )}
      </span>
      <div class="grow">
        <div class="t num">{hide ? '••••' : `${fmtToken(lock.amount, lock.token)} ${lock.token}`}</div>
        <div class="s wrap">{sub}</div>
      </div>
      {lock.status === 'locked' && unlocked ? (
        <button class="btn btn-coin sm" onClick={withdraw} disabled={busy}>
          {t('smart.withdraw')}
        </button>
      ) : (
        <a
          class="icon-btn"
          href={lock.provider === 'jupiter' ? explorerAccount(lock.id, net) : streamflowUrl(lock.id, net)}
          target="_blank"
          rel="noreferrer"
          aria-label={lock.provider === 'jupiter' ? t('smart.openExplorer') : t('smart.openStreamflow')}
          title={lock.provider === 'jupiter' ? t('smart.openExplorer') : t('smart.openStreamflow')}
        >
          <Icon name="external" />
        </a>
      )}
    </div>
  );
}

export function GoalDetail({ params }) {
  const s = useAppState();
  const goal = s.goals.find((g) => g.id === params.id);
  const net = s.settings.network;
  // hooks before the early return below (the goal may get deleted while open)
  const savedShown = useAnimatedNumber(goal ? goalSavedUsd(goal, s.prices, net) : 0, 900, { fromZero: true });

  useEffect(() => {
    if (goal?.smart && s.unlocked) syncGoalLocks(params.id).catch(() => {});
  }, [params.id, net]);

  if (!goal) {
    return (
      <div class="screen">
        <TopBar title={t('goals.goal')} />
        <Empty art="🫙" title={t('goals.deleted')} action={<button class="btn btn-soft" onClick={back}>{t('common.back')}</button>} />
      </div>
    );
  }
  const hide = s.settings.hideBalances;
  const p = goalProgress(goal, s.prices, net);
  const saved = goalSavedUsd(goal, s.prices, net);
  const left = Math.max(0, goal.target - saved);
  const alloc = goalAlloc(goal, net);
  const pace = savingPace(goal, s.prices, net);
  const dl = daysLeft(goal.deadline);
  const isSmart = !!goal.smart;
  const locks = goalLocks(goal, net).filter((l) => l.status !== 'withdrawn');
  const unlockIso = isSmart ? dateFromUnix(goal.smart.unlockAt) : null;
  const history = s.activity.filter(
    (a) => a.goalId === goal.id && ['allocate', 'release', 'lock', 'unlock'].includes(a.type) && a.network === net,
  );
  const hasMoney = Object.values(alloc).some((v) => v > 0);
  const histIcon = { allocate: 'coinIn', release: 'minus', lock: 'lock', unlock: 'unlock' };
  const histTitle = { allocate: t('goals.added'), release: t('goals.taken'), lock: t('smart.lockedEntry'), unlock: t('smart.unlockedEntry') };

  return (
    <div class="screen">
      <TopBar
        title={goal.name}
        right={
          <button class="icon-btn" onClick={() => navigate('goal-edit', { id: goal.id })} aria-label={t('goals.edit')}>
            <Icon name="edit" />
          </button>
        }
      />
      <div class="scroll">
        <div class="goal-hero">
          <div style={{ width: 150, margin: '0 auto' }}>
            <Jar level={p} color={goal.color} emoji={goal.emoji} big fillIn dropKey={s.dropKey} interactive />
          </div>
          <div class="saved num">{hide ? '••••' : fmtUsd(savedShown)}</div>
          <div class="of">{t('goals.of', { target: fmtUsd(goal.target) })}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {p >= 1 && (
              <span class="done-badge">
                <Icon name="check" size={15} />
                {t('goals.reached')}
              </span>
            )}
            {isSmart && (
              <span class="smart-badge">
                <Icon name="shield" />
                {smartOpen(goal) ? t('smart.badge', { date: fmtDateLong(unlockIso) }) : t('smart.badgeOpen', { date: fmtDateLong(unlockIso) })}
              </span>
            )}
            {!isSmart && isProtected(goal, s.prices, net) && (
              <span class="lock-badge">
                <Icon name="lock" />
                {t('goals.protected')}
              </span>
            )}
            {!isSmart && goal.locked && p < 1 && goal.reachedAt?.[net] && hasMoney && (
              <span class="lock-badge open">
                <Icon name="unlock" />
                {t('goals.lockOff')}
              </span>
            )}
          </div>
        </div>
        <div class="pad">
          <div class="stat-row">
            <div>
              <div class="k">{t('goals.progress')}</div>
              <div class="v num">
                <CountUpProgress value={p} />
              </div>
            </div>
            <div>
              <div class="k">{t('goals.left')}</div>
              <div class="v num">{hide ? '••' : fmtUsd(left, { round: left >= 100 })}</div>
            </div>
            <div>
              <div class="k">{t('goals.deadline')}</div>
              <div class="v">{goal.deadline ? (dl < 0 ? t('goals.deadlinePassed') : fmtDays(dl)) : t('goals.noDeadline')}</div>
            </div>
          </div>

          {pace && pace.amount > 0 && (
            <div class="banner" style={{ marginTop: 10 }}>
              <Icon name="clock" />
              <div>
                {t(pace.per === 'day' ? 'goals.paceDay' : 'goals.pace', {
                  date: fmtDateLong(goal.deadline),
                  amount: fmtUsd(pace.amount, { round: pace.amount >= 10 }),
                })}
              </div>
            </div>
          )}

          <div class="actions-row" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
            <button class="btn btn-coin" onClick={() => openSheet('allocate', { goalId: goal.id })}>
              <Icon name={isSmart && smartOpen(goal) ? 'lock' : 'coinIn'} />
              {isSmart && smartOpen(goal) ? t('smart.lockCta') : t('home.putAside')}
            </button>
            <button class="btn btn-soft" onClick={() => openSheet('release', { goalId: goal.id })} disabled={!hasMoney}>
              <Icon name={isProtected(goal, s.prices, net) ? 'lock' : 'minus'} />
              {t('goals.takeOut')}
            </button>
          </div>

          {isSmart && (
            <>
              <div class="list-group-title">{t('smart.section')}</div>
              {locks.length === 0 ? (
                <div class="banner">
                  <Icon name="shield" />
                  <div>{smartOpen(goal) ? t('smart.noLocks', { date: fmtDateLong(unlockIso) }) : t('smart.closedNote')}</div>
                </div>
              ) : (
                <div class="list">
                  {locks.map((l) => (
                    <LockRow key={l.id} goal={goal} lock={l} net={net} hide={hide} />
                  ))}
                </div>
              )}
            </>
          )}

          {hasMoney && (
            <>
              <div class="list-group-title">{isSmart ? t('smart.inWallet') : t('goals.inside')}</div>
              <div class="token-list">
                {['USDC', 'USDT', 'SOL']
                  .filter((sym) => alloc[sym] > 0)
                  .map((sym) => (
                    <div class="token-row" key={sym}>
                      <TokenIcon symbol={sym} />
                      <div class="meta">
                        <div class="name">{sym}</div>
                      </div>
                      <div class="amt">
                        <div class="num">{hide ? '••••' : fmtToken(alloc[sym], sym)}</div>
                        <div class="sub num">{hide ? '' : fmtUsd(alloc[sym] * (s.prices[sym] ?? (sym === 'SOL' ? 0 : 1)))}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}

          <div class="list-group-title">{t('goals.history')}</div>
          {history.length === 0 ? (
            <div class="banner">
              <Icon name="info" />
              <div>{t('goals.historyEmpty')}</div>
            </div>
          ) : (
            <div class="list">
              {history.slice(0, 30).map((a, i) => {
                const plus = a.type === 'allocate' || a.type === 'lock';
                // unlocking moves money from the contract to the wallet: it stays in the goal
                const sign = a.type === 'unlock' ? '' : plus ? '+' : '−';
                return (
                  <div class="list-row rise" key={a.id} style={{ '--i': Math.min(i, 10) }}>
                    <span class={`glyph${plus ? ' in' : ''}`}>
                      <Icon name={histIcon[a.type]} />
                    </span>
                    <div class="grow">
                      <div class="t">{histTitle[a.type]}</div>
                      <div class="s">{a.type === 'unlock' ? `${fmtDate(a.ts)} · ${t('smart.unlockedSub')}` : fmtDate(a.ts)}</div>
                    </div>
                    <div class={`val num${plus ? ' in' : ''}`}>
                      {sign}
                      {hide ? '••••' : fmtToken(a.amount, a.token)} {a.token}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- goal editor

function addMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return dateFromUnix(Math.floor(d.getTime() / 1000));
}

function SmartCard({ on, onChange, fixed, date }) {
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState('');
  useEffect(() => {
    if (!on || quote) return;
    quoteLock('USDC', '100')
      .then(setQuote)
      .catch((e) => setQuoteErr(e?.message || 'error'));
  }, [on]);
  return (
    <div class={`smart-card${on ? ' on' : ''}`}>
      <div class="smart-head">
        <span class="smart-ico">
          <Icon name="shield" />
        </span>
        <div class="grow">
          <div class="t">{t('smart.title')}</div>
          <div class="s">{t('smart.subtitle')}</div>
        </div>
        <Toggle on={on} onChange={onChange} label={t('smart.title')} disabled={fixed} />
      </div>
      <Collapse open={on}>
        <ul class="smart-points">
          <li>
            <Icon name="lock" />
            <span>{date ? t('smart.p1', { date: fmtDateLong(date) }) : t('smart.p1NoDate')}</span>
          </li>
          <li>
            <Icon name="shield" />
            <span>{t('smart.p2')}</span>
          </li>
          <li>
            <Icon name="coinIn" />
            <span>{t('smart.p3')}</span>
          </li>
          <li>
            <Icon name="info" />
            <span>
              {quote
                ? t('smart.p4', { sol: fmtSol(quote.rentSol) })
                : quoteErr === 'lock-program-missing'
                  ? t('smart.unavailable')
                  : quoteErr
                    ? t('smart.p4Unknown')
                    : t('smart.p4Loading')}
            </span>
          </li>
        </ul>
      </Collapse>
      {fixed && <div class="hint">{t('smart.fixed')}</div>}
    </div>
  );
}

export function GoalEdit({ params }) {
  const s = getState();
  const tplRef = useDragScroll();
  const net = s.settings.network;
  const existing = params.id ? s.goals.find((g) => g.id === params.id) : null;
  const tpl = params.template || {};
  const [name, setName] = useState(existing?.name || tpl.name || '');
  const [target, setTarget] = useState(existing ? toInput(existing.target) : '');
  const [deadline, setDeadline] = useState(existing?.smart ? dateFromUnix(existing.smart.unlockAt) : existing?.deadline || '');
  const [emoji, setEmoji] = useState(existing?.emoji || tpl.emoji || '🎯');
  const [color, setColor] = useState(existing?.color || tpl.color || 'coin');
  const [locked, setLocked] = useState(existing?.locked || false);
  const [smart, setSmart] = useState(!!existing?.smart);
  const [busy, setBusy] = useState(false);
  const jarRef = useRef(null);
  const firstLook = useRef(true);
  // the preview jar hops whenever its icon or colour changes
  useEffect(() => {
    if (firstLook.current) {
      firstLook.current = false;
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    jarRef.current?.animate?.(
      [
        { transform: 'none' },
        { transform: 'translateY(-6px) scale(1.08) rotate(-4deg)', offset: 0.35 },
        { transform: 'translateY(1px) scale(0.98, 1.02)', offset: 0.7 },
        { transform: 'none' },
      ],
      { duration: 480, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' },
    );
  }, [emoji, color]);
  const targetNum = parseAmount(target);
  const today = dateFromUnix(Math.floor(Date.now() / 1000));
  const tomorrow = dateFromUnix(Math.floor(Date.now() / 1000) + 86400);

  // Once money is in the smart contract, the unlock date can't change.
  const smartFixed = !!existing?.smart && (goalLocks(existing, 'mainnet').length > 0 || goalLocks(existing, 'devnet').length > 0);
  // A soft-locked goal can't be unlocked by editing: no turning the lock off, no lowering the target.
  const softProtected = !!existing && isProtected(existing, s.prices, net) && Object.values(goalAlloc(existing, net)).some((v) => v > 0);
  const targetTooLow = softProtected && targetNum < existing.target;
  // Switching an existing goal that already holds money to smart mode would
  // quietly drop its soft lock, so the option is offered only for empty goals.
  const hasSoftMoney = !!existing && Object.values(goalAlloc(existing, net)).some((v) => v > 0);
  const showSmartCard = !existing || !!existing.smart || !hasSoftMoney;
  const dateOk = !smart || smartFixed || (deadline && deadline >= tomorrow);
  const valid = name.trim().length > 0 && targetNum > 0 && targetNum < 1e9 && dateOk && !targetTooLow;

  const pace = useMemo(() => {
    if (!(targetNum > 0) || !deadline) return null;
    const draft = { target: targetNum, deadline, allocations: existing?.allocations || {}, locks: existing?.locks || {} };
    return savingPace(draft, s.prices, net);
  }, [targetNum, deadline]);

  function applyTemplate(tplItem) {
    setName(tplItem.name);
    setEmoji(tplItem.emoji);
    setColor(tplItem.color);
  }

  function toggleSmart(v) {
    setSmart(v);
    if (v && (!deadline || deadline < tomorrow)) setDeadline(addMonths(6));
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const smartValue = smart
      ? smartFixed
        ? existing.smart
        : { provider: 'jupiter', unlockAt: unlockAtFromDate(deadline) }
      : null;
    const goal = await saveGoal({
      ...(existing ? { id: existing.id } : {}),
      name: name.trim().slice(0, 40),
      target: Math.round(targetNum * 100) / 100,
      deadline: deadline || null,
      emoji,
      color,
      locked: smart ? false : softProtected ? true : locked,
      smart: smartValue,
    });
    toast(existing ? t('goals.savedToast') : t('goals.createdToast'));
    back();
    if (!existing) navigate('goal', { id: goal.id });
  }

  const dateChips = [
    ...(smart ? [] : [[t('goals.noDeadlineChip'), '']]),
    [t('goals.months3'), addMonths(3)],
    [t('goals.months6'), addMonths(6)],
    [t('goals.year'), addMonths(12)],
  ];

  return (
    <div class="screen">
      <TopBar
        title={existing ? t('goals.edit') : t('goals.new')}
        right={
          existing && (
            <button class="icon-btn" onClick={() => openSheet('delete-goal', { id: existing.id })} aria-label={t('goals.delete')}>
              <Icon name="trash" />
            </button>
          )
        }
      />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 18 }}>
          {!existing && (
            <div class="chips scroll-x" style={{ marginBottom: 14 }} ref={tplRef}>
              {goalTemplates().map((tplItem) => (
                <button key={tplItem.key} class={`chip${name === tplItem.name ? ' on' : ''}`} onClick={() => applyTemplate(tplItem)}>
                  {tplItem.emoji} {tplItem.name}
                </button>
              ))}
            </div>
          )}

          <div class="preview-jar">
            <div class="preview-jar-ico" ref={jarRef}>
              <Jar level={0.35} color={color} emoji={emoji} interactive />
            </div>
            <div style={{ minWidth: 0 }}>
              <div class="h2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name.trim() || t('goals.namePlaceholder')}
              </div>
              <div class="muted small num">
                {targetNum > 0 ? fmtUsd(targetNum) : t('goals.noAmount')}
                {deadline ? ` ${t('goals.byDate', { date: fmtDateLong(deadline) })}` : ''}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label class="label" for="g-name">
              {t('goals.whatFor')}
            </label>
            <div class="field">
              <input
                id="g-name"
                value={name}
                maxLength={40}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder={t('goals.namePh')}
                autoFocus={!existing && !tpl.name}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label class="label" for="g-target">
              {t('goals.howMuch')}
            </label>
            <div class={`field${(target && !(targetNum > 0)) || targetTooLow ? ' error' : ''}`}>
              <input
                id="g-target"
                inputMode="decimal"
                value={target}
                onInput={(e) => setTarget(e.currentTarget.value.replace(/[^\d.,\s]/g, ''))}
                placeholder="1000"
              />
              <span class="unit">$</span>
            </div>
            <div class={`hint${targetTooLow ? ' err' : ''}`}>
              {targetTooLow ? t('goals.cantLower', { target: fmtUsd(existing.target) }) : t('goals.usdHint')}
            </div>
          </div>

          {showSmartCard && <SmartCard on={smart} onChange={toggleSmart} fixed={smartFixed} date={smart ? deadline : ''} />}

          <div style={{ marginTop: 14 }}>
            <label class="label" for="g-date">
              {smart ? t('smart.unlockDate') : t('goals.byWhen')}
            </label>
            {!smartFixed && (
              <div class="chips" style={{ marginBottom: 8 }}>
                {dateChips.map(([label, v]) => (
                  <button key={label} class={`chip${deadline === v ? ' on' : ''}`} onClick={() => setDeadline(v)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div class={`field${smart && !dateOk ? ' error' : ''}`}>
              <input
                id="g-date"
                type="date"
                min={smart ? tomorrow : today}
                value={deadline}
                disabled={smartFixed}
                onInput={(e) => setDeadline(e.currentTarget.value)}
              />
            </div>
            {smart && !dateOk && <div class="hint err">{t('smart.needDate')}</div>}
            {pace && pace.amount > 0 && (
              <div class="hint ok">
                {t(pace.per === 'day' ? 'goals.paceHintDay' : 'goals.paceHint', {
                  amount: fmtUsd(pace.amount, { round: pace.amount >= 10 }),
                  left: fmtDaysLeft(deadline),
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <div class="label">{t('goals.icon')}</div>
            <div class="emoji-grid" role="radiogroup" aria-label={t('goals.icon')}>
              {EMOJIS.map((e) => (
                <button key={e} class={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)} role="radio" aria-checked={emoji === e}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div class="label">{t('goals.color')}</div>
            <div class="color-row" role="radiogroup" aria-label={t('goals.color')}>
              {Object.entries(GOAL_COLORS).map(([k, c]) => (
                <button
                  key={k}
                  class={color === k ? 'on' : ''}
                  style={{ background: c.fill }}
                  onClick={() => setColor(k)}
                  role="radio"
                  aria-checked={color === k}
                  aria-label={t(`color.${k}`)}
                />
              ))}
            </div>
          </div>

          {!smart && (
            <div class="list" style={{ marginTop: 18 }}>
              <div class="set-row">
                <Icon name="lock" class="ico" />
                <div class="grow">
                  <div class="t">{t('goals.lockTitle')}</div>
                  <div class="s">{softProtected ? t('goals.lockFixed') : t('goals.lockText')}</div>
                </div>
                <Toggle on={softProtected || locked} onChange={setLocked} label={t('goals.lockTitle')} disabled={softProtected} />
              </div>
              <Collapse open={locked && !softProtected}>
                <div class="set-row lock-warn">
                  <Icon name="alert" class="ico" />
                  <div class="grow s">{t('goals.lockWarn')}</div>
                </div>
              </Collapse>
            </div>
          )}

          <button class="btn btn-primary block" style={{ marginTop: 18 }} disabled={!valid || busy} onClick={submit}>
            {existing ? t('common.save') : t('goals.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
