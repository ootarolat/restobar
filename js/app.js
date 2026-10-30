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
  // Vistas de estación (cocina, bar, ...) son dinámicas
  if (!viewFn && App.Store.isEstacionView(state.view)) {
    viewFn = function () { return App.Views._estacion(state.view); };
  }
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
    pase: 'Pase',
    reportes: 'Reportes',
    config: 'Configuración',
  };
  App.Estaciones.list().forEach(function (e) { titles[e.id] = e.icono + ' ' + e.nombre; });

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
    pase:     { id: 'pase', icon: '🧑‍🍳', label: 'Pase' },
    carta:    { id: 'carta', icon: '📋', label: 'Carta' },
    caja:     { id: 'caja', icon: '💰', label: 'Caja' },
    reportes: { id: 'reportes', icon: '📊', label: 'Reportes' },
  };
  App.Estaciones.list().forEach(function (e) {
    allItems[e.id] = { id: e.id, icon: e.icono, label: e.nombre };
  });

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

// Recompute nav badges from current comandas:
//   <estación> = tandas enviadas+preparando de esa área
//   pase       = suma de todas las estaciones (admin)
//   mesas      = tandas listas de las mesas del usuario (todas si es admin)
async function updateBadges() {
  var user = App.Auth.getCurrentUser();
  if (!user) { App._badges = {}; return; }
  var isAdmin = user.role === 'admin';
  var comandas = await App.DB.getAll('comandas');
  var badges = { mesas: 0, pase: 0 };
  comandas.forEach(function (c) {
    if (c.estado === 'cancelada') return;
    var mine = isAdmin || c.mozoUid === user.uid;
    (c.tandas || []).forEach(function (t) {
      if (t.estado === 'enviada' || t.estado === 'preparando') {
        var a = App.Estaciones.tandaArea(t);
        badges[a] = (badges[a] || 0) + 1;
        badges.pase++;
      }
      if (t.estado === 'lista' && mine) badges.mesas++;
    });
  });
  App._badges = badges;
}

// ===== Auth actions =====
App.Actions.logoutUser = function () {
  App.Auth.logout();
};

var realtimeStarted = false;

// ===== Alert engine: detect tanda state transitions across devices =====
var prevComandaEstado = {};   // { tandaId: estado }
var alertEngineReady = false; // skip alerts on the very first snapshot

// ¿Este usuario opera la estación 'area'? (rol de la estación o admin)
function operaEstacion(user, area) {
  return user.role === area || user.role === 'admin';
}

async function checkComandaAlerts() {
  var user = App.Auth.getCurrentUser();
  if (!user) return;
  var isAdmin = user.role === 'admin';
  var atiendeMesas = (user.role === 'mozo' || user.role === 'cajero' || isAdmin); // oye "preparando/listo" de sus mesas

  var comandas = await App.DB.getAll('comandas');
  // Estado por TANDA: clave = tandaId
  var current = {};
  comandas.forEach(function (c) {
    (c.tandas || []).forEach(function (t) { current[t.id] = { estado: t.estado, c: c, t: t }; });
  });

  if (!alertEngineReady) {
    prevComandaEstado = mapEstados(current);
    prevAnulados = mapAnulados(current);
    alertEngineReady = true;
    return;
  }

  Object.keys(current).forEach(function (tandaId) {
    var c = current[tandaId].c;
    var t = current[tandaId].t;
    var now = current[tandaId].estado;
    var before = prevComandaEstado[tandaId];
    if (before === now) return;

    var area = App.Estaciones.tandaArea(t);
    var est = App.Estaciones.get(area);
    var esMiMesa = user.uid && c.mozoUid === user.uid;
    var propia = !!App._localTandas[tandaId]; // creada en este dispositivo
    var mesaTxt = 'Mesa ' + mesaNumeroDe(c);

    if (before === undefined) {
      // Tanda NUEVA: avisar a la estación correspondiente
      if (propia) return; // quien envía ya recibió su confirmación
      if (now === 'enviada' && operaEstacion(user, area)) {
        App.Utils.alertEvent(area === 'bar' ? 'bar' : 'cocina', 'Nuevo pedido ' + est.icono + ' ' + est.nombre + ' · ' + mesaTxt, 'info');
      } else if (now === 'lista' && atiendeMesas && (esMiMesa || isAdmin)) {
        App.Utils.alertEvent('listo', est.icono + ' Listo para retirar · ' + mesaTxt, 'success');
      }
      return;
    }

    if (now === 'anulada' && operaEstacion(user, area) && before !== 'servida') {
      App.Utils.alertEvent('anulado', '🚫 Pedido anulado · ' + mesaTxt + ' (T' + t.numero + ')', 'error');
    } else if (now === 'preparando' && atiendeMesas && (esMiMesa || isAdmin)) {
      App.Utils.alertEvent('preparando', est.icono + ' Preparando · ' + mesaTxt, 'info');
    } else if (now === 'lista' && atiendeMesas && (esMiMesa || isAdmin)) {
      var que = area === 'bar' ? '¡Bebidas listas!' : (area === 'cocina' ? '¡Comida lista!' : '¡' + est.nombre + ' listo!');
      App.Utils.alertEvent('listo', est.icono + ' ' + que + ' ' + mesaTxt, 'success');
    }
  });

  // Líneas anuladas sueltas dentro de una tanda que sigue activa
  Object.keys(current).forEach(function (tandaId) {
    var t = current[tandaId].t;
    var area = App.Estaciones.tandaArea(t);
    if (!operaEstacion(user, area)) return;
    var nAnul = (t.items || []).filter(function (it) { return it.anulado; }).length;
    var prevAnul = prevAnulados[tandaId] || 0;
    if (alertEngineReady && nAnul > prevAnul && t.estado !== 'anulada' && prevComandaEstado[tandaId] !== undefined) {
      App.Utils.alertEvent('anulado', '🚫 Producto anulado · Mesa ' + mesaNumeroDe(current[tandaId].c) + ' (T' + t.numero + ')', 'error');
    }
  });

  prevComandaEstado = mapEstados(current);
  prevAnulados = mapAnulados(current);
}

var prevAnulados = {}; // { tandaId: nº de líneas anuladas }

function mapEstados(current) {
  var m = {};
  Object.keys(current).forEach(function (k) { m[k] = current[k].estado; });
  return m;
}

function mapAnulados(current) {
  var m = {};
  Object.keys(current).forEach(function (k) {
    m[k] = (current[k].t.items || []).filter(function (it) { return it.anulado; }).length;
  });
  return m;
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
  // Configuración (estaciones, IVA, ...) cambiada desde otro dispositivo
  if (store === 'meta') {
    App.Store.loadSettings().then(updateBadges);
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
  prevAnulados = {};
  alertEngineReady = false;
  // Show a loading state while the first data snapshots arrive
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><div class="empty-state-icon">⏳</div>' +
    '<div class="empty-state-text">Cargando datos...</div></div>';

  if (!realtimeStarted) {
    await App.DB.startRealtime(onDataChange);
    realtimeStarted = true;
  }

  // Datos de ejemplo solo si está vacío, y solo el admin (las reglas de
  // Firestore no permiten a otros roles escribir la carta)
  if (App.Store.state.userRole === 'admin') {
    try { await App.Seed.run(); } catch (e) { console.warn('Seed omitido:', e); }
  }
  await App.Store.loadSettings();
  // Arrancar en la vista inicial del rol (estación → su pantalla, resto → Mesas)
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
  prevAnulados = {};
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

  // Register service worker + auto-update when a new version is deployed
  if ('serviceWorker' in navigator) {
    var reloadingForSW = false;
    // Cuando el SW nuevo toma control, recarga la página una vez
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadingForSW) return;
      reloadingForSW = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Si hay un SW en espera, pídele que active ya
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      // Detecta cuando se instala una versión nueva
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay una versión nueva lista y ya había un SW previo → actívala
            nw.postMessage('SKIP_WAITING');
          }
        });
      });
      // Revisa updates al abrir y cada vez que la app vuelve a primer plano
      reg.update();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') reg.update();
      });
    }).catch(function () {});
  }

  // Refresca los tiempos de las pantallas de estación / pase cada 30s
  setInterval(function () {
    var v = App.Store.state.view;
    if (App.Auth.isLoggedIn() && (v === 'pase' || App.Store.isEstacionView(v)) && !document.querySelector('#modal-container .modal-overlay')) {
      App.render();
    }
  }, 30000);

  // Recordatorio sonoro: pedidos "enviados" demorados sin iniciar preparación.
  // Cada estación tiene su umbral (Configuración → Estaciones). Re-suena cada 60s.
  setInterval(function () {
    kitchenReminder().catch(function () {});
  }, 60000);
};

// Avisa a cada estación (y al admin) si tiene pedidos "enviados" sin
// iniciar por más de su umbral (recordatorioMin de la estación).
async function kitchenReminder() {
  if (!App.Auth.isLoggedIn()) return;
  var user = App.Auth.getCurrentUser();
  if (!user) return;
  var areas = user.role === 'admin'
    ? App.Estaciones.ids()
    : (App.Estaciones.esRolEstacion(user.role) ? [user.role] : []);
  if (areas.length === 0) return;

  var comandas = await App.DB.getAll('comandas');
  var demoradas = {};
  comandas.forEach(function (c) {
    if (c.estado === 'cancelada') return;
    (c.tandas || []).forEach(function (t) {
      if (t.estado !== 'enviada') return;
      var a = App.Estaciones.tandaArea(t);
      if (areas.indexOf(a) === -1) return;
      var umbral = Number(App.Estaciones.get(a).recordatorioMin) || 8;
      if ((Date.now() - t.enviadaAt) / 60000 >= umbral) demoradas[a] = true;
    });
  });
  var lista = Object.keys(demoradas);
  if (lista.length > 0) {
    var nombres = lista.map(function (a) { return App.Estaciones.label(a); }).join(', ');
    App.Utils.alertEvent(lista.length === 1 && lista[0] === 'bar' ? 'bar' : 'cocina', '⏰ Hay pedidos esperando en ' + nombres, 'error');
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
