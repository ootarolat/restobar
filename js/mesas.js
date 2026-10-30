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

  // Tandas LISTAS de las mesas de este usuario, por estación
  let listosMias = 0;
  const listosPorArea = {};
  allComandas.forEach((c) => {
    if (c.estado === 'cancelada' || c.estado === 'cerrada') return;
    var mine = isAdmin || (user && c.mozoUid === user.uid);
    if (!mine) return;
    (c.tandas || []).forEach(function (t) {
      if (t.estado !== 'lista') return;
      listosMias++;
      var a = App.Estaciones.tandaArea(t);
      listosPorArea[a] = (listosPorArea[a] || 0) + 1;
    });
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
    var detalle = Object.keys(listosPorArea).map(function (a) {
      return App.Estaciones.get(a).icono + ' ' + listosPorArea[a];
    }).join(' · ');
    readyBanner =
      '<div class="ready-banner" onclick="App.Actions.filtrarMesas(true)">' +
      '🔔 ' + listosMias + (listosMias === 1 ? ' pedido listo para servir' : ' pedidos listos para servir') +
      (App.Estaciones.list().length > 1 ? ' · ' + detalle : '') +
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
      if (App.Utils.itemsActivos(comanda.items).length > 0) {
        const sum = App.Utils.calcTotales(comanda.items, App.Store.state.settings, 0).subtotal;
        totalHtml = '<div class="mesa-total">' + App.Utils.formatCLP(sum) + '</div>';
      }
      // ¿Hay tandas listas para servir? (por estación)
      const listas = (comanda.tandas || []).filter(function (t) { return t.estado === 'lista'; });
      if (listas.length > 0) {
        var areas = [];
        listas.forEach(function (t) {
          var a = App.Estaciones.tandaArea(t);
          if (areas.indexOf(a) === -1) areas.push(a);
        });
        var iconos = areas.map(function (a) { return App.Estaciones.get(a).icono; }).join('');
        listoFlag = '<span class="mesa-listo">🔔' + (App.Estaciones.list().length > 1 ? iconos : '') + '</span>';
        var label = listas.length === 1 ? 'Servir 🍽️' : 'Servir ' + listas.length + ' 🍽️';
        servirBtn = '<button class="mesa-servir-btn" onclick="event.stopPropagation();App.Actions.servirPrompt(\'' + comanda.id + '\')">' + label + '</button>';
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

// Si hay listos de varias estaciones, pregunta qué servir (bebidas / comida / todo)
App.Actions.servirPrompt = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  var porArea = {};
  (comanda.tandas || []).forEach(function (t) {
    if (t.estado !== 'lista') return;
    var a = App.Estaciones.tandaArea(t);
    (porArea[a] = porArea[a] || []).push(t);
  });
  var areas = Object.keys(porArea);
  if (areas.length === 0) return;
  if (areas.length === 1) return App.Actions.servirDesdeMesa(comandaId, null);

  var opciones = areas.map(function (a) {
    var items = [];
    porArea[a].forEach(function (t) {
      t.items.forEach(function (it) { if (!it.anulado) items.push(it.cantidad + 'x ' + App.Utils.esc(it.nombre)); });
    });
    return '<button class="btn btn-outline btn-block mb-12 servir-opcion" onclick="App.Actions.servirDesdeMesa(\'' + comandaId + '\',\'' + a + '\')">' +
      '<strong>' + App.Estaciones.label(a) + '</strong><span class="text-muted text-sm">' + items.join(', ') + '</span></button>';
  }).join('');

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Qué vas a servir?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' + opciones + '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-success" onclick="App.Actions.servirDesdeMesa(\'' + comandaId + '\')">Servir todo</button>' +
    '</div>'
  );
};

// El mozo marca "servido" las tandas listas de la mesa (de un área o todas)
App.Actions.servirDesdeMesa = async function (comandaId, area) {
  var now = Date.now();
  var n = 0;
  await App.DB.update('comandas', comandaId, function (comanda) {
    n = 0;
    (comanda.tandas || []).forEach(function (t) {
      if (t.estado !== 'lista') return;
      if (area && App.Estaciones.tandaArea(t) !== area) return;
      t.estado = 'servida';
      t.servidoAt = now;
      n++;
    });
    if (n === 0) return false;
  });
  App.Utils.closeModal();
  if (n === 0) return;
  App.Utils.toast(n === 1 ? 'Pedido servido ✓' : n + ' pedidos servidos ✓', 'success');
  App.render();
};

App.Actions.tapMesa = async function (mesaId) {
  const mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;
  const user = App.Auth.getCurrentUser();
  const isAdmin = user && user.role === 'admin';

  if (mesa.estado === 'libre' || mesa.estado === 'reservada') {
    // Nueva comanda. Se crea primero y luego se "reclama" la mesa de forma
    // atómica: si otro mozo la tomó un instante antes, se descarta.
    const comanda = {
      id: App.Utils.uid('com'),
      mesaId: mesa.id,
      items: [],
      tandas: [],
      estado: 'abierta',
      fecha: Date.now(),
      mozoUid: user ? user.uid : null,
      mozoName: user ? user.name : null,
    };
    await App.DB.put('comandas', comanda);
    const claimed = await App.DB.update('mesas', mesa.id, function (m) {
      if (m.estado !== 'libre' && m.estado !== 'reservada') return false;
      m.estado = 'ocupada';
      m.comandaId = comanda.id;
      m.mozoUid = user ? user.uid : null;
      m.mozoName = user ? user.name : null;
    });
    if (!claimed) {
      await App.DB.remove('comandas', comanda.id);
      App.Utils.toast('La mesa acaba de ser tomada por otro mozo', 'error');
      App.render();
      return;
    }
    App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: comanda.id });
  } else if (mesa.estado === 'ocupada') {
    if (mesa.comandaId) {
      // Only the owner waiter or an admin can open/manage the table
      if (!isAdmin && user && mesa.mozoUid && mesa.mozoUid !== user.uid && mesa.mozoUid !== 'reassigned') {
        App.Utils.toast('Mesa atendida por ' + (mesa.mozoName || 'otro mozo'), 'error');
        return;
      }
      App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: mesa.comandaId });
    } else {
      // Orphaned occupied state — fix it
      await App.DB.update('mesas', mesa.id, function (m) {
        if (m.comandaId) return false;
        m.estado = 'libre'; m.mozoUid = null; m.mozoName = null;
      });
      App.render();
    }
  }
};

// ===== Admin: reasignar mesa a otro usuario (lista real desde 'usuarios') =====
var _usuariosCache = null;

async function _cargarUsuarios() {
  try {
    var snap = await window.FB.getDocs(window.FB.collection(window.FB.db, 'usuarios'));
    var list = [];
    snap.forEach(function (d) {
      var u = d.data();
      var role = u.role || 'mozo';
      // Solo quienes atienden mesas
      if (role === 'mozo' || role === 'cajero' || role === 'admin') {
        list.push({ uid: d.id, name: u.name || d.id, role: role });
      }
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    _usuariosCache = list;
    return list;
  } catch (e) {
    // Reglas antiguas (solo lectura del propio perfil) → fallback manual
    console.warn('No se pudo leer la lista de usuarios:', e && e.code);
    return null;
  }
}

App.Actions.reasignarMozoPrompt = async function (mesaId) {
  var user = App.Auth.getCurrentUser();
  if (!user || user.role !== 'admin') return;
  var mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;

  var usuarios = await _cargarUsuarios();
  var campo;
  if (usuarios && usuarios.length > 0) {
    campo = '<label class="form-label">Mozo</label>' +
      '<select id="reasignar-uid" class="form-select">' +
      usuarios.map(function (u) {
        return '<option value="' + App.Utils.esc(u.uid) + '"' + (u.uid === mesa.mozoUid ? ' selected' : '') + '>' +
          App.Utils.esc(u.name) + ' (' + u.role + ')</option>';
      }).join('') + '</select>';
  } else {
    campo = '<label class="form-label">Nombre del mozo</label>' +
      '<input type="text" id="reasignar-nombre" class="form-input" value="' + App.Utils.esc(mesa.mozoName || '') + '" placeholder="Nombre del mozo">' +
      '<p class="text-muted text-sm mt-8">No se pudo leer la lista de usuarios. Publica las reglas de Firestore actualizadas para elegir de una lista.</p>';
  }

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Reasignar mesa ' + mesa.numero + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><div class="form-group">' + campo + '</div>' +
    '<p class="text-muted text-sm">Cambia quién atiende esta mesa. El nuevo mozo podrá gestionarla y liberarla.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.reasignarMozo(\'' + mesaId + '\')">Guardar</button>' +
    '</div>'
  );
};

App.Actions.reasignarMozo = async function (mesaId) {
  var sel = document.getElementById('reasignar-uid');
  var uid, nombre;
  if (sel) {
    uid = sel.value;
    var u = (_usuariosCache || []).filter(function (x) { return x.uid === uid; })[0];
    nombre = u ? u.name : uid;
  } else {
    nombre = document.getElementById('reasignar-nombre').value.trim();
    if (!nombre) { App.Utils.toast('Ingresa un nombre', 'error'); return; }
    // Sin lista de usuarios: cualquier mozo puede tomar la mesa (compat.)
    uid = 'reassigned';
  }

  var mesa = await App.DB.update('mesas', mesaId, function (m) {
    m.mozoName = nombre;
    m.mozoUid = uid;
  });
  if (mesa && mesa.comandaId) {
    await App.DB.update('comandas', mesa.comandaId, function (c) {
      c.mozoName = nombre;
      c.mozoUid = uid;
    });
  }
  App.Utils.closeModal();
  App.Utils.toast('Mesa reasignada a ' + nombre, 'success');
  App.render();
};
