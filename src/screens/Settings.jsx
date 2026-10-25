import { useEffect, useRef, useState } from 'preact/hooks';
import { TopBar, Toggle, PasswordField, CopyButton } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useAppState, navigate, openSheet, back, toast } from '../store.js';
import { updateSettings, revealSecret, changePassword, markBackedUp, refreshNodeHealth } from '../actions.js';
import { passwordStrength } from '../lib/vault.js';
import { NETWORKS, explorerAccount, rpcList, RPC_NAMES, RPC_PROVIDERS, GENESIS } from '../lib/config.js';
import { activeEndpoint, pingNode, rankEndpoints } from '../lib/rpc.js';
import { useSpin, useFlip } from '../components/motion.js';
import { shortAddr } from '../lib/format.js';
import { t } from '../i18n.js';
import { LANGS, NATIVE_NAMES } from '../lib/langs.js';
import { useGlider } from '../components/useGlider.js';
import { Select } from '../components/Select.jsx';

export function Settings() {
  const s = useAppState();
  const st = s.settings;
  const netSeg = useGlider();
  const themeSeg = useGlider();
  const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : 'dev';
  const customHost = (() => {
    try {
      return st.customRpc?.[st.network] ? new URL(st.customRpc[st.network]).host : '';
    } catch {
      return '';
    }
  })();
  return (
    <div class="screen">
      <TopBar title={t('settings.title')} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 22 }}>
          <div class="list-group-title" style={{ marginTop: 4 }}>
            {t('settings.security')}
          </div>
          <div class="list">
            <div class="set-row">
              <Icon name="clock" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.autolock')}</div>
                <div class="s">{t('settings.autolockHint')}</div>
              </div>
              <Select
                value={st.autoLockMinutes}
                onChange={(v) => updateSettings({ autoLockMinutes: v })}
                label={t('settings.autolock')}
                options={[
                  { value: 5, label: t('settings.min5') },
                  { value: 15, label: t('settings.min15') },
                  { value: 60, label: t('settings.hour1') },
                  { value: 240, label: t('settings.hour4') },
                  { value: 0, label: t('settings.never') },
                ]}
              />
            </div>
            <button class="set-row" onClick={() => navigate('reveal')}>
              <Icon name="key" class="ico" />
              <div class="grow">
                <div class="t">{s.wallet?.type === 'mnemonic' ? t('settings.phraseAndKey') : t('common.privateKey')}</div>
                <div class="s">{s.wallet?.backedUp ? t('settings.showAfterPw') : t('settings.notBackedUp')}</div>
              </div>
              <Icon name="chev" class="ico" />
            </button>
            <button class="set-row" onClick={() => navigate('change-password')}>
              <Icon name="lock" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.changePw')}</div>
              </div>
              <Icon name="chev" class="ico" />
            </button>
          </div>

          <div class="list-group-title">{t('send.network')}</div>
          <div class="list">
            <div class="set-row" style={{ display: 'block' }}>
              <div class="seg" ref={netSeg} role="radiogroup" aria-label={t('send.network')}>
                {Object.values(NETWORKS).map((n) => (
                  <button
                    key={n.id}
                    role="radio"
                    aria-checked={st.network === n.id}
                    class={st.network === n.id ? 'on' : ''}
                    onClick={() => updateSettings({ network: n.id })}
                  >
                    {n.id === 'mainnet' ? 'Mainnet' : t('settings.devnetLabel')}
                  </button>
                ))}
              </div>
              <div class="hint">{st.network === 'devnet' ? t('settings.devnetHint') : t('settings.mainnetHint')}</div>
            </div>
            <button class="set-row" onClick={() => navigate('rpc')}>
              <Icon name="globe" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.rpc')}</div>
                <div class="s">{customHost ? t('settings.rpcOwn', { host: customHost }) : t('settings.rpcDefault')}</div>
              </div>
              <Icon name="chev" class="ico" />
            </button>
          </div>

          <div class="list-group-title">{t('settings.notifications')}</div>
          <div class="list">
            <div class="set-row">
              <Icon name="bell" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.deposits')}</div>
                <div class="s">{t('settings.depositsHint')}</div>
              </div>
              <Toggle on={st.notifyDeposits} onChange={(v) => updateSettings({ notifyDeposits: v })} label={t('settings.deposits')} />
            </div>
            <div class="set-row">
              <Icon name="target" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.reminders')}</div>
                <div class="s">{t('settings.remindersHint')}</div>
              </div>
              <Select
                value={st.reminder}
                onChange={(v) => updateSettings({ reminder: v })}
                label={t('settings.reminders')}
                options={[
                  { value: 'off', label: t('settings.off') },
                  { value: 'daily', label: t('settings.daily') },
                  { value: 'weekly', label: t('settings.weekly') },
                ]}
              />
            </div>
          </div>

          <div class="list-group-title">{t('settings.display')}</div>
          <div class="list">
            <div class="set-row" style={{ display: 'block' }}>
              <div class="set-head">
                <Icon name="contrast" class="ico" />
                <div class="t">{t('theme.title')}</div>
              </div>
              <div class="seg" ref={themeSeg} role="radiogroup" aria-label={t('theme.title')}>
                {['auto', 'light', 'dark'].map((v) => {
                  const on = (st.theme || 'auto') === v;
                  return (
                    <button key={v} role="radio" aria-checked={on} class={on ? 'on' : ''} onClick={() => updateSettings({ theme: v })}>
                      <Icon name={v === 'auto' ? 'contrast' : v === 'light' ? 'sun' : 'moon'} />
                      {t(`theme.${v}`)}
                    </button>
                  );
                })}
              </div>
              {(st.theme || 'auto') === 'auto' && <div class="hint">{t('theme.autoHint')}</div>}
            </div>
            <div class="set-row">
              <Icon name="globe" class="ico" />
              <div class="grow">
                <div class="t">{t('settings.language')}</div>
              </div>
              <Select
                value={st.language || 'auto'}
                onChange={(v) => updateSettings({ language: v })}
                label={t('settings.language')}
                options={[{ value: 'auto', label: t('settings.langAuto') }, ...LANGS.map((l) => ({ value: l, label: NATIVE_NAMES[l] }))]}
              />
            </div>
            <div class="set-row">
              <Icon name={st.hideBalances ? 'eyeOff' : 'eye'} class="ico" />
              <div class="grow">
                <div class="t">{t('settings.hide')}</div>
                <div class="s">{t('settings.hideHint')}</div>
              </div>
              <Toggle on={st.hideBalances} onChange={(v) => updateSettings({ hideBalances: v })} label={t('settings.hide')} />
            </div>
          </div>

          <div class="list-group-title">{t('home.wallet')}</div>
          <div class="list">
            <a class="set-row" href={explorerAccount(s.wallet.publicKey, st.network)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <Icon name="wallet" class="ico" />
              <div class="grow">
                <div class="t">{shortAddr(s.wallet.publicKey, 6)}</div>
                <div class="s">
                  {s.wallet.type === 'mnemonic'
                    ? t('settings.fromPhrase', { path: s.wallet.path || "m/44'/501'/0'/0'" })
                    : t('settings.fromKey')}
                </div>
              </div>
              <Icon name="external" class="ico" />
            </a>
            <button class="set-row danger" onClick={() => openSheet('reset')}>
              <Icon name="trash" class="ico" />
              <div class="grow">
                <div class="t">{t('reset.title')}</div>
              </div>
            </button>
          </div>
          <p class="hint center" style={{ marginTop: 16 }}>
            {t('settings.about', { version })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Reveal({ params }) {
  const s = useAppState();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null);
  const [tab, setTab] = useState(s.wallet.type === 'mnemonic' ? 'seed' : 'key');
  const [shown, setShown] = useState(false);
  const tabSeg = useGlider();

  async function submit() {
    if (!pw || busy) return;
    setBusy(true);
    setErr('');
    try {
      setSecret(await revealSecret(pw));
      setPw('');
    } catch {
      setErr(t('unlock.wrong'));
    }
    setBusy(false);
  }

  return (
    <div class="screen">
      <TopBar title={params?.backup ? t('reveal.backupTitle') : t('reveal.title')} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 20 }}>
          <div class="banner warn">
            <Icon name="alert" />
            <div>{t('reveal.warn')}</div>
          </div>
          {!secret ? (
            <div style={{ marginTop: 16 }}>
              <label class="label" for="rv-pw">
                {t('reveal.password')}
              </label>
              <PasswordField id="rv-pw" value={pw} onInput={setPw} autoFocus error={!!err} onEnter={submit} />
              {err && <div class="hint err">{err}</div>}
              <button class="btn btn-primary block" style={{ marginTop: 14 }} disabled={!pw || busy} onClick={submit}>
                {busy ? t('reveal.checking') : t('reveal.show')}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {secret.type === 'mnemonic' && (
                <div class="seg" ref={tabSeg} style={{ marginBottom: 12 }} role="tablist">
                  {/* each secret is revealed on its own: switching tabs covers it again */}
                  <button
                    role="tab"
                    aria-selected={tab === 'seed'}
                    class={tab === 'seed' ? 'on' : ''}
                    onClick={() => {
                      setTab('seed');
                      setShown(false);
                    }}
                  >
                    {t('common.seedPhrase')}
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'key'}
                    class={tab === 'key' ? 'on' : ''}
                    onClick={() => {
                      setTab('key');
                      setShown(false);
                    }}
                  >
                    {t('common.privateKey')}
                  </button>
                </div>
              )}
              {tab === 'seed' && secret.mnemonic ? (
                <>
                  <div class={`seed-grid${shown ? '' : ' blurred'}`}>
                    {secret.mnemonic.split(' ').map((w, i) => (
                      <div class="seed-word" key={i} style={{ '--i': i }}>
                        <i>{i + 1}</i>
                        <span>{w}</span>
                      </div>
                    ))}
                    {!shown && (
                      <button class="seed-cover" onClick={() => setShown(true)}>
                        <Icon name="eye" />
                        {t('common.tapToReveal')}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <CopyButton text={secret.mnemonic} label={t('common.copy')} />
                  </div>
                  {!s.wallet.backedUp && (
                    <button
                      class="btn btn-coin block"
                      style={{ marginTop: 16 }}
                      onClick={async () => {
                        await markBackedUp();
                        toast(t('reveal.savedToast'));
                        back();
                      }}
                    >
                      {t('seed.wroteDown')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div
                    class={`field${shown ? '' : ' blurred'}`}
                    style={{ padding: '12px 14px', wordBreak: 'break-all', fontWeight: 600, fontSize: 14, position: 'relative', minHeight: 90 }}
                  >
                    <span style={shown ? null : { filter: 'blur(6px)' }}>{secret.privateKey}</span>
                    {!shown && (
                      <button class="seed-cover" onClick={() => setShown(true)}>
                        <Icon name="eye" />
                        {t('common.tapToReveal')}
                      </button>
                    )}
                  </div>
                  <p class="hint">{t('reveal.keyFormat')}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <CopyButton text={secret.privateKey} label={t('reveal.copyKey')} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChangePassword() {
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = oldPw && pw.length >= 8 && pw === pw2;
  const strength = passwordStrength(pw);

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    try {
      await changePassword(oldPw, pw);
      toast(t('changePw.done'));
      back();
    } catch {
      setErr(t('changePw.wrongOld'));
      setBusy(false);
    }
  }

  return (
    <div class="screen">
      <TopBar title={t('settings.changePw')} />
      <div class="scroll">
        <div class="pad stack" style={{ paddingBottom: 20 }}>
          <div>
            <label class="label" for="cp-old">
              {t('changePw.current')}
            </label>
            <PasswordField id="cp-old" value={oldPw} onInput={setOld} autoFocus error={!!err} />
            {err && <div class="hint err">{err}</div>}
          </div>
          <div>
            <label class="label" for="cp-new">
              {t('changePw.new')}
            </label>
            <PasswordField id="cp-new" value={pw} onInput={setPw} placeholder={t('pw.min8')} />
            {pw && (
              <>
                <div class={`strength s${Math.max(1, strength)}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div class={`hint${pw.length < 8 ? ' err' : ''}`}>
                  {pw.length < 8 ? t('pw.tooShort') : strength ? t(`pw.strength${strength}`) : ''}
                </div>
              </>
            )}
          </div>
          <div>
            <label class="label" for="cp-new2">
              {t('changePw.repeat')}
            </label>
            <PasswordField id="cp-new2" value={pw2} onInput={setPw2} error={pw2 && pw !== pw2} onEnter={submit} />
            {pw2 && pw !== pw2 && <div class="hint err">{t('pw.mismatch')}</div>}
          </div>
          <button class="btn btn-primary block" disabled={!ok || busy} onClick={submit}>
            {busy ? t('common.saving') : t('settings.changePw')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RpcSettings() {
  const s = useAppState();
  const net = s.settings.network;
  const netName = net === 'mainnet' ? 'Mainnet' : 'Devnet';
  const saved = s.settings.customRpc?.[net] || '';
  const [url, setUrl] = useState(saved);
  const [state, setState] = useState({ status: 'idle', msg: '' });
  const [pings, setPings] = useState({}); // url -> { ok, ms, busy, wrong } | 'checking'
  const [checking, setChecking] = useState(false);
  const spinRef = useSpin(checking);
  const listRef = useFlip();
  const nodes = rpcList(s.settings);
  const active = activeEndpoint(nodes);
  // best first; the order holds still while a check runs, then rows slide into place
  const order = useRef(null);
  const sameSet = order.current && order.current.length === nodes.length && nodes.every((n) => order.current.includes(n));
  if (!checking || !sameSet) order.current = rankEndpoints(nodes);
  const shown = order.current;

  async function checkAll() {
    if (checking) return;
    setChecking(true);
    setPings(Object.fromEntries(nodes.map((n) => [n, 'checking'])));
    // the check also re-ranks the nodes, so the app moves to the fastest one that answers
    await refreshNodeHealth({ force: true, onEach: (n, r) => setPings((p) => ({ ...p, [n]: r })) }).catch(() => {});
    setChecking(false);
  }
  useEffect(() => {
    checkAll();
  }, [net, saved]);

  async function save() {
    const v = url.trim();
    if (!v) return reset();
    let parsed;
    try {
      parsed = new URL(v);
      if (parsed.protocol !== 'https:') throw new Error();
    } catch {
      setState({ status: 'err', msg: t('rpc.needHttps') });
      return;
    }
    setState({ status: 'checking', msg: t('rpc.checking') });
    const r = await pingNode(v, 8000);
    if (!r.ok) {
      setState({ status: 'err', msg: t('rpc.noAnswer', { reason: r.error }) });
      return;
    }
    if (r.genesis !== GENESIS[net]) {
      setState({ status: 'err', msg: t('rpc.wrongNet', { net: netName }) });
      return;
    }
    await updateSettings({ customRpc: { ...s.settings.customRpc, [net]: v } });
    setState({ status: 'ok', msg: t('rpc.works', { ms: r.ms }) });
    toast(t('rpc.saved'));
  }

  async function reset() {
    setUrl('');
    setState({ status: 'idle', msg: '' });
    await updateSettings({ customRpc: { ...s.settings.customRpc, [net]: '' } });
    toast(t('rpc.resetToast'));
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return toast(t('rpc.clipboardEmpty'));
      setUrl(text);
      setState({ status: 'idle', msg: '' });
    } catch {
      toast(t('rpc.pasteManually'));
    }
  }

  const hostOf = (n) => {
    try {
      return new URL(n).host;
    } catch {
      return n;
    }
  };
  const dirty = url.trim() !== saved;

  return (
    <div class="screen">
      <TopBar title={t('rpc.title')} />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 20 }}>
          <div class="list-group-title" style={{ marginTop: 4 }}>
            {t('rpc.nowTitle')}
          </div>
          <div class="list rpc-nodes" ref={listRef}>
            {shown.map((n, i) => {
              const p = pings[n];
              const own = saved && n === saved;
              const status = !p || p === 'checking' ? 'wait' : p.ok ? (p.ms > 1200 ? 'slow' : 'ok') : p.busy ? 'slow' : 'down';
              return (
                <div class={`rpc-node${n === active ? ' active' : ''}`} key={n} data-flip={n} style={{ '--i': i }}>
                  <span class={`rpc-dot ${status}`} aria-hidden="true" />
                  <div class="grow">
                    <div class="t">
                      {own ? t('rpc.yours') : RPC_NAMES[hostOf(n)] || hostOf(n)}
                      {n === active && <span class="rpc-tag">{t('rpc.inUse')}</span>}
                    </div>
                    <div class="s">{hostOf(n)}</div>
                  </div>
                  <div class={`rpc-ms num ${status}`} key={p === 'checking' ? 'c' : p?.ms ?? p?.error}>
                    {!p || p === 'checking'
                      ? '···'
                      : p.ok
                        ? t('rpc.ms', { n: p.ms })
                        : p.wrong
                          ? t('rpc.otherNet')
                          : p.busy
                            ? t('rpc.busy')
                            : t('rpc.down')}
                  </div>
                </div>
              );
            })}
            <button class="rpc-check" onClick={checkAll} disabled={checking}>
              <span class="refresh-ico" ref={spinRef}>
                <Icon name="refresh" />
              </span>
              {checking ? t('rpc.checkingAll') : t('rpc.check')}
            </button>
          </div>
          <p class="hint">{t('rpc.autoSwitch')}</p>

          <div class="list-group-title">{t('rpc.ownTitle')}</div>
          <div class="rpc-own">
            <p class="small muted" style={{ margin: '0 0 10px' }}>
              {t('rpc.ownText')}
            </p>
            <div class="chips" style={{ marginBottom: 12 }}>
              {RPC_PROVIDERS.map((pr) => (
                <a class="chip rpc-provider" key={pr.name} href={pr.url} target="_blank" rel="noreferrer">
                  {pr.name}
                  <Icon name="external" />
                </a>
              ))}
            </div>
            <label class="label" for="rpc-url">
              {t('rpc.label', { net: netName })}
            </label>
            <div class={`field${state.status === 'err' ? ' error' : ''}`}>
              <input
                id="rpc-url"
                value={url}
                onInput={(e) => {
                  setUrl(e.currentTarget.value);
                  setState({ status: 'idle', msg: '' });
                }}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder={net === 'mainnet' ? 'https://mainnet.helius-rpc.com/?api-key=…' : 'https://devnet.helius-rpc.com/?api-key=…'}
                spellcheck={false}
              />
              <div class="suffix">
                <button class="btn btn-ghost sm" onClick={paste} type="button">
                  <Icon name="paste" />
                  {t('send.paste')}
                </button>
              </div>
            </div>
            {state.msg && <div class={`hint${state.status === 'err' ? ' err' : state.status === 'ok' ? ' ok' : ''}`}>{state.msg}</div>}
            <div class="hint">{t('rpc.fallbackNote')}</div>
            <button class="btn btn-primary block" style={{ marginTop: 14 }} onClick={save} disabled={state.status === 'checking' || !url.trim() || !dirty}>
              {state.status === 'checking' ? t('reveal.checking') : t('rpc.connect')}
            </button>
            {saved && (
              <button class="btn btn-ghost block" style={{ marginTop: 6 }} onClick={reset}>
                {t('rpc.backToPublic')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
