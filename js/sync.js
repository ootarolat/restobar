// sync.js — Google Sheets sync via Apps Script web app
App.Sync = (() => {
  let syncing = false;
  // Exclude 'usuarios' from sync (passwords should not go to Google Sheets)
  var SYNC_STORES = ['meta', 'mesas', 'categorias', 'productos', 'comandas', 'cuentas', 'sesiones', 'movimientos'];

  // Fixed URL from app-config.js (falls back to empty string if not set)
  function fixedBackendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.backendUrl) ? window.APP_CONFIG.backendUrl : '';
  }

  // Resolve the active endpoint: a locally saved URL wins, otherwise the fixed one
  async function resolveEndpoint() {
    var saved = await App.DB.getMeta('syncEndpoint', '');
    return saved || fixedBackendUrl();
  }

  async function getConfig() {
    return {
      endpoint: await resolveEndpoint(),
      autoSync: await App.DB.getMeta('autoSync', false),
      lastSync: await App.DB.getMeta('lastSync', 0),
    };
  }

  async function saveConfig(endpoint, autoSync) {
    await App.DB.setMeta('syncEndpoint', endpoint);
    await App.DB.setMeta('autoSync', autoSync);
  }

  async function testConnection() {
    var config = await getConfig();
    if (!config.endpoint) return { success: false, error: 'No hay URL configurada' };
    try {
      var res = await fetch(config.endpoint + '?action=test');
      var data = await res.json();
      return data;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Push all local data to Google Sheets (upsert by ID + updatedAt)
  async function push() {
    var config = await getConfig();
    if (!config.endpoint) return;

    for (var i = 0; i < SYNC_STORES.length; i++) {
      var store = SYNC_STORES[i];
      var records = await App.DB.getAll(store);
      if (records.length === 0) continue;

      // Ensure all records have updatedAt
      var modified = false;
      for (var j = 0; j < records.length; j++) {
        if (!records[j].updatedAt) {
          records[j].updatedAt = Date.now();
          modified = true;
        }
      }
      if (modified) {
        await App.DB.bulkPutRaw(store, records);
      }

      // Send to Apps Script (text/plain avoids CORS preflight)
      await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ store: store, records: records }),
      });
    }
  }

  // Pull all data from Google Sheets (upsert local by updatedAt)
  async function pull() {
    var config = await getConfig();
    if (!config.endpoint) return;

    var res = await fetch(config.endpoint + '?action=getAll');
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al recibir datos');

    for (var i = 0; i < SYNC_STORES.length; i++) {
      var store = SYNC_STORES[i];
      var remoteRecords = data.data[store] || [];
      for (var j = 0; j < remoteRecords.length; j++) {
        var record = remoteRecords[j];
        var local = await App.DB.get(store, record.id);
        var remoteTs = record.updatedAt || 0;
        var localTs = local ? (local.updatedAt || 0) : -1;
        if (remoteTs >= localTs) {
          await App.DB.putRaw(store, record);
        }
      }
    }
  }

  async function sync() {
    if (syncing) return { success: false, error: 'Sincronización en curso' };
    var config = await getConfig();
    if (!config.endpoint) return { success: false, error: 'No hay URL configurada' };

    syncing = true;
    try {
      await push();
      await pull();
      await App.DB.setMeta('lastSync', Date.now());
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      syncing = false;
    }
  }

  async function maybeAutoSync() {
    var config = await getConfig();
    if (config.autoSync && config.endpoint) {
      return await sync();
    }
    return { success: false, error: 'Auto-sync desactivado' };
  }

  return {
    getConfig: getConfig,
    saveConfig: saveConfig,
    resolveEndpoint: resolveEndpoint,
    testConnection: testConnection,
    sync: sync,
    maybeAutoSync: maybeAutoSync,
    isSyncing: function () { return syncing; },
  };
})();
