import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Icon } from './icons.jsx';

// A dropdown in the piggy bank's own style instead of the browser's grey list:
// a soft pill that opens a small card of options. The card is drawn over the
// whole popup (so a scrolling list can't clip it) and opens upwards when there
// is no room below. Keyboard: arrows, Home/End, Enter/Space, Escape, Tab.

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

/**
 * options: [{ value, label, hint? }]
 */
export function Select({ value, options, onChange, label, class: cls = '' }) {
  const [id] = useState(() => `sel${++uid}`);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top|bottom, right, up }
  const btn = useRef(null);
  const menu = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];

  function show() {
    const host = btn.current.closest('.app') || document.body;
    const hb = host.getBoundingClientRect();
    const b = btn.current.getBoundingClientRect();
    const need = options.length * 44 + 20;
    const below = hb.bottom - b.bottom;
    const up = below < need + 12 && b.top - hb.top > below;
    setPlace({
      right: Math.max(8, hb.right - b.right),
      top: up ? null : b.bottom - hb.top + 6,
      bottom: up ? hb.bottom - b.top + 6 : null,
      up,
      minWidth: Math.max(b.width, 168),
      // a long list (eight languages) scrolls inside instead of leaving the popup
      maxHeight: Math.max(150, (up ? b.top - hb.top : hb.bottom - b.bottom) - 18),
    });
    setActive(Math.max(0, options.indexOf(current)));
    setClosing(false);
    setOpen(true);
  }

  function hide({ focus = true } = {}) {
    if (!open) return;
    setOpen(false);
    if (focus) btn.current?.focus({ preventScroll: true });
    if (reduced()) return;
    setClosing(true);
    setTimeout(() => setClosing(false), 140);
  }

  function pick(o) {
    hide();
    if (o.value !== value) onChange(o.value);
  }

  // focus the card once it is on screen, and close it on outside taps or scrolling
  useLayoutEffect(() => {
    if (open) menu.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) hide({ focus: false });
    };
    const scrolled = (e) => {
      if (!menu.current?.contains(e.target)) hide({ focus: false });
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', scrolled);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', scrolled);
    };
  }, [open]);

  // keep the highlighted option in view when the list scrolls
  useEffect(() => {
    if (open) menu.current?.querySelector(`#${id}-o${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function onMenuKey(e) {
    const n = options.length;
    if (e.key === 'ArrowDown') setActive((i) => (i + 1) % n);
    else if (e.key === 'ArrowUp') setActive((i) => (i - 1 + n) % n);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(options[active]);
    else if (e.key === 'Escape') hide();
    else if (e.key === 'Tab') return hide({ focus: false });
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const host = typeof document !== 'undefined' && (btn.current?.closest('.app') || document.querySelector('.app'));
  const shown = (open || closing) && place && host;

  return (
    <>
      <button
        ref={btn}
        type="button"
        class={`select-btn${open ? ' open' : ''}${cls ? ` ${cls}` : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={label}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span class="select-value" key={current.value}>
          {current.label}
        </span>
        <Icon name="chev" class="select-chev" />
      </button>
      {shown &&
        createPortal(
          <div
            ref={menu}
            id={`${id}-menu`}
            class={`select-menu${place.up ? ' up' : ''}${open ? '' : ' closing'}`}
            role="listbox"
            tabindex="-1"
            aria-label={label}
            aria-activedescendant={open ? `${id}-o${active}` : undefined}
            style={{
              right: `${place.right}px`,
              top: place.top != null ? `${place.top}px` : 'auto',
              bottom: place.bottom != null ? `${place.bottom}px` : 'auto',
              minWidth: `${place.minWidth}px`,
              maxHeight: `${place.maxHeight}px`,
            }}
            onKeyDown={onMenuKey}
          >
            {options.map((o, i) => (
              <div
                key={String(o.value)}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={o.value === value}
                class={`select-opt${i === active ? ' active' : ''}${o.value === value ? ' on' : ''}`}
                style={{ '--i': place.up ? options.length - 1 - i : i }}
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => pick(o)}
              >
                <span class="select-opt-text">
                  <span>{o.label}</span>
                  {o.hint && <small>{o.hint}</small>}
                </span>
                <Icon name="check" class="select-tick" />
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}
