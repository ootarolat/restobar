// mesas.js — table grid view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.mesas = async function (params) {
  params = params || {};
  const user = App.Auth.getCurrentUser();
  const isAdmin = user && user.role === 'admin';
  const soloMias = !!params.soloMias;

  const mesas = await App.DB.getAll('mesas');
  mesas.sort((a, b) => a.numero - b.numero);

  // Load all comandas once
  const allComandas = await App.DB.getAll('comandas');
  const comandaMap = {};
  allComandas.forEach((c) => { comandaMap[c.id] = c; });

  const libres = mesas.filter((m) => m.estado === 'libre').length;
  const ocup = mesas.filter((m) => m.estado === 'ocupada').length;

  // Count orders ready to serve (lista) belonging to this user's tables
  let listosMias = 0;
  allComandas.forEach((c) => {
    if (c.estado === 'lista') {
      if (isAdmin || (user && c.mozoUid === user.uid)) listosMias++;
    }
  });

  // Filter tables if "solo mías" is on
  let visibles = mesas;
  if (soloMias && user) {
    visibles = mesas.filter((m) => m.mozoUid === user.uid || m.estado === 'libre');
  }

  const filterToggle =
    '<div class="flex gap-8 mb-16">' +
    '<button class="cat-tab ' + (!soloMias ? 'active' : '') + '" onclick="App.Actions.filtrarMesas(false)">Todas</button>' +
    '<button class="cat-tab ' + (soloMias ? 'active' : '') + '" onclick="App.Actions.filtrarMesas(true)">Mis mesas</button>' +
    '</div>';

  let readyBanner = '';
  if (listosMias > 0) {
    readyBanner =
      '<div class="ready-banner" onclick="App.Store.navigate(\'cocina\')">' +
      '🔔 ' + listosMias + (listosMias === 1 ? ' pedido listo para servir' : ' pedidos listos para servir') +
      '</div>';
  }

  let html =
    '<div class="view">' +
    '<div class="view-title">Mesas</div>' +
    '<div class="view-subtitle">' + libres + ' libres · ' + ocup + ' ocupadas</div>' +
    readyBanner +
    filterToggle +
    '<div class="mesa-grid">';

  visibles.forEach(function (mesa) {
    let totalHtml = '';
    let mozoHtml = '';
    let listoFlag = '';
    let servirBtn = '';

    if (mesa.estado === 'ocupada' && mesa.comandaId && comandaMap[mesa.comandaId]) {
      const comanda = comandaMap[mesa.comandaId];
      if (comanda.items && comanda.items.length > 0) {
        const sum = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
        totalHtml = '<div class="mesa-total">' + App.Utils.formatCLP(sum) + '</div>';
      }
      if (comanda.estado === 'lista') {
        listoFlag = '<span class="mesa-listo">🔔</span>';
        // El mozo (o admin) puede marcar servido directo desde la mesa
        servirBtn = '<button class="mesa-servir-btn" onclick="event.stopPropagation();App.Actions.servirDesdeMesa(\'' + comanda.id + '\')">Servir 🍽️</button>';
      }
    }
    if (mesa.mozoName) {
      mozoHtml = '<div class="mesa-mozo">👤 ' + App.Utils.esc(mesa.mozoName) + '</div>';
    }

    html +=
      '<div class="mesa-card ' + mesa.estado + '" onclick="App.Actions.tapMesa(\'' + mesa.id + '\')">' +
      '<span class="mesa-badge ' + mesa.estado + '"></span>' +
      listoFlag +
      '<div class="mesa-numero">' + mesa.numero + '</div>' +
      '<div class="mesa-capacidad">' + mesa.capacidad + ' pers.</div>' +
      totalHtml +
      mozoHtml +
      servirBtn +
      '</div>';
  });

  html += '</div></div>';
  return html;
};

App.Actions.filtrarMesas = function (soloMias) {
  var params = Object.assign({}, App.Store.state.params, { soloMias: soloMias });
  App.Store.setState({ params: params });
};

// El mozo marca "servido" directamente desde la tarjeta de mesa
App.Actions.servirDesdeMesa = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || comanda.estado !== 'lista') return;
  comanda.estado = 'abierta';
  comanda.servidoAt = Date.now();
  await App.DB.put('comandas', comanda);
  App.Utils.toast('Pedido servido ✓', 'success');
  App.render();
};

App.Actions.tapMesa = async function (mesaId) {
  const mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;
  const user = App.Auth.getCurrentUser();
  const isAdmin = user && user.role === 'admin';

  if (mesa.estado === 'libre' || mesa.estado === 'reservada') {
    // Start new comanda — assign current waiter as owner
    const comanda = {
      id: App.Utils.uid('com'),
      mesaId: mesa.id,
      items: [],
      estado: 'abierta',
      fecha: Date.now(),
      mozoUid: user ? user.uid : null,
      mozoName: user ? user.name : null,
    };
    await App.DB.put('comandas', comanda);
    mesa.estado = 'ocupada';
    mesa.comandaId = comanda.id;
    mesa.mozoUid = user ? user.uid : null;
    mesa.mozoName = user ? user.name : null;
    await App.DB.put('mesas', mesa);
    App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: comanda.id });
  } else if (mesa.estado === 'ocupada') {
    if (mesa.comandaId) {
      // Only the owner waiter or an admin can open/manage the table
      if (!isAdmin && user && mesa.mozoUid && mesa.mozoUid !== user.uid) {
        App.Utils.toast('Mesa atendida por ' + (mesa.mozoName || 'otro mozo'), 'error');
        return;
      }
      App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: mesa.comandaId });
    } else {
      // Orphaned occupied state — fix it
      mesa.estado = 'libre';
      mesa.mozoUid = null;
      mesa.mozoName = null;
      await App.DB.put('mesas', mesa);
      App.render();
    }
  }
};

// Admin: reassign a table to another waiter (picks from active users seen in comandas)
App.Actions.reasignarMozoPrompt = async function (mesaId) {
  var user = App.Auth.getCurrentUser();
  if (!user || user.role !== 'admin') return;
  var mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Reasignar mesa ' + mesa.numero + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><div class="form-group">' +
    '<label class="form-label">Nombre del mozo</label>' +
    '<input type="text" id="reasignar-nombre" class="form-input" value="' + App.Utils.esc(mesa.mozoName || '') + '" placeholder="Nombre del mozo"></div>' +
    '<p class="text-muted text-sm">Cambia quién atiende esta mesa. El nuevo mozo podrá gestionarla y liberarla.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.reasignarMozo(\'' + mesaId + '\')">Guardar</button>' +
    '</div>'
  );
};

App.Actions.reasignarMozo = async function (mesaId) {
  var nombre = document.getElementById('reasignar-nombre').value.trim();
  if (!nombre) { App.Utils.toast('Ingresa un nombre', 'error'); return; }
  var mesa = await App.DB.get('mesas', mesaId);
  mesa.mozoName = nombre;
  // Nota: al reasignar por nombre, el nuevo mozo se identifica por nombre.
  // El UID se actualiza cuando ese mozo abre la mesa desde su sesión.
  mesa.mozoUid = 'reassigned';
  await App.DB.put('mesas', mesa);
  if (mesa.comandaId) {
    var comanda = await App.DB.get('comandas', mesa.comandaId);
    if (comanda) { comanda.mozoName = nombre; comanda.mozoUid = 'reassigned'; await App.DB.put('comandas', comanda); }
  }
  App.Utils.closeModal();
  App.Utils.toast('Mesa reasignada a ' + nombre, 'success');
  App.render();
};
