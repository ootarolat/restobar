// db.js — Firestore-backed data layer with in-memory reactive cache.
// Keeps the same API the modules already use (get, getAll, put, remove,
// getMeta, setMeta...) but data lives in Firestore and syncs in real time
// across all devices via onSnapshot listeners.
const App = window.App || {};
window.App = App;

App.DB = (() => {
  // Business-data collections (synced across devices)
  const STORES = [
    'meta',
    'mesas',
    'categorias',
    'productos',
    'comandas',
    'cuentas',
    'sesiones',
    'movimientos',
  ];

  // In-memory cache: { storeName: { id: record } }, filled by realtime listeners
  const cache = {};
  STORES.forEach((s) => { cache[s] = {}; });

  let unsubscribers = [];
  let onChange = null; // called when any collection updates (for re-render)

  function fb() {
    return window.FB;
  }

  function colRef(store) {
    return fb().collection(fb().db, store);
  }

  function docRef(store, id) {
    return fb().doc(fb().db, store, id);
  }

  // Start realtime listeners on all collections. Resolves after the first
  // snapshot of every collection has arrived (initial data loaded).
  async function startRealtime(changeCallback) {
    onChange = changeCallback;
    stopRealtime();

    const firstSnapshot = STORES.map((store) => {
      return new Promise((resolve) => {
        let resolved = false;
        const unsub = fb().onSnapshot(
          colRef(store),
          (snap) => {
            const map = {};
            snap.forEach((d) => { map[d.id] = Object.assign({ id: d.id }, d.data()); });
            cache[store] = map;
            if (!resolved) { resolved = true; resolve(); }
            if (onChange) onChange(store);
          },
          (err) => {
            console.error('Snapshot error on ' + store + ':', err);
            if (!resolved) { resolved = true; resolve(); }
          }
        );
        unsubscribers.push(unsub);
      });
    });

    await Promise.all(firstSnapshot);
  }

  function stopRealtime() {
    unsubscribers.forEach((u) => { try { u(); } catch (e) {} });
    unsubscribers = [];
    STORES.forEach((s) => { cache[s] = {}; });
  }

  // ===== Read API (synchronous from cache; kept async for compatibility) =====

  async function get(store, id) {
    return cache[store] ? (cache[store][id] || null) : null;
  }

  async function getAll(store) {
    return cache[store] ? Object.keys(cache[store]).map((k) => cache[store][k]) : [];
  }

  async function count(store) {
    return cache[store] ? Object.keys(cache[store]).length : 0;
  }

  async function getByIndex(store, field, value) {
    const all = await getAll(store);
    return all.filter((r) => r[field] === value);
  }

  // ===== Write API (writes to Firestore; cache updates via listener) =====

  async function put(store, data) {
    if (data && typeof data === 'object' && !Array.isArray(data) && store !== 'meta') {
      data.updatedAt = Date.now();
    }
    // Optimistic local cache update for instant UI feedback
    if (cache[store]) cache[store][data.id] = Object.assign({}, data);
    await fb().setDoc(docRef(store, data.id), stripUndefined(data));
    return data;
  }

  // putRaw: write without touching updatedAt (compat)
  async function putRaw(store, data) {
    if (cache[store]) cache[store][data.id] = Object.assign({}, data);
    await fb().setDoc(docRef(store, data.id), stripUndefined(data));
  }

  async function bulkPut(store, items) {
    const batch = fb().writeBatch(fb().db);
    items.forEach((item) => {
      if (store !== 'meta') item.updatedAt = Date.now();
      if (cache[store]) cache[store][item.id] = Object.assign({}, item);
      batch.set(docRef(store, item.id), stripUndefined(item));
    });
    await batch.commit();
  }

  async function bulkPutRaw(store, items) {
    return bulkPut(store, items);
  }

  async function remove(store, id) {
    if (cache[store]) delete cache[store][id];
    await fb().deleteDoc(docRef(store, id));
  }

  async function clear(store) {
    const ids = Object.keys(cache[store] || {});
    const batch = fb().writeBatch(fb().db);
    ids.forEach((id) => batch.delete(docRef(store, id)));
    cache[store] = {};
    if (ids.length > 0) await batch.commit();
  }

  // ===== Meta helpers (settings, etc.) stored in 'meta' collection =====

  async function getMeta(key, defaultValue = null) {
    const r = cache.meta ? cache.meta[key] : null;
    return r ? r.value : defaultValue;
  }

  async function setMeta(key, value) {
    return put('meta', { id: key, value: value });
  }

  // Firestore rejects undefined fields — strip them out
  function stripUndefined(obj) {
    const clean = {};
    Object.keys(obj).forEach((k) => {
      if (obj[k] !== undefined) clean[k] = obj[k];
    });
    return clean;
  }

  return {
    STORES,
    startRealtime,
    stopRealtime,
    get,
    getAll,
    getByIndex,
    count,
    put,
    putRaw,
    bulkPut,
    bulkPutRaw,
    remove,
    clear,
    getMeta,
    setMeta,
  };
})();
