import { useEffect } from 'preact/hooks';
import { useAppState, setState, getState } from './store.js';
import { boot, touch } from './actions.js';
import { Toast, fireConfetti } from './components/ui.jsx';
import { Pig } from './components/Pig.jsx';
import { applyTheme } from './theme.js';
import { SheetHost } from './screens/Sheets.jsx';
import { Welcome, CreatePassword, SeedShow, SeedVerify, ImportWallet, Ready, Unlock, startOnboarding } from './screens/Onboarding.jsx';
import { Home } from './screens/Home.jsx';
import { Goals, GoalDetail, GoalEdit } from './screens/Goals.jsx';
import { Deposit } from './screens/Deposit.jsx';
import { Send } from './screens/Send.jsx';
import { Swap } from './screens/Swap.jsx';
import { History } from './screens/History.jsx';
import { Settings, Reveal, ChangePassword, RpcSettings } from './screens/Settings.jsx';

const SCREENS = {
  welcome: Welcome,
  'create-password': CreatePassword,
  'seed-show': SeedShow,
  'seed-verify': SeedVerify,
  import: ImportWallet,
  ready: Ready,
  unlock: Unlock,
  home: Home,
  goals: Goals,
  goal: GoalDetail,
  'goal-edit': GoalEdit,
  deposit: Deposit,
  send: Send,
  swap: Swap,
  history: History,
  settings: Settings,
  reveal: Reveal,
  'change-password': ChangePassword,
  rpc: RpcSettings,
};

// Screens that need an unlocked wallet.
const PROTECTED = new Set(['home', 'goals', 'goal', 'goal-edit', 'deposit', 'send', 'swap', 'history', 'settings', 'reveal', 'change-password', 'rpc']);

export function App() {
  const s = useAppState();

  useEffect(() => {
    boot().then(() => {
      const start = new URLSearchParams(location.search).get('start');
      if (start && !getState().wallet) startOnboarding(start === 'import' ? 'import' : 'create');
    });
    const onAct = () => touch();
    window.addEventListener('pointerdown', onAct);
    window.addEventListener('keydown', onAct);
    return () => {
      window.removeEventListener('pointerdown', onAct);
      window.removeEventListener('keydown', onAct);
    };
  }, []);

  // Another window (or the auto-lock alarm) may change the session.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const listener = (changes, area) => {
      if (area === 'session' && changes.unlocked && !changes.unlocked.newValue && getState().unlocked) {
        location.reload();
      }
      if (area === 'local' && changes.depositInbox) {
        setState({ depositInbox: changes.depositInbox.newValue || [] });
      }
      if (area === 'local' && changes.settings?.newValue) {
        const next = changes.settings.newValue;
        const cur = getState().settings;
        if (next.theme !== cur.theme) {
          applyTheme(next.theme, { animate: true });
          setState({ settings: { ...cur, theme: next.theme } });
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (s.booting) {
    return (
      <div class="app" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 120, opacity: 0.6 }}>
          <Pig level={0} sleeping />
        </div>
      </div>
    );
  }

  let name = s.route.name;
  if (PROTECTED.has(name) && !s.unlocked) name = s.wallet ? 'unlock' : 'welcome';
  const Screen = SCREENS[name] || Home;
  const anim = { forward: 'anim-forward', back: 'anim-back', fade: 'anim-fade' }[s.direction] || '';

  return (
    <div class="app">
      <div class={`screen ${anim}`} key={name + JSON.stringify(s.route.params)}>
        <Screen params={s.route.params || {}} />
      </div>
      <SheetHost />
      <Toast />
    </div>
  );
}
