import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n.js';

// Fixed palette: the pig is a glazed ceramic object, the same in light and dark themes.
const C = {
  ink: '#3A0F1F',
  body: '#F4C3CC',
  bodyLight: '#FFE3E8',
  bodyEdge: '#E39AAC',
  shade: '#DB8DA1',
  innerEar: '#EC8EA3',
  hoof: '#C9768C',
  snout: '#F8CFD7',
  blush: '#F28AA2',
  gold: '#FFD45C',
  goldDeep: '#C98A0B',
};

const BODY =
  'M52 92 C52 58 88 38 128 38 C168 38 196 50 212 74 C224 92 226 116 214 134 C200 156 168 166 128 166 C86 166 50 150 44 124 C41 112 44 100 52 92 Z';

function leg(x, w, top, bottom) {
  const r = 7;
  return `M${x} ${top} V${bottom - r} Q${x} ${bottom} ${x + r} ${bottom} H${x + w - r} Q${x + w} ${bottom} ${x + w} ${bottom - r} V${top}`;
}
function hoof(x, w, bottom) {
  const r = 7;
  return `M${x} ${bottom - 9} V${bottom - r} Q${x} ${bottom} ${x + r} ${bottom} H${x + w - r} Q${x + w} ${bottom} ${x + w} ${bottom - r} V${bottom - 9} Z`;
}

const LEGS_BACK = [
  { x: 60, w: 22 },
  { x: 146, w: 22 },
];
const LEGS_FRONT = [
  { x: 80, w: 26 },
  { x: 168, w: 26 },
];

// A row of coins that forms the top of the pile.
const PILE = Array.from({ length: 15 }, (_, i) => ({ x: 22 + i * 16, y: i % 2 ? 9 : 6 }));
const SPARKLES = [
  { x: 74, y: 34, d: '0s' },
  { x: 150, y: 22, d: '1.1s' },
  { x: 196, y: 48, d: '2.2s' },
];

let uid = 0;

// Each time the pointer comes to the pig it does something different, in turn.
const REACTIONS = ['hop', 'sniff', 'wink', 'wiggle', 'peek'];
const REACTION_MS = { hop: 900, sniff: 1300, wink: 1000, wiggle: 900, peek: 1100, stir: 1200 };
let nextReaction = 0;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The ceramic piggy bank.
 * level: 0..1 how full it is with coins.
 * mood: 'awake' | 'sleeping' | 'happy'.
 * dropKey: change it to drop a coin through the slot.
 * interactive: the eye follows the pointer and every hover brings a new
 * reaction — a hop with a heart, a sniff and an "oink", a wink, a wiggle
 * with a spinning tail, a coin peeking out of the slot (a sleeping pig stirs).
 */
export function Pig({ level = 0, mood, sleeping = false, dropKey = 0, label, interactive = false }) {
  const [id] = useState(() => `pig${++uid}`);
  const svgRef = useRef(null);
  const [react, setReact] = useState(null); // { kind, n }
  const [hover, setHover] = useState(false);
  const reactTimer = useRef(0);
  const lookFrame = useRef(0);
  useEffect(() => () => {
    clearTimeout(reactTimer.current);
    cancelAnimationFrame(lookFrame.current);
  }, []);
  const firstKey = useRef(dropKey);
  const [bump, setBump] = useState(false);
  const [joy, setJoy] = useState(false);
  const playDrop = dropKey !== firstKey.current;
  const face = mood || (sleeping ? 'sleeping' : 'awake');
  const cheerful = joy || react?.kind === 'hop' || react?.kind === 'peek';
  const shownMood = cheerful && face !== 'sleeping' ? 'happy' : face;

  function onEnter() {
    if (!interactive || reducedMotion()) return;
    setHover(true);
    if (react) return; // let the current one finish
    const kind = face === 'sleeping' ? 'stir' : REACTIONS[nextReaction++ % REACTIONS.length];
    setReact({ kind, n: Date.now() });
    clearTimeout(reactTimer.current);
    reactTimer.current = setTimeout(() => setReact(null), REACTION_MS[kind]);
  }

  function onMove(e) {
    if (!interactive || face !== 'awake' || reducedMotion()) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(lookFrame.current);
    lookFrame.current = requestAnimationFrame(() => {
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // the eye sits at (191.5, 84) in the 260×200 drawing
      const ex = r.left + (191.5 / 260) * r.width;
      const ey = r.top + (84 / 200) * r.height;
      const k = (v) => Math.max(-1, Math.min(1, v / 70));
      el.style.setProperty('--look-x', `${(k(clientX - ex) * 2.6).toFixed(2)}px`);
      el.style.setProperty('--look-y', `${(k(clientY - ey) * 2.2).toFixed(2)}px`);
    });
  }

  function onLeave() {
    setHover(false);
    cancelAnimationFrame(lookFrame.current);
    svgRef.current?.style.setProperty('--look-x', '0px');
    svgRef.current?.style.setProperty('--look-y', '0px');
  }

  useEffect(() => {
    if (!playDrop) return;
    const timers = [
      setTimeout(() => {
        setBump(true);
        setJoy(true);
      }, 620),
      setTimeout(() => setBump(false), 1200),
      setTimeout(() => setJoy(false), 1900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [dropKey]);

  const clamped = Math.max(0, Math.min(1, level));
  const y = clamped <= 0 ? 176 : 166 - clamped * 120;

  return (
    <div
      class={`pig mood-${shownMood}${interactive ? ' interactive' : ''}${hover ? ' hovering' : ''}${react ? ` react-${react.kind}` : ''}`}
      role="img"
      aria-label={label || t('common.pig')}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <svg viewBox="0 0 260 200" ref={svgRef}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d={BODY} />
          </clipPath>
          {/* a coin peeking out shows only above the slot */}
          <clipPath id={`${id}-above-slot`}>
            <rect x="0" y="-120" width="260" height="170" />
          </clipPath>
          <radialGradient id={`${id}-body`} cx="0.38" cy="0.3" r="0.8">
            <stop offset="0" stop-color={C.bodyLight} />
            <stop offset="0.45" stop-color={C.body} />
            <stop offset="1" stop-color={C.bodyEdge} />
          </radialGradient>
          <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.5" stop-color="#B85470" stop-opacity="0" />
            <stop offset="1" stop-color="#B85470" stop-opacity="0.32" />
          </linearGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFDE73" />
            <stop offset="0.25" stop-color="#F7BC2E" />
            <stop offset="0.7" stop-color="#E29C10" />
          </linearGradient>
          <pattern id={`${id}-coins`} width="30" height="20" patternUnits="userSpaceOnUse">
            <ellipse cx="8" cy="5" rx="8.5" ry="3.8" fill="#FFE07A" fill-opacity="0.35" stroke="#B97C06" stroke-width="1.2" />
            <ellipse cx="23" cy="15" rx="8.5" ry="3.8" fill="#FFE07A" fill-opacity="0.35" stroke="#B97C06" stroke-width="1.2" />
          </pattern>
          {/* coins show in the belly and fade out before the face */}
          <radialGradient id={`${id}-fadeg`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.82" stop-color="#000" />
            <stop offset="1" stop-color="#000" stop-opacity="0" />
          </radialGradient>
          <mask id={`${id}-fade`} maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="200">
            <rect x="0" y="0" width="260" height="200" fill="#fff" />
            <ellipse cx="214" cy="100" rx="50" ry="84" fill={`url(#${id}-fadeg)`} />
          </mask>
          <radialGradient id={`${id}-gloss`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-ground`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#3A0F1F" stop-opacity="0.24" />
            <stop offset="1" stop-color="#3A0F1F" stop-opacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#F4C3CC" stop-opacity="0.38" />
            <stop offset="0.62" stop-color="#F4C3CC" stop-opacity="0.16" />
            <stop offset="1" stop-color="#F4C3CC" stop-opacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-coin`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#FFE48A" />
            <stop offset="1" stop-color="#EBA514" />
          </linearGradient>
        </defs>

        <ellipse class="pig-halo" cx="136" cy="108" rx="132" ry="100" fill={`url(#${id}-halo)`} />
        <ellipse class="pig-ground" cx="132" cy="186" rx="92" ry="8" fill={`url(#${id}-ground)`} />

        <g class="pig-all">
        {/* far legs and far ear sit behind the body */}
        {LEGS_BACK.map((l) => (
          <g key={l.x}>
            <path d={leg(l.x, l.w, 140, 176)} fill={C.shade} />
            <path d={hoof(l.x, l.w, 176)} fill={C.hoof} />
            <path d={leg(l.x, l.w, 140, 176)} fill="none" stroke={C.ink} stroke-width="3" stroke-linejoin="round" />
          </g>
        ))}
        <path
          d="M148 52 C146 33 154 18 167 12 C173 22 176 37 172 54 Z"
          fill={C.shade}
          stroke={C.ink}
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path
          class="tail"
          d="M47 106 C32 108 24 96 31 88 C37 81 47 88 41 94 C37 98 32 94 35 90"
          fill="none"
          stroke={C.ink}
          stroke-width="3.6"
          stroke-linecap="round"
        />

        <g class={`body-group${bump ? ' bump' : ''}`}>
          {LEGS_FRONT.map((l) => (
            <g key={l.x}>
              <path d={leg(l.x, l.w, 140, 182)} fill={C.body} />
              <path d={hoof(l.x, l.w, 182)} fill={C.hoof} />
              <path d={`M${l.x + 6} 150 V170`} stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.45" />
              <path d={leg(l.x, l.w, 140, 182)} fill="none" stroke={C.ink} stroke-width="3" stroke-linejoin="round" />
            </g>
          ))}

          <path d={BODY} fill={`url(#${id}-body)`} />

          {/* coins inside */}
          <g clip-path={`url(#${id}-clip)`}>
            <g mask={`url(#${id}-fade)`}>
            <g class="level" style={{ transform: `translateY(${y}px)` }}>
              <rect x="0" y="6" width="260" height="200" fill={`url(#${id}-gold)`} />
              <rect x="0" y="16" width="260" height="190" fill={`url(#${id}-coins)`} opacity="0.4" />
              {PILE.map((c, i) => (
                <g key={i}>
                  <ellipse cx={c.x} cy={c.y} rx="10" ry="5" fill={C.gold} stroke={C.goldDeep} stroke-width="1.6" />
                  <ellipse cx={c.x} cy={c.y - 0.5} rx="5.5" ry="2.4" fill="none" stroke="#E7A615" stroke-width="1.2" />
                </g>
              ))}
              {SPARKLES.map((s) => (
                <path
                  key={s.x}
                  class="sparkle"
                  style={{ animationDelay: s.d, transformOrigin: `${s.x}px ${s.y}px` }}
                  d={`M${s.x} ${s.y - 6} Q${s.x + 1} ${s.y - 1} ${s.x + 6} ${s.y} Q${s.x + 1} ${s.y + 1} ${s.x} ${s.y + 6} Q${s.x - 1} ${s.y + 1} ${s.x - 6} ${s.y} Q${s.x - 1} ${s.y - 1} ${s.x} ${s.y - 6} Z`}
                  fill="#fff"
                />
              ))}
            </g>
            </g>
            <rect x="0" y="0" width="260" height="200" fill={`url(#${id}-shade)`} />
            <path d={BODY} fill="none" stroke="#fff" stroke-width="7" opacity="0.18" transform="translate(3 4)" />
          </g>

          <path d={BODY} fill="none" stroke={C.ink} stroke-width="3.2" stroke-linejoin="round" />

          {/* ceramic gloss */}
          <ellipse cx="102" cy="66" rx="42" ry="20" fill={`url(#${id}-gloss)`} transform="rotate(-14 102 66)" />
          <path d="M70 80 C76 62 94 52 116 49" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.8" />
          <path d="M62 96 Q62 91 64.5 87" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.6" />

          {/* coin slot */}
          <rect x="105" y="45" width="44" height="9" rx="4.5" fill={C.ink} />
          <rect x="109" y="50" width="36" height="2.4" rx="1.2" fill="#7A3348" />
          <path d="M107 57 H147" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.5" />

          {/* near ear */}
          <g class="ear">
            <path
              d="M166 52 C163 33 172 18 186 12 C193 22 197 38 194 56 Z"
              fill={C.body}
              stroke={C.ink}
              stroke-width="3"
              stroke-linejoin="round"
            />
            <path d="M172 47 C171 35 176 26 184.5 21 C188.5 29 190 39 188 49 Z" fill={C.innerEar} />
          </g>

          {/* face */}
          <ellipse cx="200" cy="117" rx="11.5" ry="7" fill={C.blush} opacity={shownMood === 'happy' ? 0.8 : 0.55} />
          {shownMood === 'sleeping' ? (
            <g fill="none" stroke={C.ink} stroke-width="3.2" stroke-linecap="round">
              <path d="M184 86 Q191.5 92 199 86" />
              <path d="M186 90.5 L184 94" stroke-width="2" />
              <path d="M191.5 92 L191.5 96" stroke-width="2" />
              <path d="M197 90.5 L199 94" stroke-width="2" />
            </g>
          ) : shownMood === 'happy' ? (
            <path d="M184 88 Q191.5 78 199 88" fill="none" stroke={C.ink} stroke-width="3.6" stroke-linecap="round" />
          ) : (
            <g class="eye-look">
              <g class="eye-blink">
                <ellipse cx="191.5" cy="84" rx="5.4" ry="6.8" fill={C.ink} />
                <circle cx="193.4" cy="81.4" r="2" fill="#fff" />
                <circle cx="189.6" cy="87.2" r="0.9" fill="#fff" opacity="0.8" />
              </g>
            </g>
          )}
          {shownMood === 'happy' ? (
            <path d="M197 130 Q205 141 213 130 Z" fill="#7A2238" stroke={C.ink} stroke-width="2.4" stroke-linejoin="round" />
          ) : (
            <path d="M198 131 Q205 136 212 130.5" fill="none" stroke={C.ink} stroke-width="2.6" stroke-linecap="round" />
          )}

          {/* snout */}
          <g class="snout">
            <path d="M213 93 L232 91.5 L232 124.5 L213 124 Z" fill={C.shade} />
            <path d="M213 93 L230 91.6 M213 124 L230 124.6" stroke={C.ink} stroke-width="3" stroke-linecap="round" />
            <ellipse cx="232" cy="108" rx="12.5" ry="16.6" fill={C.snout} stroke={C.ink} stroke-width="3" />
            <ellipse cx="227.6" cy="108" rx="2.7" ry="4.8" fill={C.ink} />
            <ellipse cx="236.6" cy="108" rx="2.7" ry="4.8" fill={C.ink} />
            <path d="M226 96.5 Q229 94.5 233 94.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.75" />
          </g>
        </g>

        {react?.kind === 'peek' && (
          <g clip-path={`url(#${id}-above-slot)`} key={`peek${react.n}`}>
            <g class="coin-peek">
              <circle cx="127" cy="44" r="11" fill={`url(#${id}-coin)`} stroke="#B98007" stroke-width="2.4" />
              <circle cx="127" cy="44" r="6.4" fill="none" stroke="#C98A0B" stroke-width="1.5" />
            </g>
          </g>
        )}
        </g>

        {react?.kind === 'hop' && (
          <path
            class="pig-heart"
            key={`heart${react.n}`}
            d="M214 40 C214 34 206 32 204 38 C202 32 194 34 194 40 C194 47 204 52 204 55 C204 52 214 47 214 40 Z"
            fill="#F06B8F"
            stroke={C.ink}
            stroke-width="2.2"
            stroke-linejoin="round"
          />
        )}
        {react?.kind === 'sniff' && (
          <g class="pig-say" key={`say${react.n}`}>
            <path d="M206 6 H252 Q258 6 258 12 V28 Q258 34 252 34 H232 L224 42 L225 34 H206 Q200 34 200 28 V12 Q200 6 206 6 Z" fill="#fff" stroke={C.ink} stroke-width="2.4" stroke-linejoin="round" />
            <text x="229" y="25" text-anchor="middle" font-size="13" font-weight="800" fill={C.ink} font-family="Onest, system-ui, sans-serif">
              {t('pig.oink')}
            </text>
          </g>
        )}
        {react?.kind === 'wink' && (
          <g class="pig-twinkle" key={`tw${react.n}`} fill="#FFD45C" stroke="#C98A0B" stroke-width="1.4">
            <path d="M210 66 Q211 72 217 73 Q211 74 210 80 Q209 74 203 73 Q209 72 210 66 Z" />
            <path d="M222 54 Q222.6 57.4 226 58 Q222.6 58.6 222 62 Q221.4 58.6 218 58 Q221.4 57.4 222 54 Z" />
          </g>
        )}

        {shownMood === 'sleeping' && (
          <g class="zzz" fill="none" style={{ stroke: 'var(--ink)' }} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M206 54 h10 l-10 10 h10" />
            <path d="M224 32 h7 l-7 7 h7" opacity="0.7" />
          </g>
        )}

        {playDrop && (
          <g key={`c${dropKey}`}>
            <g class="coin-drop" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
              <circle cx="127" cy="20" r="12" fill={`url(#${id}-coin)`} stroke="#B98007" stroke-width="2.6" />
              <circle cx="127" cy="20" r="7" fill="none" stroke="#C98A0B" stroke-width="1.6" />
              <path d="M121 15 Q123 12 127 11.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8" />
            </g>
            <g class="slot-spark" stroke="#F5B62A" stroke-width="3" stroke-linecap="round">
              <path d="M127 38 V30" />
              <path d="M112 41 L106 36" />
              <path d="M142 41 L148 36" />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Front-facing pig head for small spots: avatar, QR badge, empty states. */
export function PigFace({ size = 24, title }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <path d="M8 13 C6 6 8 3 13 2.5 C14.5 6 15 9 14 13 Z" fill={C.body} stroke={C.ink} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M32 13 C34 6 32 3 27 2.5 C25.5 6 25 9 26 13 Z" fill={C.body} stroke={C.ink} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M10.5 10 C10 7 10.8 5.6 12.4 5 C13 7 13 8.6 12.6 10.4 Z" fill={C.innerEar} />
      <path d="M29.5 10 C30 7 29.2 5.6 27.6 5 C27 7 27 8.6 27.4 10.4 Z" fill={C.innerEar} />
      <ellipse cx="20" cy="22" rx="15" ry="14" fill={C.body} stroke={C.ink} stroke-width="1.8" />
      <path d="M10 17 Q12 12.5 17 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.7" />
      <ellipse cx="11" cy="26" rx="3" ry="2" fill={C.blush} opacity="0.6" />
      <ellipse cx="29" cy="26" rx="3" ry="2" fill={C.blush} opacity="0.6" />
      <circle cx="14.5" cy="19.5" r="1.9" fill={C.ink} />
      <circle cx="25.5" cy="19.5" r="1.9" fill={C.ink} />
      <ellipse cx="20" cy="27" rx="6.4" ry="4.8" fill={C.snout} stroke={C.ink} stroke-width="1.8" />
      <ellipse cx="17.8" cy="27" rx="1.1" ry="1.8" fill={C.ink} />
      <ellipse cx="22.2" cy="27" rx="1.1" ry="1.8" fill={C.ink} />
    </svg>
  );
}
