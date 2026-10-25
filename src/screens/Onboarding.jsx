import { useEffect, useMemo, useState } from 'preact/hooks';
import { Pig } from '../components/Pig.jsx';
import { Icon } from '../components/icons.jsx';
import { TopBar, PasswordField, Steps, CopyButton, fireConfetti } from '../components/ui.jsx';
import { getState, setState, navigate, replace, back, toast, openSheet } from '../store.js';
import { passwordStrength } from '../lib/vault.js';
import {
  newMnemonic,
  isValidMnemonic,
  normalizeMnemonic,
  keypairFromMnemonic,
  keypairFromPrivateKey,
  looksLikeMnemonic,
} from '../lib/keys.js';
import { createWallet, discoverPath, unlock } from '../actions.js';
import { shortAddr } from '../lib/format.js';
import bs58 from 'bs58';
import { isExtension } from '../lib/storage.js';
import { t } from '../i18n.js';
import { useGlider } from '../components/useGlider.js';

const inTab = () => new URLSearchParams(location.search).get('mode') === 'tab';

/** Wallet setup is long enough that the popup may close mid-way; run it in a tab. */
export function startOnboarding(mode) {
  if (isExtension && !inTab()) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?mode=tab&start=${mode}`) });
    window.close();
    return;
  }
  setState({ onboarding: { mode } });
  navigate(mode === 'create' ? 'create-password' : 'import');
}

function useGuard(ok) {
  useEffect(() => {
    if (!ok) replace('welcome');
  }, [ok]);
  return ok;
}

// ---------------------------------------------------------------- welcome

export function Welcome() {
  const [level, setLevel] = useState(0.08);
  useEffect(() => {
    const tm = setTimeout(() => setLevel(0.62), 350);
    return () => clearTimeout(tm);
  }, []);
  return (
    <div class="screen">
      <div class="scroll">
        <div class="onb">
          <div class="onb-hero">
            <div style={{ width: 136, marginLeft: -4 }}>
              <Pig level={level} interactive />
            </div>
            <div class="brand-mark">PiggyBank</div>
            <h1 class="onb-title" style={{ marginTop: 4 }}>
              {t('welcome.title')}
            </h1>
            <p class="lead">{t('welcome.lead')}</p>
            <ul class="perks">
              <li>
                <span class="dot">
                  <Icon name="target" />
                </span>
                {t('welcome.perkGoals')}
              </li>
              <li>
                <span class="dot">
                  <Icon name="shield" />
                </span>
                {t('welcome.perkKeys')}
              </li>
              <li>
                <span class="dot">
                  <Icon name="down" />
                </span>
                {t('welcome.perkDeposit')}
              </li>
            </ul>
          </div>
          <div class="onb-foot">
            <button class="btn btn-primary block" onClick={() => startOnboarding('create')}>
              {t('welcome.create')}
            </button>
            <button class="btn btn-soft block" onClick={() => startOnboarding('import')}>
              {t('welcome.haveWallet')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- password

export function CreatePassword() {
  const ob = getState().onboarding;
  const isImport = ob.mode === 'import';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const strength = passwordStrength(pw);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = pw.length >= 8 && pw === pw2;
  const strengthText = strength ? t(`pw.strength${strength}`) : '';

  async function submit() {
    setTouched(true);
    if (!ok || busy) return;
    if (!isImport) {
      setState({ onboarding: { ...ob, password: pw, mnemonic: newMnemonic() } });
      navigate('seed-show');
      return;
    }
    setBusy(true);
    try {
      await createWallet(ob.secret, pw, { backedUp: true });
      replace('ready', { imported: true });
    } catch (e) {
      toast(t('pw.saveFailed', { reason: e.message }), 'err');
      setBusy(false);
    }
  }

  return (
    <div class="screen">
      <TopBar title="" />
      <div class="scroll">
        <div class="onb">
          <Steps total={isImport ? 2 : 3} current={isImport ? 2 : 1} />
          <h1 class="onb-title" style={{ fontSize: 26 }}>
            {t('pw.title')}
          </h1>
          <p class="lead">{t('pw.lead')}</p>
          <div style={{ marginTop: 20 }}>
            <label class="label" for="pw1">
              {t('common.password')}
            </label>
            <PasswordField id="pw1" value={pw} onInput={setPw} placeholder={t('pw.min8')} autoFocus />
            {pw && (
              <>
                <div class={`strength s${Math.max(1, strength)}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div class={`hint${tooShort ? ' err' : ''}`}>{tooShort ? t('pw.tooShort') : strengthText}</div>
              </>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <label class="label" for="pw2">
              {t('pw.repeat')}
            </label>
            <PasswordField
              id="pw2"
              value={pw2}
              onInput={setPw2}
              placeholder={t('pw.again')}
              error={mismatch && touched}
              onEnter={submit}
            />
            {mismatch && <div class="hint err">{t('pw.mismatch')}</div>}
          </div>
          <div class="grow" />
          <div class="onb-foot">
            <button class="btn btn-primary block" disabled={!ok || busy} onClick={submit}>
              {busy ? t('common.saving') : isImport ? t('unlock.open') : t('common.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- seed phrase

export function SeedShow() {
  const ob = getState().onboarding;
  const [revealed, setRevealed] = useState(false);
  const words = ob.mnemonic?.split(' ') || [];
  if (!useGuard(!!ob.mnemonic)) return null;

  return (
    <div class="screen">
      <TopBar title="" />
      <div class="scroll">
        <div class="onb">
          <Steps total={3} current={2} />
          <h1 class="onb-title" style={{ fontSize: 26 }}>
            {t('common.seedPhrase')}
          </h1>
          <p class="lead">{t('seed.lead')}</p>
          <div class={`seed-grid${revealed ? '' : ' blurred'}`} style={{ marginTop: 16 }}>
            {words.map((w, i) => (
              <div class="seed-word" key={i} style={{ '--i': i }}>
                <i>{i + 1}</i>
                <span>{w}</span>
              </div>
            ))}
            {!revealed && (
              <button class="seed-cover" onClick={() => setRevealed(true)}>
                <Icon name="eye" />
                {t('common.tapToReveal')}
              </button>
            )}
          </div>
          <div class="banner warn" style={{ marginTop: 12 }}>
            <Icon name="alert" />
            <div>{t('seed.warn')}</div>
          </div>
          {revealed && (
            <div style={{ marginTop: 10 }}>
              <CopyButton text={ob.mnemonic} label={t('seed.copy')} class="btn btn-ghost sm" />
            </div>
          )}
          <div class="grow" />
          <div class="onb-foot">
            <button class="btn btn-primary block" disabled={!revealed} onClick={() => navigate('seed-verify')}>
              {t('seed.wroteDown')}
            </button>
            <button class="btn btn-ghost block" onClick={() => openSheet('skip-backup')}>
              {t('seed.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SeedVerify() {
  const ob = getState().onboarding;
  const words = ob.mnemonic?.split(' ') || [];
  const questions = useMemo(() => {
    const idx = shuffle([...Array(12).keys()])
      .slice(0, 3)
      .sort((a, b) => a - b);
    return idx.map((i) => {
      const others = shuffle(words.filter((w, j) => j !== i && w !== words[i])).slice(0, 3);
      return { index: i, answer: words[i], options: shuffle([words[i], ...others]) };
    });
  }, [ob.mnemonic]);
  const [picked, setPicked] = useState({});
  const [wrong, setWrong] = useState({});
  const [busy, setBusy] = useState(false);
  const allRight = questions.every((q) => picked[q.index] === q.answer);

  async function finish() {
    if (!allRight || busy) return;
    setBusy(true);
    try {
      await createWallet({ type: 'mnemonic', mnemonic: ob.mnemonic, path: "m/44'/501'/0'/0'" }, ob.password, {
        backedUp: true,
      });
      replace('ready');
    } catch (e) {
      toast(t('verify.createFailed', { reason: e.message }), 'err');
      setBusy(false);
    }
  }

  if (!useGuard(!!ob.mnemonic)) return null;

  return (
    <div class="screen">
      <TopBar title="" />
      <div class="scroll">
        <div class="onb">
          <Steps total={3} current={3} />
          <h1 class="onb-title" style={{ fontSize: 26 }}>
            {t('verify.title')}
          </h1>
          <p class="lead">{t('verify.lead')}</p>
          <div style={{ marginTop: 10 }}>
            {questions.map((q) => (
              <div class="verify-q" key={q.index}>
                <div class="q">{t('verify.word', { n: q.index + 1 })}</div>
                <div class="chips">
                  {q.options.map((opt) => {
                    const isPicked = picked[q.index] === opt;
                    const right = isPicked && opt === q.answer;
                    const isWrong = wrong[q.index]?.opt === opt;
                    return (
                      <button
                        key={opt + (isWrong ? wrong[q.index].n : '')}
                        class={`chip${right ? ' right' : ''}${isWrong ? ' wrong' : ''}`}
                        onClick={() => {
                          if (opt === q.answer) {
                            setPicked({ ...picked, [q.index]: opt });
                            setWrong({ ...wrong, [q.index]: null });
                          } else {
                            setWrong({ ...wrong, [q.index]: { opt, n: (wrong[q.index]?.n || 0) + 1 } });
                            setPicked({ ...picked, [q.index]: null });
                          }
                        }}
                      >
                        {right && <Icon name="check" size={14} />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div class="grow" />
          <div class="onb-foot">
            <button class="btn btn-primary block" disabled={!allRight || busy} onClick={finish}>
              {busy ? t('verify.creating') : t('welcome.create')}
            </button>
            <button class="btn btn-ghost block" onClick={back}>
              {t('verify.showAgain')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkipBackupSheet() {
  const ob = getState().onboarding;
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p class="muted" style={{ marginTop: 0 }}>
        {t('skip.text')}
      </p>
      <div class="onb-foot" style={{ paddingTop: 6 }}>
        <button class="btn btn-primary block" onClick={() => setState({ sheet: null })}>
          {t('skip.goBack')}
        </button>
        <button
          class="btn btn-ghost block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await createWallet({ type: 'mnemonic', mnemonic: ob.mnemonic, path: "m/44'/501'/0'/0'" }, ob.password, {
              backedUp: false,
            });
            replace('ready');
          }}
        >
          {t('skip.anyway')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- import

export function ImportWallet() {
  const [mode, setMode] = useState('seed');
  const modeSeg = useGlider();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const analysis = useMemo(() => {
    const v = text.trim();
    if (!v) return { state: 'empty' };
    if (mode === 'seed') {
      const words = normalizeMnemonic(v).split(' ').filter(Boolean);
      if (![12, 15, 18, 21, 24].includes(words.length))
        return { state: 'typing', msg: t('import.wordCount', { n: words.length }) };
      if (!isValidMnemonic(v)) return { state: 'error', msg: t('import.badPhrase') };
      return { state: 'ok', address: keypairFromMnemonic(v).publicKey.toBase58() };
    }
    if (looksLikeMnemonic(v)) return { state: 'error', msg: t('import.looksLikePhrase') };
    try {
      const kp = keypairFromPrivateKey(v);
      return { state: 'ok', address: kp.publicKey.toBase58(), secretKey: bs58.encode(kp.secretKey) };
    } catch (e) {
      const msg =
        e.message === 'length'
          ? t('import.keyShort')
          : e.message === 'format'
            ? t('import.keyFormat')
            : t('import.keyBroken');
      return { state: 'error', msg };
    }
  }, [text, mode]);

  async function next() {
    if (analysis.state !== 'ok' || busy) return;
    const ob = getState().onboarding;
    if (mode === 'seed') {
      setBusy(true);
      const mnemonic = normalizeMnemonic(text);
      const path = await discoverPath(mnemonic);
      setState({ onboarding: { ...ob, mode: 'import', secret: { type: 'mnemonic', mnemonic, path } } });
      setBusy(false);
    } else {
      setState({ onboarding: { ...ob, mode: 'import', secret: { type: 'privateKey', secretKey: analysis.secretKey } } });
    }
    setText('');
    navigate('create-password');
  }

  return (
    <div class="screen">
      <TopBar title="" />
      <div class="scroll">
        <div class="onb">
          <Steps total={2} current={1} />
          <h1 class="onb-title" style={{ fontSize: 26 }}>
            {t('import.title')}
          </h1>
          <p class="lead">{t('import.lead')}</p>
          <div class="seg" ref={modeSeg} style={{ marginTop: 16 }} role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'seed'}
              class={mode === 'seed' ? 'on' : ''}
              onClick={() => {
                setMode('seed');
                setText('');
              }}
            >
              {t('common.seedPhrase')}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'key'}
              class={mode === 'key' ? 'on' : ''}
              onClick={() => {
                setMode('key');
                setText('');
              }}
            >
              {t('common.privateKey')}
            </button>
          </div>
          <div class={`field${analysis.state === 'error' ? ' error' : ''}`} style={{ marginTop: 12 }}>
            <textarea
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              placeholder={mode === 'seed' ? t('import.phPhrase') : t('import.phKey')}
              spellcheck={false}
              autocomplete="off"
              autoFocus
              aria-label={mode === 'seed' ? t('common.seedPhrase') : t('common.privateKey')}
              style={mode === 'key' ? { wordBreak: 'break-all' } : null}
            />
          </div>
          {analysis.msg && <div class={`hint${analysis.state === 'error' ? ' err' : ''}`}>{analysis.msg}</div>}
          {analysis.state === 'ok' && (
            <div class="banner ok" style={{ marginTop: 10 }}>
              <Icon name="check" />
              <div>
                {t('import.ok')} <b>{shortAddr(analysis.address, 6)}</b>
                {mode === 'seed' && <div class="small">{t('import.willFind')}</div>}
              </div>
            </div>
          )}
          <div class="banner" style={{ marginTop: 10 }}>
            <Icon name="shield" />
            <div>{t('import.private')}</div>
          </div>
          <div class="grow" />
          <div class="onb-foot">
            <button class="btn btn-primary block" disabled={analysis.state !== 'ok' || busy} onClick={next}>
              {busy ? t('import.searching') : t('common.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ready

export function Ready({ params }) {
  const [drop, setDrop] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setDrop(1), 300);
    const t2 = setTimeout(fireConfetti, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <div class="screen">
      <div class="onb" style={{ paddingTop: 40 }}>
        <div style={{ width: 200, margin: '0 auto' }}>
          <Pig level={0.18} dropKey={drop} mood="happy" interactive />
        </div>
        <h1 class="onb-title center" style={{ marginTop: 22 }}>
          {t('ready.title')}
        </h1>
        <p class="lead center">{params?.imported ? t('ready.leadImported') : t('ready.lead')}</p>
        <div class="grow" />
        <div class="onb-foot">
          <button
            class="btn btn-coin block"
            onClick={() => {
              replace('home');
              navigate('goal-edit', { first: true });
            }}
          >
            {t('ready.firstGoal')}
          </button>
          <button class="btn btn-ghost block" onClick={() => replace('home')}>
            {t('ready.toHome')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- unlock

export function Unlock() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [woke, setWoke] = useState(false);

  async function submit() {
    if (!pw || busy) return;
    setBusy(true);
    setErr('');
    try {
      await unlock(pw, {
        // the piggy wakes up and catches a coin before home opens
        beforeEnter: () => {
          setWoke(true);
          const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          return new Promise((r) => setTimeout(r, still ? 0 : 800));
        },
      });
    } catch (e) {
      setErr(e.message === 'bad-password' ? t('unlock.wrong') : t('unlock.failed', { reason: e.message }));
      setShakeKey((k) => k + 1);
      setBusy(false);
    }
  }

  return (
    <div class="screen">
      <div class="onb" style={{ paddingTop: 48 }}>
        <div class={`unlock-pig${woke ? ' woke' : ''}`}>
          <Pig level={0} sleeping={!woke} mood={woke ? 'happy' : undefined} dropKey={woke ? 1 : 0} interactive={!woke} />
        </div>
        <h1 class="onb-title center" style={{ marginTop: 22, fontSize: 26 }}>
          {woke ? t('unlock.hello') : t('unlock.title')}
        </h1>
        <p class="lead center">{t('unlock.lead')}</p>
        <div key={shakeKey} class={shakeKey ? 'shake' : ''} style={{ marginTop: 22 }}>
          <PasswordField value={pw} onInput={setPw} autoFocus error={!!err} onEnter={submit} />
          {err && <div class="hint err">{err}</div>}
        </div>
        <div class="grow" />
        <div class="onb-foot">
          <button class="btn btn-primary block" disabled={!pw || busy} onClick={submit}>
            {busy ? t('unlock.opening') : t('unlock.open')}
          </button>
          <button class="btn btn-ghost block" onClick={() => openSheet('forgot')}>
            {t('unlock.forgot')}
          </button>
        </div>
      </div>
    </div>
  );
}
