// app.js — main orchestrator: init, render, header, navigation
App.Views = App.Views || {};
App.Actions = App.Actions || {};

var renderToken = 0;

App.render = async function () {
  var myToken = ++renderToken;
  var state = App.Store.state;
  var isAdmin = state.userRole === 'admin';

  // Guard: redirect non-admin from restricted views
  var restricted = ['caja', 'reportes', 'config'];
  if (!isAdmin && restricted.indexOf(state.view) !== -1) {
    App.Store.navigate('mesas');
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

  // Comanda view — back button + mesa + liberar
  if (state.view === 'comanda') {
    var mesaNum = state.params.mesaId ? state.params.mesaId.replace('mesa-', '') : '';
    header.innerHTML =
      '<button class="header-back" onclick="App.Actions.volverMesas()">' +
      '<span class="header-back-arrow">‹</span> Volver</button>' +
      '<span class="header-title">Mesa ' + mesaNum + '</span>' +
      '<button class="header-btn" style="color:var(--danger)" onclick="App.Actions.liberarMesaPrompt(\'' +
      state.params.mesaId + '\',\'' + state.params.comandaId + '\')">✕</button>';
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
  var isAdmin = App.Store.state.userRole === 'admin';

  // Hide for full-page views
  if (view === 'comanda' || view === 'cuenta') {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  var items = [
    { id: 'mesas', icon: '🍽️', label: 'Mesas' },
    { id: 'cocina', icon: '👨‍🍳', label: 'Cocina' },
    { id: 'carta', icon: '📋', label: 'Carta' },
  ];

  // Admin-only tabs
  if (isAdmin) {
    items.push({ id: 'caja', icon: '💰', label: 'Caja' });
    items.push({ id: 'reportes', icon: '📊', label: 'Reportes' });
  }

  nav.innerHTML = items.map(function (item) {
    return '<button class="nav-item ' + (item.id === view ? 'active' : '') + '" ' +
      'onclick="App.Store.navigate(\'' + item.id + '\')">' +
      '<span class="nav-icon">' + item.icon + '</span>' +
      '<span>' + item.label + '</span></button>';
  }).join('');
};

// ===== Auth actions =====
App.Actions.logoutUser = function () {
  App.Auth.logout();
};

var realtimeStarted = false;

// Re-render when realtime data changes (debounced to avoid render storms)
var renderDebounce = null;
function onDataChange() {
  if (!App.Auth.isLoggedIn()) return;
  clearTimeout(renderDebounce);
  renderDebounce = setTimeout(function () { App.render(); }, 120);
}

async function handleLogin() {
  document.getElementById('header').style.display = '';
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
  App.Store.setRender(App.render);
  App.render();
}

function handleLogout() {
  if (realtimeStarted) {
    App.DB.stopRealtime();
    realtimeStarted = false;
  }
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
};

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
