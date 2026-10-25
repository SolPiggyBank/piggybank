// Thin wrapper over chrome.storage with a localStorage fallback so the UI
// can also run as a plain web page during development.

const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function webArea(store, prefix) {
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) {
        const raw = store.getItem(prefix + k);
        if (raw != null) out[k] = JSON.parse(raw);
      }
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) store.setItem(prefix + k, JSON.stringify(v));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) store.removeItem(prefix + k);
    },
    async clear() {
      Object.keys(store)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => store.removeItem(k));
    },
  };
}

export const local = hasChrome ? chrome.storage.local : webArea(globalThis.localStorage, 'piggy:');
export const session =
  hasChrome && chrome.storage.session ? chrome.storage.session : webArea(globalThis.sessionStorage, 'piggy-s:');

export async function getOne(area, key, fallback = null) {
  const res = await area.get(key);
  return res[key] === undefined ? fallback : res[key];
}

export const isExtension = !!hasChrome;
