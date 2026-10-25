import { useEffect, useRef, useState } from 'preact/hooks';
import { Pig, PigFace } from '../components/Pig.jsx';
import { Jar, GOAL_COLORS } from '../components/Jar.jsx';
import { Icon } from '../components/icons.jsx';
import { TokenIcon } from '../components/TokenIcon.jsx';
import { TabBar, copyText, useInterval, Collapse } from '../components/ui.jsx';
import { useAppState, navigate, openSheet } from '../store.js';
import { computeFunds, refresh, lock, dismissDeposit, fixShortfall, updateSettings } from '../actions.js';
import { goalSavedUsd, goalProgress } from '../lib/goals-math.js';
import { fmtUsd, fmtToken, shortAddr, fmtDaysLeft, fmtProgress, barWidth } from '../lib/format.js';
import { TOKENS } from '../lib/config.js';
import { t } from '../i18n.js';
import { resolveTheme } from '../theme.js';
import { useDragScroll } from '../components/useDragScroll.js';

/** Eases a number towards `value`; `fromZero` also counts up when the screen opens. */
export function useAnimatedNumber(value, duration = 700, { fromZero = false } = {}) {
  const [shown, setShown] = useState(fromZero ? 0 : value);
  const cur = useRef(fromZero ? 0 : value); // what is on screen right now, even mid-animation
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(cur.current)) {
      setShown(value);
      cur.current = value;
      return;
    }
    const start = performance.now();
    const a = cur.current;
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = a + (value - a) * e;
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** A balance that rolls to its new value and glows green (in) or pink (out) when it changes. */
function TokenAmount({ sym, bal, usd, hide, loading }) {
  const shownBal = useAnimatedNumber(bal, 900);
  const shownUsd = useAnimatedNumber(usd, 900);
  const seen = useRef(loading ? null : bal);
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (loading) return;
    if (seen.current === null) {
      seen.current = bal; // first real balance: nothing to compare with
      return;
    }
    const diff = bal - seen.current;
    seen.current = bal;
    if (Math.abs(diff) > 1e-12) setFlash({ dir: diff > 0 ? 'up' : 'down', n: Date.now() });
  }, [bal, loading]);
  return (
    <div class="amt">
      <div key={flash?.n} class={`num${loading ? ' skeleton' : ''}${flash && !hide ? ` flash-${flash.dir}` : ''}`}>
        {hide ? '••••' : fmtToken(shownBal, sym)}
      </div>
      <div class="sub num">{hide ? '' : fmtUsd(shownUsd)}</div>
    </div>
  );
}

const ART = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };

/** The sun: on hover its rays turn slowly and stretch, the core warms up. */
function SunArt() {
  return (
    <svg {...ART} class="sun-art">
      <g class="sun-rays">
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </g>
      <circle class="sun-core" cx="12" cy="12" r="4" />
    </svg>
  );
}

/** The moon: on hover it rocks like a cradle and two small stars twinkle beside it. */
function MoonArt() {
  return (
    <svg {...ART} class="moon-art">
      <path class="moon-body" d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
      <path class="moon-star s1" d="M18.6 1.2 Q19 3.9 21.7 4.3 Q19 4.7 18.6 7.4 Q18.2 4.7 15.5 4.3 Q18.2 3.9 18.6 1.2Z" fill="var(--coin)" stroke="none" />
      <path class="moon-star s2" d="M22.6 7.6 Q22.85 9.25 24.5 9.5 Q22.85 9.75 22.6 11.4 Q22.35 9.75 20.7 9.5 Q22.35 9.25 22.6 7.6Z" fill="var(--coin)" stroke="none" />
    </svg>
  );
}

/** One tap flips light ↔ dark; "follow the system" stays available in Settings. */
function ThemeButton({ theme }) {
  const dark = resolveTheme(theme) === 'dark';
  const label = dark ? t('theme.toLight') : t('theme.toDark');
  return (
    <button
      class="icon-btn theme-btn"
      onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
      aria-label={label}
      title={label}
    >
      <span class="theme-ico" key={dark ? 'sun' : 'moon'}>
        {dark ? <SunArt /> : <MoonArt />}
      </span>
    </button>
  );
}

export function MainHeader() {
  const s = useAppState();
  const addr = s.wallet?.publicKey;
  const [copied, setCopied] = useState(0);
  useEffect(() => {
    if (!copied) return;
    const tm = setTimeout(() => setCopied(0), 1500);
    return () => clearTimeout(tm);
  }, [copied]);
  return (
    <header class="topbar">
      <div class="grow">
        <button
          class={`addr-chip${copied ? ' copied' : ''}`}
          onClick={async () => {
            if (await copyText(addr, t('home.addrCopied'))) setCopied(Date.now());
          }}
          title={t('home.copyAddr')}
        >
          <span class="pig-dot" aria-hidden="true" key={copied ? `c${copied}` : 'p'}>
            <PigFace size={22} />
          </span>
          <span>{shortAddr(addr)}</span>
          <span class="copy-ico" key={copied ? 'ok' : 'copy'}>
            <Icon name={copied ? 'check' : 'copy'} class="copy" />
          </span>
        </button>
      </div>
      <span class={`net-pill ${s.settings.network}`}>{s.settings.network === 'devnet' ? 'Devnet' : 'Mainnet'}</span>
      <ThemeButton theme={s.settings.theme} />
      <button class="icon-btn gear-btn" onClick={() => navigate('settings')} aria-label={t('settings.title')}>
        <Icon name="settings" />
      </button>
      <button class="icon-btn lock-btn" onClick={lock} aria-label={t('home.lock')}>
        <Icon name="lock" />
      </button>
    </header>
  );
}

function overallLevel(goals, prices, net) {
  let saved = 0;
  let target = 0;
  for (const g of goals) {
    if (!g.target) continue;
    saved += Math.min(goalSavedUsd(g, prices, net), g.target);
    target += g.target;
  }
  return target ? saved / target : 0;
}

export function Home() {
  const s = useAppState();
  const railRef = useDragScroll();
  const funds = computeFunds(s);
  const net = s.settings.network;
  const hide = s.settings.hideBalances;
  const loading = s.balancesStatus === 'loading' && !s.balances;
  const total = useAnimatedNumber(funds.totalUsd);
  const goals = s.goals.filter((g) => !g.archived);
  const level = overallLevel(goals, s.prices, net);
  const unknown = !s.balances && s.balancesStatus === 'error';
  const totalText = hide ? '•••• $' : unknown ? '— $' : fmtUsd(total);
  const inbox = s.depositInbox.filter((d) => d.network === net);

  useInterval(() => refresh({ silent: true }), 20_000, [net]);

  return (
    <div class="screen">
      <MainHeader />
      <div class="scroll">
        <section class="hero" aria-label={t('home.balance')}>
          <div
            class="pig-wrap"
            role="button"
            tabIndex={0}
            onClick={() => openSheet('allocate')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openSheet('allocate')}
            title={t('allocate.title')}
          >
            <Pig level={level} dropKey={s.dropKey} label={t('home.pigLabel', { pct: Math.round(level * 100) })} interactive />
          </div>
          <div class="total-label">{t('home.total')}</div>
          <button
            class={`total num display${totalText.length > 12 ? ' long' : ''}${loading ? ' skeleton' : ''}`}
            onClick={() => updateSettings({ hideBalances: !hide })}
            title={hide ? t('home.showBalance') : t('home.hideBalance')}
          >
            <span class="total-text" key={hide ? 'hidden' : 'shown'}>
              {totalText}
            </span>
          </button>
          <div class="split">
            <div>
              <div class="k">
                <i style={{ background: 'var(--coin)' }} />
                {t('home.inGoals')}
                {goals.some((g) => g.target) && (
                  <span class="pct-chip num" title={t('home.goalsProgress')}>
                    {fmtProgress(level)}
                  </span>
                )}
              </div>
              <div class="v num">{hide ? '••••' : fmtUsd(funds.allocatedUsd)}</div>
            </div>
            <div>
              <div class="k">
                <i style={{ background: 'var(--glaze-deep)' }} />
                {t('home.free')}
              </div>
              <div class="v num">{hide ? '••••' : unknown ? '—' : fmtUsd(funds.freeUsd)}</div>
            </div>
          </div>
        </section>

        <div class="pad stack">
          <Collapse open={inbox.length > 0}>
          {inbox.slice(0, 1).map((d) => (
            <div class="deposit-card" key={d.id}>
              <div style={{ flex: 1 }}>
                <div class="plus num">
                  +{hide ? '••••' : fmtToken(d.amount, d.token)} {d.token}
                </div>
                <div class="small muted">{t('home.depositArrived')}</div>
              </div>
              <button
                class="btn btn-primary sm"
                onClick={() => {
                  dismissDeposit(d.id);
                  openSheet('allocate', { token: d.token, amount: d.amount });
                }}
              >
                {t('home.putAside')}
              </button>
              <button class="icon-btn" onClick={() => dismissDeposit(d.id)} aria-label={t('home.dismiss')}>
                <Icon name="close" />
              </button>
            </div>
          ))}
          </Collapse>

          {s.wallet && !s.wallet.backedUp && (
            <div class="banner warn">
              <Icon name="key" />
              <div>
                <b>{t('home.backupTitle')}</b> {t('home.backupText')}
                <div class="actions">
                  <button class="btn btn-soft sm" onClick={() => navigate('reveal', { backup: true })}>
                    {t('home.backupNow')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <Collapse open={funds.hasShortfall}>
            <div class="banner danger">
              <Icon name="alert" />
              <div>
                {t('home.shortfall')}
                <div class="actions">
                  <button class="btn btn-soft sm" onClick={fixShortfall}>
                    {t('home.shortfallFix')}
                  </button>
                </div>
              </div>
            </div>
          </Collapse>

          <Collapse open={s.balancesStatus === 'error'}>
            <div class="banner danger">
              <Icon name="globe" />
              <div>
                {t('home.balanceError')}
                <div class="actions">
                  <button class="btn btn-soft sm" onClick={() => refresh()}>
                    {t('common.retry')}
                  </button>
                </div>
              </div>
            </div>
          </Collapse>
        </div>

        <div class="pad" style={{ marginTop: 14 }}>
          <div class="actions-row">
            <button class="action-tile" onClick={() => navigate('deposit')}>
              <span class="ico">
                <Icon name="down" />
              </span>
              {t('home.deposit')}
            </button>
            <button class="action-tile coin" onClick={() => openSheet('allocate')}>
              <span class="ico">
                <Icon name="coinIn" />
              </span>
              {t('home.putAside')}
            </button>
            <button class="action-tile swap" onClick={() => navigate('swap')}>
              <span class="ico">
                <Icon name="swap" />
              </span>
              {t('home.swap')}
            </button>
            <button class="action-tile" onClick={() => navigate('send')}>
              <span class="ico">
                <Icon name="up" />
              </span>
              {t('home.withdraw')}
            </button>
          </div>

          <div class="section-head">
            <h2 class="h2">{t('tabs.goals')}</h2>
            {goals.length > 0 && (
              <button class="link-btn" onClick={() => navigate('goals')}>
                {t('home.allGoals')}
              </button>
            )}
          </div>
          <div class="jar-rail" ref={railRef}>
            {goals.map((g) => (
              <GoalTile key={g.id} goal={g} prices={s.prices} net={net} hide={hide} />
            ))}
            <button class="jar-tile new" onClick={() => navigate('goal-edit')}>
              <span class="plus-circle">
                <Icon name="plus" />
              </span>
              {goals.length ? t('goals.new') : t('ready.firstGoal')}
            </button>
          </div>

          <div class="section-head">
            <h2 class="h2">{t('home.wallet')}</h2>
            <button
              class="link-btn"
              onClick={() => refresh()}
              disabled={s.balancesStatus === 'refreshing' || s.balancesStatus === 'loading'}
            >
              {s.balancesStatus === 'refreshing' ? t('home.refreshing') : t('home.refresh')}
            </button>
          </div>
          <div class="token-list" style={{ marginBottom: 18 }}>
            {['USDC', 'USDT', 'SOL'].map((sym) => {
              const unsupported = !TOKENS[sym].mint[net] && sym !== 'SOL';
              const bal = funds.balances[sym] || 0;
              const usd = bal * (s.prices[sym] ?? (sym === 'SOL' ? 0 : 1));
              return (
                <div class="token-row" key={sym}>
                  <TokenIcon symbol={sym} />
                  <div class="meta">
                    <div class="name">{sym}</div>
                    <div class="sub">
                      {unsupported
                        ? t('home.notOnDevnet')
                        : funds.allocated[sym] > 0
                          ? t('home.tokenInGoals', { amount: hide ? '••' : fmtToken(funds.allocated[sym], sym) })
                          : sym === 'SOL' && s.prices.SOL
                            ? `1 SOL = ${fmtUsd(s.prices.SOL)}`
                            : TOKENS[sym].name}
                    </div>
                  </div>
                  <TokenAmount sym={sym} bal={bal} usd={usd} hide={hide} loading={loading} />
                </div>
              );
            })}
            {funds.lockedUsd > 0 && (
              <div class="token-row">
                <span class="token-icon smart-token" aria-hidden="true">
                  <Icon name="shield" />
                </span>
                <div class="meta">
                  <div class="name">{t('home.smartContract')}</div>
                  <div class="sub">
                    {hide
                      ? '••••'
                      : ['USDC', 'USDT']
                          .filter((sym) => funds.locked[sym] > 0)
                          .map((sym) => `${fmtToken(funds.locked[sym], sym)} ${sym}`)
                          .join(', ')}
                  </div>
                </div>
                <div class="amt">
                  <div class="num">{hide ? '••••' : fmtUsd(funds.lockedUsd)}</div>
                  <div class="sub">{t('home.lockedSub')}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <TabBar active="home" />
    </div>
  );
}

/** A percentage that counts up when it appears and eases when it changes. */
export function CountUpProgress({ value }) {
  const v = useAnimatedNumber(value, 1000, { fromZero: true });
  return <>{fmtProgress(Math.abs(v - value) < 1e-6 ? value : Math.min(v, value))}</>;
}

export function GoalTile({ goal, prices, net, hide }) {
  const p = goalProgress(goal, prices, net);
  const saved = goalSavedUsd(goal, prices, net);
  const days = fmtDaysLeft(goal.deadline);
  const done = p >= 1;
  const color = (GOAL_COLORS[goal.color] || GOAL_COLORS.coin).fill;
  return (
    <button class={`jar-tile${done ? ' reached' : ''}`} onClick={() => navigate('goal', { id: goal.id })}>
      <Jar level={p} color={goal.color} emoji={goal.emoji} interactive="hover" />
      <div class="g-name">{goal.name}</div>
      <div class="g-amt num">
        {hide ? '••••' : t('goals.savedOf', { saved: fmtUsd(saved, { round: saved >= 100 }), target: fmtUsd(goal.target, { round: true }) })}
      </div>
      <div class="tile-progress">
        <div class="mini-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(p * 100)}>
          <i style={{ width: barWidth(p), background: done ? 'var(--mint)' : color }} />
        </div>
        <span class={`pct-badge num${done ? ' done' : ''}`}>{fmtProgress(p)}</span>
      </div>
      <div class="g-amt">{done ? t('goals.reached') : days || t('goals.noDeadlineTile')}</div>
    </button>
  );
}
