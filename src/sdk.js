// CrazyGames HTML5 SDK v3. The wrapper owns loading; the game also runs offline.
// Official contract: https://docs.crazygames.com/sdk/intro/
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
let sdk = null;
let initPromise = null;
let gameplayActive = false;
let loadingActive = false;
let lastHappy = -Infinity;
let settings = { muteAudio: false };
let status = { state: 'idle', environment: 'offline', reason: '', dataError: '' };
const settingsListeners = new Set();
const memory = new Map();

const host = () => globalThis.window || globalThis;
const candidate = () => host().CrazyGames?.SDK;
function safely(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
function emitSettings(next) {
  settings = {
    ...settings,
    ...next,
    muteAudio: typeof next?.muteAudio === 'boolean' ? next.muteAudio : settings.muteAudio,
  };
  for (const fn of settingsListeners) safely(() => fn({ ...settings }));
}
function bounded(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
function loadScript(timeoutMs) {
  const doc = globalThis.document;
  if (!doc) return Promise.resolve(null);
  return new Promise((resolve) => {
    let script = doc.querySelector('script[src="' + SDK_URL + '"]');
    let poll, timer;
    const finish = () => {
      clearTimeout(timer);
      clearInterval(poll);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      resolve(candidate() || null);
    };
    if (!script) {
      script = doc.createElement('script');
      script.src = SDK_URL;
      script.async = true;
    }
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    timer = setTimeout(finish, timeoutMs);
    poll = setInterval(() => {
      if (candidate()) finish();
    }, 40);
    if (!script.parentNode) doc.head.appendChild(script);
    if (candidate()) finish();
  });
}

export function initSDK({ timeoutMs = 4500 } = {}) {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    status.state = 'loading';
    const location = host().location || {};
    const forceLocal = new URLSearchParams(location.search || '').get('useLocalSdk') === 'true';
    const local =
      !location.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const deadline = Date.now() + Math.max(50, timeoutMs);
    try {
      let next = candidate();
      if (!next && (!local || forceLocal))
        next = await loadScript(Math.max(1, deadline - Date.now()));
      if (!next) {
        status = { ...status, state: 'offline', reason: 'SDK not loaded' };
        return false;
      }
      await bounded(
        Promise.resolve().then(() => next.init()),
        Math.max(1, deadline - Date.now()),
        'SDK initialization timeout',
      );
      if (next.environment === 'disabled') {
        status = {
          ...status,
          state: 'offline',
          environment: 'disabled',
          reason: 'SDK disabled on this origin',
        };
        return false;
      }
      sdk = next;
      status = {
        ...status,
        state: 'ready',
        environment: next.environment || 'unknown',
        reason: '',
      };
      safely(() => sdk.game.addSettingsChangeListener(emitSettings));
      emitSettings(safely(() => sdk.game.settings) || { muteAudio: false });
      // Preserve current state if integration was initialized after the game.
      if (loadingActive) safely(() => sdk.game.loadingStart());
      if (gameplayActive) safely(() => sdk.game.gameplayStart());
      return true;
    } catch (error) {
      status = { ...status, state: 'offline', reason: error?.message || 'SDK unavailable' };
      return false;
    }
  })();
  return initPromise;
}
export function sdkAvailable() {
  return !!sdk;
}
export function getSDKStatus() {
  return { ...status, gameplayActive, loadingActive };
}
export function gameplayStart() {
  if (gameplayActive) return;
  gameplayActive = true;
  safely(() => sdk?.game.gameplayStart());
}
export function gameplayStop() {
  if (!gameplayActive) return;
  gameplayActive = false;
  safely(() => sdk?.game.gameplayStop());
}
export function loadingStart() {
  if (loadingActive) return;
  loadingActive = true;
  safely(() => sdk?.game.loadingStart());
}
export function loadingStop() {
  if (!loadingActive) return;
  loadingActive = false;
  safely(() => sdk?.game.loadingStop());
}
export function happytime() {
  const now = Date.now();
  if (!sdk || now - lastHappy < 1500) return;
  lastHappy = now;
  safely(() => sdk.game.happytime());
}

// Optional API only: core gameplay does not request ads. Offline cannot earn rewards.
export function requestAd(type, { onStart, onFinish } = {}) {
  if (!sdk?.ad || !['midgame', 'rewarded'].includes(type)) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      safely(() => onFinish?.(success));
      resolve(success);
    };
    try {
      const result = sdk.ad.requestAd(type, {
        adStarted: () => {
          if (!settled) safely(() => onStart?.());
        },
        adFinished: () => finish(true),
        adError: () => finish(false),
      });
      result?.catch?.(() => finish(false));
    } catch {
      finish(false);
    }
  });
}
export function getMuteSetting() {
  return !!settings.muteAudio;
}
export function getSystemLocale() {
  return safely(() => sdk?.user.systemInfo.locale) || null;
}
export function onSettingsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  settingsListeners.add(fn);
  if (sdk) safely(() => fn({ ...settings }));
  return () => settingsListeners.delete(fn);
}

// On CrazyGames the Data Module is authoritative, including a missing value.
// Never resurrect local saves belonging to a different portal account.
export function loadData(key) {
  if (sdk) {
    try {
      const value = sdk.data.getItem(key);
      status.dataError = '';
      return value ?? null;
    } catch {
      status.dataError = 'SDK data read failed';
      return memory.get(key) ?? null;
    }
  }
  try {
    return globalThis.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
export function saveData(key, value) {
  value = String(value);
  memory.set(key, value);
  if (sdk) {
    try {
      sdk.data.setItem(key, value);
      status.dataError = '';
      return true;
    } catch {
      status.dataError = 'SDK data write failed';
      return false;
    }
  }
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    status.dataError = 'Local storage unavailable; save kept for this session';
    return false;
  }
}
export function loadBest() {
  const value = loadData(sdk ? 'bestScore' : 'runicdepths.best');
  return Math.max(0, Number.parseInt(value || '0', 10) || 0);
}
export function saveBest(score) {
  return saveData(sdk ? 'bestScore' : 'runicdepths.best', Math.max(loadBest(), Number(score) || 0));
}
