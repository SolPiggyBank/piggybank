// Service worker: auto-lock, deposit notifications and saving reminders.
import { local, session, getOne } from './lib/storage.js';
import { DEFAULT_SETTINGS, rpcList } from './lib/config.js';
import { fetchBalances, setRpcHealth } from './lib/rpc.js';
import { reconcileBalances } from './lib/deposits.js';
import { goalSavedUsd } from './lib/goals-math.js';
import { detectLang, localeFor } from './lib/langs.js';

// The worker stays free of the UI bundle, so its few strings live here.
// remindMsg gets the amount already written as money ("$120", "120 $").
const TEXT = {
  ru: {
    depositTitle: 'Копилка пополнена',
    depositMsg: (amount) => `Пришло ${amount}. Откройте копилку, чтобы отложить в цель.`,
    remindMsg: (left) => `До цели осталось ${left}. Отложите немного сегодня — копилка ждёт.`,
    unlockTitle: 'Деньги разблокированы',
    unlockMsg: (goal) => `Смарт-контракт цели «${goal}» открылся. Заберите деньги в копилке.`,
  },
  en: {
    depositTitle: 'Money arrived',
    depositMsg: (amount) => `${amount} arrived. Open the piggy bank to put it toward a goal.`,
    remindMsg: (left) => `${left} to go. Put a little aside today — your piggy bank is waiting.`,
    unlockTitle: 'Money unlocked',
    unlockMsg: (goal) => `The smart contract for “${goal}” has unlocked. Take the money out in the piggy bank.`,
  },
  es: {
    depositTitle: 'Llegó dinero a tu alcancía',
    depositMsg: (amount) => `Recibiste ${amount}. Abre la alcancía para apartarlo para una meta.`,
    remindMsg: (left) => `Te faltan ${left} para tu meta. Aparta un poco hoy: tu alcancía te espera.`,
    unlockTitle: 'Dinero desbloqueado',
    unlockMsg: (goal) => `El contrato inteligente de “${goal}” se desbloqueó. Retira el dinero en la alcancía.`,
  },
  fr: {
    depositTitle: 'De l’argent est arrivé',
    depositMsg: (amount) => `Vous avez reçu ${amount}. Ouvrez la tirelire pour le mettre de côté pour un objectif.`,
    remindMsg: (left) => `Encore ${left} avant votre objectif. Mettez un peu de côté aujourd’hui — votre tirelire vous attend.`,
    unlockTitle: 'Argent déverrouillé',
    unlockMsg: (goal) => `Le contrat intelligent de « ${goal} » s’est ouvert. Récupérez l’argent dans la tirelire.`,
  },
  de: {
    depositTitle: 'Geld ist angekommen',
    depositMsg: (amount) => `Du hast ${amount} erhalten. Öffne das Sparschwein und leg es für ein Ziel zurück.`,
    remindMsg: (left) => `Noch ${left} bis zu deinem Ziel. Leg heute ein bisschen zurück – dein Sparschwein wartet.`,
    unlockTitle: 'Geld entsperrt',
    unlockMsg: (goal) => `Der Smart Contract für „${goal}“ ist offen. Hol das Geld im Sparschwein ab.`,
  },
  pt: {
    depositTitle: 'Chegou dinheiro',
    depositMsg: (amount) => `Você recebeu ${amount}. Abra o cofrinho para guardar numa meta.`,
    remindMsg: (left) => `Faltam ${left} para a sua meta. Guarde um pouco hoje — o cofrinho está esperando.`,
    unlockTitle: 'Dinheiro desbloqueado',
    unlockMsg: (goal) => `O contrato inteligente de “${goal}” foi liberado. Retire o dinheiro no cofrinho.`,
  },
  zh: {
    depositTitle: '存钱罐收到一笔钱',
    depositMsg: (amount) => `收到 ${amount}。打开存钱罐，把它存进一个目标吧。`,
    remindMsg: (left) => `离目标还差 ${left}。今天存一点吧——存钱罐在等你。`,
    unlockTitle: '资金已解锁',
    unlockMsg: (goal) => `“${goal}”的智能合约已解锁。请在存钱罐里取出这笔钱。`,
  },
  ja: {
    depositTitle: '入金がありました',
    depositMsg: (amount) => `${amount} が届きました。貯金箱を開いて目標に貯めましょう。`,
    remindMsg: (left) => `目標まであと ${left}。今日も少しだけ貯めませんか？貯金箱が待っています。`,
    unlockTitle: 'ロックが解除されました',
    unlockMsg: (goal) => `「${goal}」のスマートコントラクトが解除されました。貯金箱から引き出してください。`,
  },
};

function lang(s) {
  return detectLang(s.language);
}

function fmtAmount(n, token, l) {
  const digits = token === 'SOL' ? 5 : 2;
  return `${new Intl.NumberFormat(localeFor(l), { maximumFractionDigits: digits }).format(n)} ${token}`;
}

function fmtMoney(n, l) {
  return new Intl.NumberFormat(localeFor(l), { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(n);
}

const APP_URL = chrome.runtime.getURL('index.html');

async function settings() {
  return { ...DEFAULT_SETTINGS, ...(await getOne(local, 'settings', {})) };
}

async function ensureAlarms() {
  const s = await settings();
  if (!(await chrome.alarms.get('autolock'))) chrome.alarms.create('autolock', { periodInMinutes: 1 });
  if (!(await chrome.alarms.get('deposits'))) chrome.alarms.create('deposits', { periodInMinutes: 2 });
  await scheduleReminder(s.reminder);
}

async function scheduleReminder(mode) {
  const period = mode === 'daily' ? 1440 : mode === 'weekly' ? 10080 : 0;
  const existing = await chrome.alarms.get('reminder');
  if (!period) {
    if (existing) await chrome.alarms.clear('reminder');
    return;
  }
  if (existing && existing.periodInMinutes === period) return;
  // First reminder at 19:00 local time.
  const next = new Date();
  next.setHours(19, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  chrome.alarms.create('reminder', { when: next.getTime(), periodInMinutes: period });
}

async function checkAutoLock() {
  const s = await settings();
  if (!s.autoLockMinutes) return;
  const unlocked = await getOne(session, 'unlocked');
  if (!unlocked) return;
  if (Date.now() - (unlocked.lastActive || 0) > s.autoLockMinutes * 60_000) {
    await session.remove('unlocked');
  }
}

async function checkDeposits() {
  const s = await settings();
  if (!s.notifyDeposits) return;
  const wallet = await getOne(local, 'wallet');
  if (!wallet?.publicKey) return;
  try {
    setRpcHealth(await getOne(local, 'rpcHealth')); // start with the node that answered best in the popup
    const balances = await fetchBalances(rpcList(s), wallet.publicKey, s.network);
    const events = await reconcileBalances(s.network, wallet.publicKey, balances);
    const tx = TEXT[lang(s)];
    for (const ev of events) {
      chrome.notifications.create(`deposit-${ev.id}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: tx.depositTitle,
        message: tx.depositMsg(fmtAmount(ev.amount, ev.token, lang(s))),
        priority: 1,
      });
    }
    if (events.length) chrome.action.setBadgeText({ text: '+' });
  } catch {
    /* network hiccup; try again next round */
  }
}

/** Tells the user once when a smart-contract lock reaches its unlock date. */
async function checkUnlocks() {
  const s = await settings();
  const goals = await getOne(local, 'goals', []);
  const notified = await getOne(local, 'unlockNotified', {});
  const now = Date.now() / 1000;
  let changed = false;
  for (const g of goals) {
    for (const l of g.locks?.[s.network] || []) {
      if (l.status !== 'locked' || l.unlockAt > now || notified[l.id]) continue;
      notified[l.id] = Date.now();
      changed = true;
      chrome.notifications.create(`unlock-${l.id}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: TEXT[lang(s)].unlockTitle,
        message: TEXT[lang(s)].unlockMsg(g.name),
        priority: 1,
      });
    }
  }
  if (changed) await local.set({ unlockNotified: notified });
}

async function remind() {
  const s = await settings();
  const goals = (await getOne(local, 'goals', [])).filter((g) => !g.archived);
  if (!goals.length) return;
  const prices = { SOL: 0, ...(await getOne(local, 'lastPrices', {})), USDC: 1, USDT: 1 };
  const ranked = goals
    .map((g) => ({ g, left: g.target - goalSavedUsd(g, prices, s.network) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => (a.g.deadline || '9999').localeCompare(b.g.deadline || '9999'));
  const pick = ranked[0];
  if (!pick) return;
  chrome.notifications.create(`reminder-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${pick.g.emoji || '🐷'} ${pick.g.name}`,
    message: TEXT[lang(s)].remindMsg(fmtMoney(Math.ceil(pick.left), lang(s))),
    priority: 0,
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarms();
  if (details.reason === 'install') chrome.tabs.create({ url: APP_URL + '?mode=tab' });
});

chrome.runtime.onStartup.addListener(ensureAlarms);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autolock') checkAutoLock();
  else if (alarm.name === 'deposits') {
    checkDeposits();
    checkUnlocks();
  }
  else if (alarm.name === 'reminder') remind();
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.create({ url: APP_URL + '?mode=tab' });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'settings-changed') {
    scheduleReminder(msg.settings?.reminder || 'off').then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === 'popup-opened') {
    chrome.action.setBadgeText({ text: '' });
  }
  return false;
});

ensureAlarms();
