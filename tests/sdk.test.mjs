import test from 'node:test';
import assert from 'node:assert/strict';
let version = 0;
const fresh = () => import(`../src/sdk.js?test=${++version}`);
function fixture({ environment = 'crazygames', init = async () => {} } = {}) {
  const events = [], cloud = new Map(), local = new Map();
  let listener;
  globalThis.window = { location: { hostname: 'localhost', search: '' }, CrazyGames: { SDK: {
    init, environment,
    game: {
      settings: { muteAudio: true },
      addSettingsChangeListener(fn) { listener = fn; },
      gameplayStart() { events.push('start'); }, gameplayStop() { events.push('stop'); },
      loadingStart() { events.push('load'); }, loadingStop() { events.push('loaded'); },
      happytime() { events.push('happy'); },
    },
    data: { getItem: k => cloud.get(k) ?? null, setItem: (k, v) => cloud.set(k, v) },
    user: { systemInfo: { locale: 'pl-PL' } },
  } } };
  globalThis.localStorage = { getItem: k => local.get(k) ?? null, setItem: (k, v) => local.set(k, v) };
  delete globalThis.document;
  return { events, cloud, local, change: s => listener(s), raw: window.CrazyGames.SDK };
}
test('rapid start/stop boundaries remain paired; duplicate transitions are idempotent', async () => {
  const f = fixture(), sdk = await fresh();
  assert.equal(await sdk.initSDK(), true);
  sdk.gameplayStart(); sdk.gameplayStart(); sdk.gameplayStop(); sdk.gameplayStart(); sdk.gameplayStop();
  sdk.loadingStart(); sdk.loadingStart(); sdk.loadingStop(); sdk.loadingStop();
  assert.deepEqual(f.events, ['start', 'stop', 'start', 'stop', 'load', 'loaded']);
});
test('settings subscribe before init, receive initial values, change and unsubscribe', async () => {
  const f = fixture(), sdk = await fresh(), changes = [];
  const off = sdk.onSettingsChange(s => changes.push(s.muteAudio));
  await sdk.initSDK();
  assert.equal(sdk.getMuteSetting(), true);
  f.change({ muteAudio: false }); off(); f.change({ muteAudio: true });
  assert.deepEqual(changes, [true, false]);
  assert.equal(sdk.getMuteSetting(), true);
  assert.equal(sdk.getSystemLocale(), 'pl-PL');
});
test('cloud null is authoritative and never resurrects another account local progress', async () => {
  const f = fixture(), sdk = await fresh();
  f.local.set('save', 'stale-local-account');
  await sdk.initSDK();
  assert.equal(sdk.loadData('save'), null);
  assert.equal(sdk.saveData('save', 'new-cloud'), true);
  assert.equal(f.cloud.get('save'), 'new-cloud');
  assert.equal(f.local.get('save'), 'stale-local-account');
  assert.equal(sdk.loadData('save'), 'new-cloud');
});
test('offline saves work; unsupported storage degrades to memory; absent ads never grant reward', async () => {
  fixture(); delete window.CrazyGames;
  const sdk = await fresh();
  assert.equal(await sdk.initSDK(), false);
  assert.equal(sdk.saveData('save', 'offline'), true);
  assert.equal(sdk.loadData('save'), 'offline');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('storage denied'); } });
  assert.equal(sdk.saveData('save', 'memory'), false);
  assert.equal(sdk.loadData('save'), 'memory');
  let callbacks = 0;
  assert.equal(await sdk.requestAd('rewarded', { onStart() { callbacks++; }, onFinish() { callbacks++; } }), false);
  assert.equal(callbacks, 0);
  delete globalThis.localStorage;
});
test('SDK timeout releases boot; late init cannot attach after timeout', async () => {
  let complete;
  fixture({ init: () => new Promise(resolve => { complete = resolve; }) });
  const sdk = await fresh();
  assert.equal(await sdk.initSDK({ timeoutMs: 50 }), false);
  complete(); await Promise.resolve();
  assert.equal(sdk.sdkAvailable(), false);
  assert.match(sdk.getSDKStatus().reason, /timeout/);
});
test('disabled environments do not call modules', async () => {
  const f = fixture({ environment: 'disabled' }), sdk = await fresh();
  assert.equal(await sdk.initSDK(), false);
  sdk.gameplayStart(); sdk.gameplayStop();
  assert.deepEqual(f.events, []);
});
test('late CDN script loads and initialization is shared across concurrent callers', async () => {
  const f = fixture(); const raw = f.raw; delete window.CrazyGames;
  window.location.hostname = 'preview.example';
  let appended = 0, initCount = 0;
  raw.init = async () => { initCount++; };
  globalThis.document = {
    querySelector() { return null; },
    createElement() {
      const listeners = new Map();
      return { addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k), dispatch: k => listeners.get(k)?.() };
    },
    head: { appendChild(script) { appended++; script.parentNode = this; setTimeout(() => { window.CrazyGames = { SDK: raw }; script.dispatch('load'); }, 15); } },
  };
  const sdk = await fresh();
  assert.deepEqual(await Promise.all([sdk.initSDK(), sdk.initSDK()]), [true, true]);
  assert.equal(appended, 1); assert.equal(initCount, 1);
  delete globalThis.document;
});
test('ad outcome settles once, errors do not produce reward, callback exceptions are isolated', async () => {
  const f = fixture(), sdk = await fresh(); let callbacks;
  f.raw.ad = { requestAd(_type, cb) { callbacks = cb; } };
  await sdk.initSDK();
  const outcomes = [];
  const promise = sdk.requestAd('rewarded', { onStart() { throw Error('app callback'); }, onFinish(ok) { outcomes.push(ok); } });
  callbacks.adStarted(); callbacks.adError(); callbacks.adFinished();
  assert.equal(await promise, false);
  assert.deepEqual(outcomes, [false]);
});
