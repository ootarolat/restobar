// db.js — IndexedDB wrapper for Restobar POS
const App = window.App || {};

App.DB = (() => {
  const DB_NAME = 'restobar_db';
  const DB_VERSION = 2;

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

  let db = null;

  async function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        STORES.forEach((name) => {
          if (!database.objectStoreNames.contains(name)) {
            const store = database.createObjectStore(name, { keyPath: 'id' });
            if (name === 'comandas') {
              store.createIndex('mesaId', 'mesaId', { unique: false });
              store.createIndex('estado', 'estado', { unique: false });
            }
            if (name === 'cuentas' || name === 'movimientos') {
              store.createIndex('fecha', 'fecha', { unique: false });
              if (name === 'cuentas') {
                store.createIndex('comandaId', 'comandaId', { unique: false });
              }
            }
          }
        });
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function get(store, id) {
    return promisify(tx(store).get(id));
  }

  async function getAll(store) {
    return promisify(tx(store).getAll());
  }

  async function put(store, data) {
    if (data && typeof data === 'object' && !Array.isArray(data) && store !== 'meta') {
      data.updatedAt = Date.now();
    }
    return promisify(tx(store, 'readwrite').put(data));
  }

  // putRaw: guarda sin añadir updatedAt (usado por sync pull)
  async function putRaw(store, data) {
    return promisify(tx(store, 'readwrite').put(data));
  }

  async function bulkPut(store, items) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      const os = transaction.objectStore(store);
      items.forEach((item) => os.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // bulkPutRaw: guarda sin añadir updatedAt (usado por sync)
  async function bulkPutRaw(store, items) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      const os = transaction.objectStore(store);
      items.forEach((item) => os.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function remove(store, id) {
    return promisify(tx(store, 'readwrite').delete(id));
  }

  async function clear(store) {
    return promisify(tx(store, 'readwrite').clear());
  }

  async function count(store) {
    return promisify(tx(store).count());
  }

  async function getByIndex(store, index, value) {
    return promisify(tx(store).index(index).getAll(value));
  }

  async function getMeta(key, defaultValue = null) {
    const result = await get('meta', key);
    return result ? result.value : defaultValue;
  }

  async function setMeta(key, value) {
    return put('meta', { id: key, value });
  }

  return {
    STORES,
    init,
    get,
    getAll,
    getByIndex,
    put,
    putRaw,
    bulkPut,
    bulkPutRaw,
    remove,
    clear,
    count,
    getMeta,
    setMeta,
  };
})();
