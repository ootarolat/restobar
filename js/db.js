// db.js — Firestore-backed data layer with in-memory reactive cache.
// Keeps the same API the modules already use (get, getAll, put, remove,
// getMeta, setMeta...) but data lives in Firestore and syncs in real time
// across all devices via onSnapshot listeners.
const App = window.App || {};
window.App = App;
// Versión de este archivo (app.js detecta si se cargó una mezcla de versiones)
App.BUILD = App.BUILD || {}; App.BUILD.db = 'v28';

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
    // Inventario
    'insumos',
    'recetas',
    'inventario',
  ];

  // Colecciones que crecen todos los días: solo se sincroniza una ventana
  // reciente (suficiente para tendencias de 30 días).
  const WINDOW_DAYS = { inventario: 45 };

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

  // Referencia a escuchar: colección completa o ventana de fechas
  function listenRef(store) {
    const days = WINDOW_DAYS[store];
    if (!days || !fb().query || !fb().where) return colRef(store);
    const desde = Date.now() - days * 24 * 60 * 60 * 1000;
    return fb().query(colRef(store), fb().where('fecha', '>=', desde));
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
          listenRef(store),
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

  // ===== Escritura atómica de varias operaciones (un solo commit) =====
  // ops: [{ inc: { store, id, field, delta } } | { put: { store, data } }]
  // 'inc' usa el incremento atómico de Firestore: dos dispositivos que
  // descuentan stock al mismo tiempo no se pisan, y funciona sin conexión.
  async function batchWrite(ops) {
    const batch = fb().writeBatch(fb().db);
    const now = Date.now();
    ops.forEach((op) => {
      if (op.inc) {
        const o = op.inc;
        const cur = cache[o.store] && cache[o.store][o.id];
        if (cur) cur[o.field] = (Number(cur[o.field]) || 0) + o.delta; // optimista
        const patch = { updatedAt: now };
        patch[o.field] = fb().increment(o.delta);
        batch.set(docRef(o.store, o.id), patch, { merge: true });
      } else if (op.put) {
        const d = op.put.data;
        if (cache[op.put.store]) cache[op.put.store][d.id] = Object.assign({}, d);
        batch.set(docRef(op.put.store, d.id), stripUndefined(d));
      }
    });
    if (ops.length) await batch.commit();
  }

  // ===== Atomic update (read-modify-write inside a Firestore transaction) =====
  // Evita "lost updates" cuando varios dispositivos (cocina, bar, mozo)
  // modifican el MISMO documento casi al mismo tiempo.
  //   mutator(data) recibe una COPIA del documento y la modifica in-place.
  //   Si devuelve false, no se escribe nada (no-op).
  //   Puede ejecutarse más de una vez (reintentos): debe ser determinista
  //   respecto al documento recibido (no acumular efectos externos).
  // Devuelve el documento actualizado, o null si no existe / no-op.
  // Sin conexión, las transacciones no están disponibles: se aplica el
  // mismo mutator sobre la copia local (cache offline de Firestore).
  async function update(store, id, mutator) {
    if (!isOnline() || !fb().runTransaction) return updateLocal(store, id, mutator);
    try {
      const result = await fb().runTransaction(async (tx) => {
        const snap = await tx.get(docRef(store, id));
        if (!snap.exists()) return null;
        const data = Object.assign({ id: id }, snap.data());
        if (mutator(data) === false) return null;
        if (store !== 'meta') data.updatedAt = Date.now();
        tx.set(docRef(store, id), stripUndefined(data));
        return data;
      });
      if (result && cache[store]) cache[store][id] = clone(result);
      return result;
    } catch (e) {
      // Sin red a mitad de camino → aplicar localmente (se sincroniza luego)
      if (e && (e.code === 'unavailable' || e.code === 'failed-precondition' || !isOnline())) {
        console.warn('Transacción no disponible, aplicando local:', e.code);
        return updateLocal(store, id, mutator);
      }
      throw e;
    }
  }

  async function updateLocal(store, id, mutator) {
    const current = cache[store] ? cache[store][id] : null;
    if (!current) return null;
    const data = clone(current);
    if (mutator(data) === false) return null;
    await put(store, data);
    return data;
  }

  function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async function remove(store, id) {
    if (cache[store]) delete cache[store][id];
    await fb().deleteDoc(docRef(store, id));
  }

  // Borra TODOS los documentos de una colección en Firestore, no solo los
  // que están en memoria (ej. 'inventario' solo sincroniza 45 días).
  // Lotes de 400 (límite de Firestore: 500 operaciones por lote).
  async function clearAll(store) {
    const snap = await fb().getDocs(colRef(store));
    const ids = [];
    snap.forEach((d) => ids.push(d.id));
    for (let i = 0; i < ids.length; i += 400) {
      const batch = fb().writeBatch(fb().db);
      ids.slice(i, i + 400).forEach((id) => batch.delete(docRef(store, id)));
      await batch.commit();
    }
    cache[store] = {};
    return ids.length;
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
    update,
    bulkPut,
    bulkPutRaw,
    batchWrite,
    remove,
    clear,
    clearAll,
    getMeta,
    setMeta,
  };
})();
