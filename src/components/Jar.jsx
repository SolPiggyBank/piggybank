import { useEffect, useRef, useState } from 'preact/hooks';

export const GOAL_COLORS = {
  coin: { fill: '#F7C64F', light: '#FFE08A', deep: '#C98A0B' },
  mint: { fill: '#6CCB9A', light: '#A8E8C5', deep: '#2E8F5E' },
  sky: { fill: '#7DB5EE', light: '#B5D7F7', deep: '#3A78C2' },
  berry: { fill: '#EE7FA6', light: '#F8B3CB', deep: '#C2416F' },
  plum: { fill: '#AE8BE6', light: '#D3C0F4', deep: '#7650B8' },
  tangerine: { fill: '#F7A35C', light: '#FBCB9C', deep: '#C96A1C' },
};

const BODY = 'M30 30 C17 32 13 42 13 54 L13 100 C13 112 21 119 33 119 L67 119 C79 119 87 112 87 100 L87 54 C87 42 83 32 70 30 Z';
const INNER = 'M31 35 C21 37 18 45 18 55 L18 99 C18 109 24 114 34 114 L66 114 C76 114 82 109 82 99 L82 55 C82 45 79 37 69 35 Z';
const BUBBLES = [
  { x: 30, y: 30, r: 2.2 },
  { x: 68, y: 46, r: 1.6 },
  { x: 40, y: 62, r: 1.3 },
  { x: 72, y: 74, r: 2 },
];

let n = 0;

// Hovering a jar plays the next of these; tapping a big jar makes it go "boing".
const REACTIONS = ['slosh', 'jingle', 'lid', 'spin', 'glint', 'bubbles'];
const REACTION_MS = { slosh: 1050, jingle: 950, lid: 1050, spin: 950, glint: 900, bubbles: 1300, boing: 850 };
let nextReaction = 0;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const COIN_X = 27; // left of the label, so the coin stays visible on its way down

/**
 * A glass jar that fills with the goal's colour; the emoji sits on a round label.
 * fillIn: pours from empty when it appears. dropKey: change it to drop a coin
 * through the lid (the lid pops, the coin splashes, the jar squashes a little).
 */
export function Jar({ level = 0, color = 'coin', emoji = '🎯', big = false, fillIn = false, dropKey, interactive = false }) {
  const [id] = useState(() => `jar${++n}`);
  const root = useRef(null);
  const [react, setReact] = useState(null); // { kind, n }
  const reactTimer = useRef(0);
  useEffect(() => () => clearTimeout(reactTimer.current), []);

  function play(kind) {
    if (reducedMotion()) return;
    setReact({ kind, n: Date.now() });
    clearTimeout(reactTimer.current);
    reactTimer.current = setTimeout(() => setReact(null), REACTION_MS[kind]);
  }
  const busy = useRef(false);
  busy.current = !!react;
  // a jar on a tile reacts when the pointer enters the whole tile
  useEffect(() => {
    if (!interactive || !root.current) return;
    const host = root.current.closest('.jar-tile, .preview-jar') || root.current;
    const enter = (e) => {
      if (e.pointerType === 'touch' || busy.current) return;
      play(REACTIONS[nextReaction++ % REACTIONS.length]);
    };
    host.addEventListener('pointerenter', enter);
    return () => host.removeEventListener('pointerenter', enter);
  }, [interactive]);
  const hoverProps = interactive
    ? {
        onPointerMove: (e) => {
          // the liquid leans away from the pointer, as if the jar were held
          if (interactive !== true || e.pointerType === 'touch') return;
          const r = root.current.getBoundingClientRect();
          const k = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
          root.current.style.setProperty('--tilt', `${(-k * 7).toFixed(2)}deg`);
        },
        onPointerLeave: () => root.current?.style.setProperty('--tilt', '0deg'),
        onClick: interactive === true ? () => play('boing') : undefined,
      }
    : {};
  const [shown, setShown] = useState(fillIn ? 0 : level);
  useEffect(() => {
    if (shown === level) return;
    const tm = setTimeout(() => setShown(level), fillIn ? 120 : 0);
    return () => clearTimeout(tm);
  }, [level]);

  const firstKey = useRef(dropKey);
  const dropping = dropKey !== undefined && dropKey !== firstKey.current;
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (!dropping) return;
    setBump(false);
    const t1 = setTimeout(() => setBump(true), 640);
    const t2 = setTimeout(() => setBump(false), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dropKey]);

  const c = GOAL_COLORS[color] || GOAL_COLORS.coin;
  const clamped = Math.max(0, Math.min(1, shown));
  const y = clamped <= 0 ? 124 : 116 - clamped * 82;
  const land = Math.min(y, 110) + 3; // where the coin meets the surface
  const full = level >= 1;
  return (
    <div
      ref={root}
      class={`jar${big ? ' big' : ''}${full ? ' full' : ''}${bump ? ' bump' : ''}${interactive ? ' interactive' : ''}${react ? ` react-${react.kind}` : ''}`}
      {...hoverProps}
    >
      {full && (
        <>
          <span class="jar-spark s1" aria-hidden="true">✦</span>
          <span class="jar-spark s2" aria-hidden="true">✦</span>
          <span class="jar-spark s3" aria-hidden="true">✦</span>
        </>
      )}
      <div class="jar-inner">
      <svg viewBox="0 0 100 126" aria-hidden="true">
        <g class="jar-body">
        <defs>
          <clipPath id={`${id}-c`}>
            <path d={INNER} />
          </clipPath>
          <clipPath id={`${id}-b`}>
            <path d={BODY} />
          </clipPath>
          <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={c.light} />
            <stop offset="0.18" stop-color={c.fill} />
            <stop offset="1" stop-color={c.deep} />
          </linearGradient>
          <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={c.fill} />
            <stop offset="1" stop-color={c.deep} />
          </linearGradient>
        </defs>

        <ellipse cx="50" cy="121" rx="36" ry="3.5" fill="#3A0F1F" opacity="0.12" />

        {/* glass */}
        <path d={BODY} style={{ fill: 'var(--surface)' }} />
        <path d={BODY} style={{ fill: 'var(--well)' }} opacity="0.55" />

        {/* contents */}
        <g clip-path={`url(#${id}-c)`}>
          <g class="level" style={{ transform: `translateY(${y}px)` }}>
            <g class="tilt">
            <path
              class="wave"
              d="M0 4 Q7.5 0 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4 T135 4 T150 4 T165 4 T180 4 L180 110 L0 110 Z"
              fill={`url(#${id}-f)`}
            />
            <path
              class="wave"
              d="M0 4 Q7.5 0 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4 T135 4 T150 4 T165 4 T180 4"
              fill="none"
              stroke="#fff"
              stroke-width="1.6"
              opacity="0.55"
            />
            {BUBBLES.map((b, i) => (
              <circle key={i} class="bubble" style={{ animationDelay: `${i * 0.9}s` }} cx={b.x} cy={b.y} r={b.r} fill="#fff" opacity="0.55" />
            ))}
            </g>
            {/* reactions that happen at the surface */}
            {react?.kind === 'jingle' && (
              <g key={`j${react.n}`}>
                {[
                  [25, 0],
                  [75, 0.08],
                  [30, 0.17],
                  [70, 0.24],
                ].map(([x, d]) => (
                  <g class="jar-jingle" key={x} style={{ animationDelay: `${d}s` }}>
                    <ellipse cx={x} cy="8" rx="4.4" ry="2.1" fill="#F0B429" stroke="#9A6A05" stroke-width="1" />
                  </g>
                ))}
              </g>
            )}
            {(react?.kind === 'bubbles' || react?.kind === 'boing') && (
              <g key={`b${react.n}`}>
                {[
                  [30, 2.6, 0],
                  [44, 1.8, 0.12],
                  [56, 3, 0.05],
                  [68, 2, 0.2],
                  [38, 1.5, 0.3],
                  [62, 1.4, 0.36],
                ].map(([x, r, d]) => (
                  <circle class="jar-rise" key={x} cx={x} cy="14" r={r} fill="#fff" style={{ animationDelay: `${d}s` }} />
                ))}
              </g>
            )}
            {react?.kind === 'boing' && <ellipse class="jar-ripple" key={`r${react.n}`} cx="50" cy="4" rx="22" ry="3" fill="none" stroke="#fff" stroke-width="1.6" />}
          </g>
        </g>
        {react?.kind === 'glint' && (
          <g clip-path={`url(#${id}-b)`} key={`g${react.n}`}>
            <rect class="jar-glint" x="-40" y="-10" width="16" height="150" fill="#fff" opacity="0.55" transform="rotate(18 50 63)" />
          </g>
        )}

        {dropping && (
          <g key={`drop${dropKey}`}>
            <g class="jar-coin" style={{ '--land': `${land}px` }}>
              <g class="jar-coin-spin">
                <circle cx={COIN_X} cy="0" r="6.2" fill="#F0B429" stroke="#9A6A05" stroke-width="1.4" />
                <circle cx={COIN_X} cy="0" r="3.6" fill="none" stroke="#FFE08A" stroke-width="1.2" />
              </g>
            </g>
            <ellipse class="jar-splash" cx={COIN_X} cy={land} rx="9" ry="2.4" fill="none" stroke="#fff" stroke-width="1.6" />
          </g>
        )}

        {/* glass thickness and reflections */}
        <path d={INNER} fill="none" stroke="#fff" stroke-width="1.4" opacity="0.5" />
        <path d={BODY} fill="none" style={{ stroke: 'var(--ink)' }} stroke-width="2.6" stroke-linejoin="round" />
        <path d="M22 50 C21 45 23 41 27 39" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.85" />
        <path d="M21.5 58 L21.5 98" stroke="#fff" stroke-width="3.6" stroke-linecap="round" opacity="0.6" />
        <path d="M79 64 L79 92" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.35" />

        {/* neck and lid */}
        <rect x="27" y="23" width="46" height="9" rx="3" style={{ fill: 'var(--surface)', stroke: 'var(--ink)' }} stroke-width="2.4" />
        <g class={`jar-lid${dropping ? ' pop' : ''}`} key={`lid${dropKey ?? ''}`}>
          <rect x="21" y="5" width="58" height="19" rx="5.5" fill={`url(#${id}-lid)`} style={{ stroke: 'var(--ink)' }} stroke-width="2.6" />
          <g stroke="#000" stroke-opacity="0.16" stroke-width="2">
            {[29, 36, 43, 50, 57, 64, 71].map((x) => (
              <path key={x} d={`M${x} 10 V20`} />
            ))}
          </g>
          <path d="M26 10 H58" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.55" />
        </g>

        {/* round label */}
        <circle cx="50" cy="74" r="19" style={{ fill: 'var(--surface)', stroke: 'var(--ink)' }} stroke-width="2.2" />
        <circle class="jar-ring" cx="50" cy="74" r="15" fill="none" stroke={c.deep} stroke-width="1.2" stroke-dasharray="2.5 2.5" opacity="0.6" />
        {react?.kind === 'lid' && (
          <g key={`s${react.n}`}>
            <path class="jar-star a" d="M50 -10 Q51 -5 56 -4 Q51 -3 50 2 Q49 -3 44 -4 Q49 -5 50 -10 Z" fill="#F0B429" />
            <path class="jar-star b" d="M74 -2 Q74.7 1 78 1.6 Q74.7 2.2 74 5.2 Q73.3 2.2 70 1.6 Q73.3 1 74 -2 Z" fill="#EE7FA6" />
            <path class="jar-star c" d="M26 -1 Q26.6 1.6 29.4 2.2 Q26.6 2.8 26 5.4 Q25.4 2.8 22.6 2.2 Q25.4 1.6 26 -1 Z" fill="#6CCB9A" />
          </g>
        )}
        </g>
      </svg>
      <span class="emoji">{emoji}</span>
      </div>
    </div>
  );
}
