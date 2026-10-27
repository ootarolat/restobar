// app.js — main orchestrator: init, render, header, navigation
App.Views = App.Views || {};
App.Actions = App.Actions || {};

var renderToken = 0;

App.render = async function () {
  var myToken = ++renderToken;
  var state = App.Store.state;

  // Guard: redirect to the role's home if the current view is not allowed
  if (!App.Store.canAccess(state.userRole, state.view)) {
    App.Store.navigate(App.Store.homeFor(state.userRole));
    return;
  }

  App.renderHeader();
  App.renderBottomNav();

  var viewFn = App.Views[state.view];
  if (!viewFn) return;

  try {
    var html = await viewFn(state.params);
    if (myToken === renderToken) {
      document.getElementById('content').innerHTML = html;
    }
  } catch (e) {
    console.error('Render error:', e);
    if (myToken === renderToken) {
      document.getElementById('content').innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error al cargar la vista</div></div>';
    }
  }
};

App.renderHeader = function () {
  var state = App.Store.state;
  var header = document.getElementById('header');

  // Comanda view — back button + mesa + (admin reassign) + liberar
  if (state.view === 'comanda') {
    var mesaNum = state.params.mesaId ? state.params.mesaId.replace('mesa-', '') : '';
    var cmUser = App.Auth.getCurrentUser();
    var reasignarBtn = (cmUser && cmUser.role === 'admin')
      ? '<button class="header-btn" title="Reasignar mozo" onclick="App.Actions.reasignarMozoPrompt(\'' + state.params.mesaId + '\')">👤</button>'
      : '';
    header.innerHTML =
      '<button class="header-back" onclick="App.Actions.volverMesas()">' +
      '<span class="header-back-arrow">‹</span> Volver</button>' +
      '<span class="header-title">Mesa ' + mesaNum + '</span>' +
      '<div style="display:flex;gap:6px">' + reasignarBtn +
      '<button class="header-btn" style="color:var(--danger)" onclick="App.Actions.liberarMesaPrompt(\'' +
      state.params.mesaId + '\',\'' + state.params.comandaId + '\')">✕</button></div>';
    return;
  }

  // Cuenta view — back button + title
  if (state.view === 'cuenta') {
    var mNum = state.params.mesaId ? state.params.mesaId.replace('mesa-', '') : '';
    header.innerHTML =
      '<button class="header-back" onclick="App.Actions.volverMesas()">' +
      '<span class="header-back-arrow">‹</span> Volver</button>' +
      '<span class="header-title">Cuenta · Mesa ' + mNum + '</span>' +
      '<div style="width:38px"></div>';
    return;
  }

  // Main views — title + role-based buttons
  var titles = {
    mesas: 'Mesas',
    carta: 'Carta',
    caja: 'Caja',
    cocina: 'Cocina',
    reportes: 'Reportes',
    config: 'Configuración',
  };

  var isAdmin = state.userRole === 'admin';
  var user = App.Auth.getCurrentUser();
  var userName = user ? user.name : '';

  var rightBtns = '<div style="display:flex;align-items:center;gap:6px">' +
    '<span class="text-sm text-muted" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + App.Utils.esc(userName) + '</span>';
  if (isAdmin) {
    rightBtns += '<button class="header-btn" onclick="App.Store.navigate(\'config\')">⚙️</button>';
  }
  rightBtns += '<button class="header-btn" onclick="App.Actions.logoutUser()" title="Salir">🚪</button></div>';

  header.innerHTML =
    '<div><div class="header-title">' + (titles[state.view] || 'Restobar') + '</div>' +
    '<div class="header-subtitle">' + App.Utils.esc(state.settings.businessName || '') + '</div></div>' +
    rightBtns;
};

App.renderBottomNav = function () {
  var view = App.Store.state.view;
  var nav = document.getElementById('bottom-nav');
  var role = App.Store.state.userRole;

  // Hide for full-page views
  if (view === 'comanda' || view === 'cuenta') {
    nav.style.display = 'none';
    return;
  }

  var allItems = {
    mesas:    { id: 'mesas', icon: '🍽️', label: 'Mesas' },
    cocina:   { id: 'cocina', icon: '👨‍🍳', label: 'Cocina' },
    carta:    { id: 'carta', icon: '📋', label: 'Carta' },
    caja:     { id: 'caja', icon: '💰', label: 'Caja' },
    reportes: { id: 'reportes', icon: '📊', label: 'Reportes' },
  };

  // Only the tabs allowed for this role
  var allowed = App.Store.navForRole(role);
  var items = allowed.map(function (id) { return allItems[id]; }).filter(Boolean);

  // If the role has a single tab, hide the bottom nav entirely (no point)
  if (items.length <= 1) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  var badges = App._badges || {};
  nav.innerHTML = items.map(function (item) {
    var count = badges[item.id] || 0;
    var badgeHtml = count > 0 ? '<span class="nav-badge">' + count + '</span>' : '';
    return '<button class="nav-item ' + (item.id === view ? 'active' : '') + '" ' +
      'onclick="App.Store.navigate(\'' + item.id + '\')">' +
      '<span class="nav-icon" style="position:relative">' + item.icon + badgeHtml + '</span>' +
      '<span>' + item.label + '</span></button>';
  }).join('');
};

// Recompute nav badges from current comandas (cocina = enviadas+preparando,
// mesas = listas que pertenecen al mozo actual, o todas si es admin)
async function updateBadges() {
  var user = App.Auth.getCurrentUser();
  if (!user) { App._badges = {}; return; }
  var isAdmin = user.role === 'admin';
  var comandas = await App.DB.getAll('comandas');
  var cocina = 0, listos = 0;
  comandas.forEach(function (c) {
    if (c.estado === 'enviada' || c.estado === 'preparando') cocina++;
    if (c.estado === 'lista' && (isAdmin || c.mozoUid === user.uid)) listos++;
  });
  App._badges = { cocina: cocina, mesas: listos };
}

// ===== Auth actions =====
App.Actions.logoutUser = function () {
  App.Auth.logout();
};

var realtimeStarted = false;

// ===== Alert engine: detect comanda state transitions across devices =====
var prevComandaEstado = {};   // { comandaId: estado }
var alertEngineReady = false; // skip alerts on the very first snapshot

async function checkComandaAlerts() {
  var user = App.Auth.getCurrentUser();
  if (!user) return;
  var isAdmin = user.role === 'admin';
  var veCocina = (user.role === 'cocina' || isAdmin);   // oye "nuevo pedido"
  var atiendeMesas = (user.role === 'mozo' || user.role === 'cajero' || isAdmin); // oye "preparando/listo" de sus mesas

  var comandas = await App.DB.getAll('comandas');
  var current = {};
  comandas.forEach(function (c) { current[c.id] = c.estado; });

  if (!alertEngineReady) {
    // First pass: just capture the baseline, don't alert
    prevComandaEstado = current;
    alertEngineReady = true;
    return;
  }

  comandas.forEach(function (c) {
    var before = prevComandaEstado[c.id];
    var now = c.estado;
    if (before === now) return;        // no change for this comanda
    if (before === undefined) return;  // newly seen; avoid false alert

    var esMiMesa = user.uid && c.mozoUid === user.uid;

    // enviada → solo quien opera cocina (rol cocina / admin)
    if (now === 'enviada' && veCocina) {
      App.Utils.alertEvent('cocina', 'Nuevo pedido en cocina · Mesa ' + mesaNumeroDe(c), 'info');
    }
    // preparando → avisar al mozo dueño (o admin)
    else if (now === 'preparando' && atiendeMesas && (esMiMesa || isAdmin)) {
      App.Utils.alertEvent('preparando', 'Preparando pedido · Mesa ' + mesaNumeroDe(c), 'info');
    }
    // lista → avisar al mozo dueño para que sirva (o admin)
    else if (now === 'lista' && atiendeMesas && (esMiMesa || isAdmin)) {
      App.Utils.alertEvent('listo', '¡Pedido listo! Mesa ' + mesaNumeroDe(c), 'success');
    }
  });

  prevComandaEstado = current;
}

// Resolve mesa number from a comanda (mesaId has the form 'mesa-N')
function mesaNumeroDe(comanda) {
  if (comanda.mesaId && comanda.mesaId.indexOf('mesa-') === 0) {
    return comanda.mesaId.replace('mesa-', '');
  }
  return '?';
}

// Re-render when realtime data changes (debounced to avoid render storms)
var renderDebounce = null;
function onDataChange(store) {
  if (!App.Auth.isLoggedIn()) return;
  if (store === 'comandas') {
    checkComandaAlerts();
    updateBadges();
  }
  clearTimeout(renderDebounce);
  renderDebounce = setTimeout(function () { App.render(); }, 120);
}

async function handleLogin() {
  document.getElementById('header').style.display = '';
  // Unlock audio (needs a user gesture; login click counts)
  App.Utils.ensureAudio();
  // Reset alert engine baseline for this session
  prevComandaEstado = {};
  alertEngineReady = false;
  // Show a loading state while the first data snapshots arrive
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><div class="empty-state-icon">⏳</div>' +
    '<div class="empty-state-text">Cargando datos...</div></div>';

  if (!realtimeStarted) {
    await App.DB.startRealtime(onDataChange);
    realtimeStarted = true;
  }

  await App.Seed.run();            // seeds only if collections are empty
  await App.Store.loadSettings();
  // Arrancar en la vista inicial del rol (cocina → Cocina, resto → Mesas)
  App.Store.state.view = App.Store.homeFor(App.Store.state.userRole);
  App.Store.state.params = {};
  App.Store.setRender(App.render);
  updateBadges();
  App.render();
}

function handleLogout() {
  if (realtimeStarted) {
    App.DB.stopRealtime();
    realtimeStarted = false;
  }
  prevComandaEstado = {};
  alertEngineReady = false;
  App.Auth.showLogin();
}

App.init = function () {
  // Wait for Firebase to be ready (firebase-init.js is a module)
  function boot() {
    try {
      App.Auth.listen(
        function () { handleLogin().catch(showInitError); },
        handleLogout
      );
    } catch (e) {
      showInitError(e);
    }
  }

  if (window.FB && window.FB.ready) {
    boot();
  } else {
    window.addEventListener('firebase-ready', boot, { once: true });
  }

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Refresh cocina timers every 30s
  setInterval(function () {
    if (App.Auth.isLoggedIn() && App.Store.state.view === 'cocina') {
      App.render();
    }
  }, 30000);

  // Recordatorio sonoro: pedidos "enviados" demorados sin iniciar preparación.
  // Solo para quien ve cocina (rol cocina o admin). Re-suena cada 60s.
  setInterval(function () {
    kitchenReminder().catch(function () {});
  }, 60000);
};

var DELAY_REMINDER_MIN = 8; // minutos sin iniciar antes de recordar

async function kitchenReminder() {
  if (!App.Auth.isLoggedIn()) return;
  var user = App.Auth.getCurrentUser();
  if (!user) return;
  // Solo roles que operan cocina
  if (user.role !== 'cocina' && user.role !== 'admin') return;

  var comandas = await App.DB.getAll('comandas');
  var hayDemorado = false;
  comandas.forEach(function (c) {
    if (c.estado === 'enviada') {
      var ref = c.enviadaAt || c.fecha;
      if ((Date.now() - ref) / 60000 >= DELAY_REMINDER_MIN) hayDemorado = true;
    }
  });
  if (hayDemorado) {
    App.Utils.alertEvent('cocina', '⏰ Hay pedidos esperando en cocina', 'error');
  }
}

function showInitError(e) {
  console.error('Init error:', e);
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
    '<div class="empty-state-text">No se pudo iniciar la app</div>' +
    '<div class="text-muted text-sm mt-12">' + App.Utils.esc(e && e.message ? e.message : String(e)) + '</div></div>';
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
