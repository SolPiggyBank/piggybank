import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { TokenIcon } from './TokenIcon.jsx';
import { back, closeSheet, toast, navigate, replace, useAppState } from '../store.js';
import { fmtToken, fmtUsd, acceptAmountText } from '../lib/format.js';
import confetti from 'canvas-confetti';
import { t } from '../i18n.js';
import { exitGhost } from './motion.js';

export function TopBar({ title, onBack = back, right, noBack }) {
  return (
    <header class="topbar">
      {!noBack && (
        <button class="icon-btn" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="back" />
        </button>
      )}
      <div class="grow">
        <h1 style={noBack ? { paddingLeft: 4 } : null}>{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function TabBar({ active }) {
  const tabs = [
    { id: 'home', label: t('tabs.home'), icon: 'home' },
    { id: 'goals', label: t('tabs.goals'), icon: 'target' },
    { id: 'history', label: t('tabs.history'), icon: 'clock' },
  ];
  return (
    <nav class="tabbar" aria-label={t('tabs.label')}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          class={`tab${active === tab.id ? ' active' : ''}`}
          onClick={() => active !== tab.id && replace(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span class="tab-ico">
            <Icon name={tab.icon} />
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function Sheet({ title, children, onClose = closeSheet }) {
  const ref = useRef();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, button.btn, textarea');
    first?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div class="sheet-grip" />
        <div class="sheet-head">
          <h2 class="h2">{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast() {
  const { toast: msg } = useAppState();
  const host = useRef(null);
  const shownId = useRef(null);
  // the old toast drifts away while a new one (or none) takes its place
  if (shownId.current && shownId.current !== msg?.id) exitGhost(host.current?.querySelector(':scope > .toast:not(.leaving)'), 220);
  shownId.current = msg?.id || null;
  return (
    <div class="toast-host" ref={host}>
      {msg && (
        <div key={msg.id} class={`toast${msg.kind === 'err' ? ' err' : msg.kind === 'milestone' ? ' milestone' : ''}`} role="status" aria-live="polite">
          {msg.text}
        </div>
      )}
    </div>
  );
}

export async function copyText(text, msg = t('common.copied')) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
    return true;
  } catch {
    toast(t('common.copyFailed'), 'err');
    return false;
  }
}

export function CopyButton({ text, label = t('common.copy'), done = t('common.copied'), class: cls = 'btn btn-soft sm' }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      class={`${cls}${ok ? ' copy-ok' : ''}`}
      onClick={async () => {
        if (await copyText(text, done)) {
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        }
      }}
    >
      <Icon name={ok ? 'check' : 'copy'} />
      {ok ? done : label}
    </button>
  );
}

export function PasswordField({ value, onInput, placeholder = t('common.password'), autoFocus, error, id, onEnter }) {
  const [show, setShow] = useState(false);
  return (
    <div class={`field${error ? ' error' : ''}`}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autocomplete="off"
        spellcheck={false}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      <div class="suffix">
        <button
          type="button"
          class="icon-btn"
          onClick={() => setShow(!show)}
          aria-label={show ? t('common.hidePassword') : t('common.showPassword')}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      class={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
    />
  );
}

export function TokenPicker({ value, onChange, amounts, disabledFor = () => false }) {
  return (
    <div class="token-pick" role="radiogroup" aria-label={t('common.token')}>
      {['USDC', 'USDT', 'SOL'].map((sym) => (
        <button
          key={sym}
          role="radio"
          aria-checked={value === sym}
          class={value === sym ? 'on' : ''}
          onClick={() => onChange(sym)}
          disabled={disabledFor(sym)}
        >
          <TokenIcon symbol={sym} />
          {sym}
          {amounts && <small>{fmtToken(amounts[sym] || 0, sym)}</small>}
        </button>
      ))}
    </div>
  );
}

export function AmountInput({ value, onInput, symbol, usd, max, onMax, error, autoFocus, maxLabel = t('common.all'), decimals }) {
  const places = decimals ?? (symbol === 'SOL' ? 9 : 6);
  return (
    <div class={`amount-box${error ? ' error' : ''}`}>
      <div class="row">
        <input
          inputMode="decimal"
          placeholder="0"
          value={value}
          autoFocus={autoFocus}
          aria-label={t('common.amountIn', { symbol })}
          onInput={(e) => {
            const v = acceptAmountText(e.currentTarget.value, places);
            if (v == null) {
              e.currentTarget.value = value; // refuse the keystroke
              return;
            }
            e.currentTarget.value = v;
            onInput(v);
          }}
        />
        <span class="sym">{symbol}</span>
      </div>
      <div class="under">
        <span>{usd != null && !Number.isNaN(usd) ? `≈ ${fmtUsd(usd)}` : ' '}</span>
        {onMax && (
          <button class="max-btn" onClick={onMax} disabled={!max}>
            {maxLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Main-thread confetti: the extension CSP does not allow blob: workers.
let cannon;
function confettiCannon() {
  if (!cannon) cannon = confetti.create(null, { resize: true, useWorker: false });
  return cannon;
}

const CONFETTI_COLORS = ['#F0B429', '#F2BFC8', '#EE7FA6', '#6CCB9A', '#FFE08A'];

/** A small burst for milestones on the way (25 / 50 / 75 %). */
export function fireSparkles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confettiCannon()({ particleCount: 38, spread: 62, startVelocity: 26, origin: { y: 0.62 }, colors: CONFETTI_COLORS, scalar: 0.75, ticks: 140 });
}

export function fireConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fire = confettiCannon();
  const colors = CONFETTI_COLORS;
  fire({ particleCount: 90, spread: 75, origin: { y: 0.35 }, colors, disableForReducedMotion: true, scalar: 0.9 });
  setTimeout(
    () => fire({ particleCount: 50, spread: 110, origin: { y: 0.3 }, colors, disableForReducedMotion: true, scalar: 0.8 }),
    250,
  );
}

export function Empty({ art, title, text, action }) {
  return (
    <div class="empty">
      <div class="art" aria-hidden="true">
        {art}
      </div>
      <div class="h2" style={{ color: 'var(--ink)' }}>
        {title}
      </div>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function useInterval(fn, ms, deps = []) {
  useEffect(() => {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  }, deps);
}

export function Steps({ total, current }) {
  return (
    <div class="steps" aria-label={t('common.step', { n: current, total })}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} class={i < current ? 'on' : ''} />
      ))}
    </div>
  );
}

export { navigate };

/**
 * Shows or hides a block by folding it open/closed instead of popping it in
 * and out; while closing it keeps showing what it last had.
 */
export function Collapse({ open, children, class: cls = '' }) {
  const last = useRef(null);
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  if (open) last.current = children;
  useEffect(() => {
    if (open) {
      setClosing(false);
    } else if (wasOpen.current) {
      // keep the old content on screen while it folds away, then drop it
      setClosing(true);
      const timer = setTimeout(() => {
        last.current = null;
        setClosing(false);
      }, 380);
      wasOpen.current = open;
      return () => clearTimeout(timer);
    }
    wasOpen.current = open;
  }, [open]);
  const body = open ? children : closing || wasOpen.current ? last.current : null;
  return (
    <div class={`collapse${open ? ' open' : ''}${cls ? ` ${cls}` : ''}`} aria-hidden={open ? undefined : 'true'} inert={!open}>
      <div class="collapse-in">{body}</div>
    </div>
  );
}
