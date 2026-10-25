import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import { TopBar, CopyButton, copyText } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { TokenIcon } from '../components/TokenIcon.jsx';
import { PigFace } from '../components/Pig.jsx';
import { useAppState, toast } from '../store.js';
import { airdrop } from '../actions.js';
import { explorerAccount, TOKENS } from '../lib/config.js';
import { t } from '../i18n.js';

export function Deposit() {
  const s = useAppState();
  const addr = s.wallet.publicKey;
  const devnet = s.settings.network === 'devnet';
  const [svg, setSvg] = useState('');
  const [dropping, setDropping] = useState(false);
  const [qrCopied, setQrCopied] = useState(0);
  useEffect(() => {
    if (!qrCopied) return;
    const tm = setTimeout(() => setQrCopied(0), 1400);
    return () => clearTimeout(tm);
  }, [qrCopied]);

  useEffect(() => {
    QRCode.toString(addr, { type: 'svg', margin: 0, errorCorrectionLevel: 'H', color: { dark: '#3A0F1F', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [addr]);

  const chunks = addr.match(/.{1,4}/g) || [];

  return (
    <div class="screen">
      <TopBar title={t('deposit.title')} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 18 }}>
          <button
            type="button"
            class={`qr-card${svg ? ' ready' : ''}${qrCopied ? ' copied' : ''}`}
            onClick={async () => {
              if (await copyText(addr, t('home.addrCopied'))) setQrCopied(Date.now());
            }}
            title={t('deposit.qrCopy')}
            aria-label={t('deposit.qrCopy')}
          >
            <div class="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
            <span class="qr-scan" aria-hidden="true" />
            <div class="qr-badge" aria-hidden="true">
              <PigFace size={36} />
            </div>
            {qrCopied > 0 && (
              <span class="qr-copied" key={qrCopied} aria-hidden="true">
                <Icon name="check" />
              </span>
            )}
          </button>

          <p class="center muted small" style={{ margin: '12px 0 8px' }}>
            {t('deposit.addrLabel')}
          </p>
          <div class="addr-box">
            <div class="addr-text">
              {chunks.map((c, i) => (
                <span key={i} style={{ '--i': i }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <CopyButton text={addr} label={t('home.copyAddr')} done={t('home.addrCopied')} class="btn btn-primary block" />
          </div>

          <div class="banner warn" style={{ marginTop: 14 }}>
            <Icon name="alert" />
            <div>
              {t('deposit.warn')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            {['USDC', 'USDT', 'SOL'].filter((sym) => sym === 'SOL' || TOKENS[sym].mint[s.settings.network]).map((sym) => (
              <span class="chip" key={sym} style={{ paddingLeft: 6 }}>
                <TokenIcon symbol={sym} size={20} />
                {sym}
              </span>
            ))}
          </div>

          {devnet && (
            <div class="list" style={{ marginTop: 14 }}>
              <div class="set-row">
                <Icon name="drop" class="ico" />
                <div class="grow">
                  <div class="t">{t('deposit.testCoins')}</div>
                  <div class="s">{t('deposit.testText')}</div>
                </div>
              </div>
              <div class="set-row" style={{ gap: 8 }}>
                <button
                  class="btn btn-soft sm"
                  disabled={dropping}
                  onClick={async () => {
                    setDropping(true);
                    try {
                      await airdrop();
                      toast(t('deposit.airdropOk'));
                    } catch {
                      toast(t('deposit.airdropFail'), 'err');
                    }
                    setDropping(false);
                  }}
                >
                  {dropping ? t('deposit.requesting') : t('deposit.get1Sol')}
                </button>
                <a class="btn btn-ghost sm" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
                  {t('deposit.testUsdc')}
                  <Icon name="external" />
                </a>
              </div>
            </div>
          )}

          <details class="how" style={{ marginTop: 14 }}>
            <summary>
              {t('deposit.howExchange')}
              <Icon name="chev" />
            </summary>
            <ol>
              <li>{t('deposit.ex1')}</li>
              <li>{t('deposit.ex2')}</li>
              <li>{t('deposit.ex3')}</li>
              <li>{t('deposit.ex4')}</li>
            </ol>
          </details>
          <details class="how" style={{ marginTop: 8 }}>
            <summary>
              {t('deposit.howWallet')}
              <Icon name="chev" />
            </summary>
            <ol>
              <li>{t('deposit.w1')}</li>
              <li>{t('deposit.w2')}</li>
              <li>{t('deposit.w3')}</li>
            </ol>
          </details>
          <div class="center" style={{ marginTop: 14 }}>
            <a class="link-btn" href={explorerAccount(addr, s.settings.network)} target="_blank" rel="noreferrer">
              {t('deposit.solscan')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
