// Token marks drawn on a 36×36 grid.
export function TokenIcon({ symbol, size }) {
  const props = { class: 'token-icon', viewBox: '0 0 36 36', width: size, height: size, 'aria-hidden': 'true' };
  if (symbol === 'SOL') {
    return (
      <svg {...props}>
        <defs>
          <linearGradient id="tok-sol" x1="9" y1="26" x2="27" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#9945FF" />
            <stop offset="0.55" stop-color="#5A9CF0" />
            <stop offset="1" stop-color="#14F195" />
          </linearGradient>
          <radialGradient id="tok-sol-bg" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stop-color="#2A2235" />
            <stop offset="1" stop-color="#100C16" />
          </radialGradient>
        </defs>
        <circle cx="18" cy="18" r="17.5" fill="url(#tok-sol-bg)" stroke="#fff" stroke-opacity="0.14" />
        <g fill="url(#tok-sol)">
          <path d="M12.6 22.2 a0.9 0.9 0 0 1 .64-.27 H26.2 a.45.45 0 0 1 .32.77 l-3.1 3.03 a.9.9 0 0 1-.63.27 H9.82 a.45.45 0 0 1-.32-.77 Z" />
          <path d="M12.6 10.27 A.9.9 0 0 1 13.24 10 H26.2 a.45.45 0 0 1 .32.77 l-3.1 3.03 a.9.9 0 0 1-.63.26 H9.82 a.45.45 0 0 1-.32-.77 Z" />
          <path d="M23.4 16.2 a.9.9 0 0 0-.63-.26 H9.82 a.45.45 0 0 0-.32.77 l3.1 3.03 a.9.9 0 0 0 .64.26 H26.2 a.45.45 0 0 0 .32-.77 Z" />
        </g>
      </svg>
    );
  }
  if (symbol === 'USDC') {
    return (
      <svg {...props}>
        <circle cx="18" cy="18" r="18" fill="#2775CA" />
        <path d="M14.2 8.6 A10.2 10.2 0 0 0 14.2 27.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
        <path d="M21.8 8.6 A10.2 10.2 0 0 1 21.8 27.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
        <path
          d="M21.3 14.7 C21.1 13.1 19.8 12.3 18 12.3 C16 12.3 14.8 13.3 14.8 14.7 C14.8 16.3 16.2 16.9 18 17.3 C20 17.8 21.4 18.4 21.4 20.2 C21.4 21.8 20 22.8 18 22.8 C15.9 22.8 14.7 21.8 14.5 20.3"
          fill="none"
          stroke="#fff"
          stroke-width="2"
          stroke-linecap="round"
        />
        <path d="M18 10.2 V12.3 M18 22.8 V25" stroke="#fff" stroke-width="2" stroke-linecap="round" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="18" cy="18" r="18" fill="#26A17B" />
      <path d="M10.6 10.2 H25.4 V13.8 H20 V27 H16 V13.8 H10.6 Z" fill="#fff" />
      <path
        d="M18 15.6 C13.2 15.6 9.4 16.4 9.4 17.4 C9.4 18.4 13.2 19.2 18 19.2 C22.8 19.2 26.6 18.4 26.6 17.4 C26.6 16.4 22.8 15.6 18 15.6 Z"
        fill="none"
        stroke="#fff"
        stroke-width="1.7"
      />
    </svg>
  );
}
