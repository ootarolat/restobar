// config.js — settings view and data management actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

// Versión visible de la app (coincide con el cache del SW)
App.APP_VERSION = 'v17';

App.Views.config = async function (params) {
  params = params || {};
  var section = params.section || null;

  if (section === 'negocio') return cfgNegocio();
  if (section === 'caja') return await cfgCaja();
  if (section === 'sesion') return cfgSesion();
  if (section === 'mantenimiento') return cfgMantenimiento();
  if (section === 'avanzado') return cfgAvanzado();
  return await cfgHub();
};

// ===== Hub: menú de secciones =====
async function cfgHub() {
  var user = App.Auth.getCurrentUser();

  // Resumen de caja para la tarjeta (mejora a)
  var cajaResumen = 'Movimientos y cierre de turno';
  try {
    var sesion = await App._getSesionActiva();
    if (sesion) {
      var movs = (await App.DB.getAll('movimientos')).filter(function (m) { return m.fecha >= sesion.fecha; });
      var ing = movs.filter(function (m) { return m.tipo === 'ingreso'; }).reduce(function (t, m) { return t + m.monto; }, 0);
      var egr = movs.filter(function (m) { return m.tipo === 'egreso'; }).reduce(function (t, m) { return t + m.monto; }, 0);
      cajaResumen = 'Abierta · ' + App.Utils.formatCLP(sesion.monto + ing - egr);
    } else {
      cajaResumen = 'Cerrada';
    }
  } catch (e) {}

  function card(section, icon, titulo, desc) {
    return '<div class="cfg-card" onclick="App.Actions.cfgSection(\'' + section + '\')">' +
      '<span class="cfg-card-icon">' + icon + '</span>' +
      '<div class="cfg-card-text"><div class="cfg-card-title">' + titulo + '</div>' +
      '<div class="cfg-card-desc">' + App.Utils.esc(desc) + '</div></div>' +
      '<span class="cfg-card-arrow">›</span></div>';
  }

  return '<div class="view">' +
    '<div class="view-title">Configuración</div>' +
    '<div class="view-subtitle">' + App.Utils.esc(App.Store.state.settings.businessName || '') + '</div>' +
    '<div class="cfg-cards">' +
    card('negocio', '🏪', 'Negocio', 'Nombre, IVA, propina, mesas') +
    card('caja', '💰', 'Caja', cajaResumen) +
    card('sesion', '👤', 'Mi sesión', (user ? user.name : '') + ' · ' + rolLabel(user)) +
    card('mantenimiento', '🧹', 'Mantenimiento', 'Cerrar jornada y reinicios') +
    card('avanzado', '🗑️', 'Datos avanzados', 'Reiniciar carta, borrar todo') +
    '</div>' +
    '<div class="cfg-version">Restobar ' + App.APP_VERSION + '</div>' +
    '</div>';
}

function rolLabel(user) {
  if (!user) return '';
  var m = { admin: 'Administrador', mozo: 'Mozo', cajero: 'Cajero', cocina: 'Cocina' };
  return m[user.role] || user.role;
}

// Cabecera común de subsección con botón volver (mejora b)
function cfgHeader(titulo) {
  return '<div class="cfg-subhead">' +
    '<button class="header-back" onclick="App.Actions.cfgSection(null)">' +
    '<span class="header-back-arrow">‹</span> Configuración</button>' +
    '<div class="view-title" style="margin-top:8px">' + titulo + '</div></div>';
}

// ===== Subsección: Negocio =====
function cfgNegocio() {
  var s = App.Store.state.settings;
  return '<div class="view">' + cfgHeader('🏪 Negocio') +
    '<div class="config-form">' +
    '<div class="form-group"><label class="form-label">Nombre del negocio</label>' +
    '<input type="text" id="cfg-businessName" class="form-input" value="' + App.Utils.esc(s.businessName) + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">RUT</label>' +
    '<input type="text" id="cfg-rut" class="form-input" value="' + App.Utils.esc(s.rut) + '" placeholder="12.345.678-9"></div>' +
    '<div class="form-group"><label class="form-label">IVA (%)</label>' +
    '<input type="number" id="cfg-ivaRate" class="form-input" value="' + s.ivaRate + '"></div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Dirección</label>' +
    '<input type="text" id="cfg-address" class="form-input" value="' + App.Utils.esc(s.address) + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Propina sugerida (%)</label>' +
    '<input type="number" id="cfg-propinaDefault" class="form-input" value="' + s.propinaDefault + '"></div>' +
    '<div class="form-group"><label class="form-label">Cantidad de mesas</label>' +
    '<input type="number" id="cfg-mesaCount" class="form-input" value="' + s.mesaCount + '"></div>' +
    '</div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Activar propina sugerida</span>' +
    '<button class="toggle ' + (s.propinaEnabled ? 'on' : '') + '" id="cfg-propina-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Precios incluyen IVA</span>' +
    '<button class="toggle ' + (s.preciosIncluyenIva ? 'on' : '') + '" id="cfg-iva-incluido-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<button class="btn btn-primary btn-block btn-lg" onclick="App.Actions.guardarConfig()">Guardar cambios</button>' +
    '</div></div>';
}

// ===== Subsección: Caja (reutiliza la vista de caja) =====
async function cfgCaja() {
  var cajaHtml = await App.Views.caja();
  return '<div class="view" style="padding-bottom:0">' + cfgHeader('💰 Caja') + '</div>' + cajaHtml;
}

// ===== Subsección: Mi sesión =====
function cfgSesion() {
  var user = App.Auth.getCurrentUser();
  return '<div class="view">' + cfgHeader('👤 Mi sesión') +
    '<div class="carta-item">' +
    '<div class="carta-item-info">' +
    '<div class="carta-item-nombre">' + App.Utils.esc(user ? user.name : '') + '</div>' +
    '<div class="carta-item-meta">' + App.Utils.esc(user ? user.email : '') + ' · ' + rolLabel(user) + '</div>' +
    '</div></div>' +
    '<div class="text-muted text-sm mt-12">Los usuarios se administran desde la consola de Firebase (Authentication). ' +
    'El rol se define en la colección <strong>usuarios</strong> de Firestore, campo <strong>role</strong>: ' +
    '<code>admin</code>, <code>mozo</code>, <code>cajero</code> o <code>cocina</code>.</div>' +
    '<button class="btn btn-outline btn-block mt-16" onclick="App.Actions.logoutUser()">🚪 Cerrar sesión</button>' +
    '</div>';
}

// ===== Subsección: Mantenimiento =====
function cfgMantenimiento() {
  return '<div class="view">' + cfgHeader('🧹 Mantenimiento') +
    '<button class="btn btn-primary btn-block" onclick="App.Actions.cerrarJornada()">🌙 Cerrar jornada</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Libera mesas, borra comandas procesadas y cierra la caja. <strong>Conserva las ventas</strong> para los reportes.</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.reiniciarMesas()">🍽️ Reiniciar mesas</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Libera todas las mesas y elimina comandas no cobradas. Úsalo para destrabar al inicio del turno.</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.limpiarComandas()">📋 Limpiar comandas procesadas</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Elimina el historial de pedidos ya cerrados. No toca mesas activas ni ventas.</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.reiniciarCaja()">💰 Reiniciar caja</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Cierra la caja y borra sus movimientos. <strong>Conserva las ventas</strong>.</div>' +
    '<div class="divider"></div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.borrarVentas()" style="color:var(--danger);border-color:var(--danger)">📊 Borrar ventas y reportes</button>' +
    '<div class="text-muted text-sm mt-8">⚠️ Elimina el histórico de ventas. Los reportes quedarán en cero. Irreversible.</div>' +
    '</div>';
}

// ===== Subsección: Datos avanzados =====
function cfgAvanzado() {
  return '<div class="view">' + cfgHeader('🗑️ Datos avanzados') +
    '<div class="text-muted text-sm mb-16">⚠️ Estas acciones afectan a <strong>todos los dispositivos</strong> (datos compartidos en la nube).</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.reiniciarDatos()">Reiniciar carta y mesas</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Restaura el menú y las mesas de ejemplo. No borra ventas ni caja.</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.borrarTodo()" style="color:var(--danger);border-color:var(--danger)">Borrar todos los datos</button>' +
    '<div class="text-muted text-sm mt-8">⚠️ Elimina absolutamente todo. Irreversible.</div>' +
    '</div>';
}

// Navegación entre hub y subsecciones
App.Actions.cfgSection = function (section) {
  var params = Object.assign({}, App.Store.state.params, { section: section });
  App.Store.setState({ params: params });
};

App.Actions.guardarConfig = async function () {
  var settings = {
    businessName: document.getElementById('cfg-businessName').value.trim() || 'Mi Restobar',
    rut: document.getElementById('cfg-rut').value.trim(),
    address: document.getElementById('cfg-address').value.trim(),
    ivaRate: parseFloat(document.getElementById('cfg-ivaRate').value) || 19,
    propinaDefault: parseFloat(document.getElementById('cfg-propinaDefault').value) || 10,
    mesaCount: parseInt(document.getElementById('cfg-mesaCount').value) || 30,
    propinaEnabled: document.getElementById('cfg-propina-toggle').classList.contains('on'),
    preciosIncluyenIva: document.getElementById('cfg-iva-incluido-toggle').classList.contains('on'),
    currency: 'CLP',
  };

  // Handle mesa count change
  var oldCount = App.Store.state.settings.mesaCount || 30;
  var newCount = settings.mesaCount;
  if (newCount > oldCount) {
    var newMesas = [];
    for (var i = oldCount + 1; i <= newCount; i++) {
      var cap = i <= 8 ? 2 : i <= 20 ? 4 : 6;
      newMesas.push({ id: 'mesa-' + i, numero: i, capacidad: cap, estado: 'libre', comandaId: null });
    }
    await App.DB.bulkPut('mesas', newMesas);
    if (newMesas.length > 0) App.Utils.toast(newMesas.length + ' mesas añadidas', 'success');
  } else if (newCount < oldCount) {
    var mesas = await App.DB.getAll('mesas');
    var removed = 0;
    for (var j = 0; j < mesas.length; j++) {
      if (mesas[j].numero > newCount && mesas[j].estado === 'libre') {
        await App.DB.remove('mesas', mesas[j].id);
        removed++;
      }
    }
    if (removed > 0) App.Utils.toast(removed + ' mesas libres eliminadas', 'info');
  }

  await App.Store.saveSettings(settings);
  App.Utils.toast('Configuración guardada', 'success');
  App.Actions.cfgSection(null); // volver al hub
};

App.Actions.reiniciarDatos = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Reiniciar carta y mesas?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se restaurarán las mesas, categorías y productos de ejemplo ' +
    'para <strong>todos los dispositivos</strong>. Las comandas, cuentas y movimientos de caja no se verán afectados.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.confirmarReiniciar()">Reiniciar</button>' +
    '</div>'
  );
};

App.Actions.confirmarReiniciar = async function () {
  await App.DB.clear('mesas');
  await App.DB.clear('categorias');
  await App.DB.clear('productos');
  await App.Seed.run(true);
  App.Utils.closeModal();
  App.Utils.toast('Carta y mesas reiniciadas', 'success');
  App.render();
};

App.Actions.borrarTodo = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Borrar todo?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se eliminarán <strong>todos</strong> los datos de la nube: mesas, productos, comandas, ' +
    'cuentas, movimientos y configuración, en <strong>todos los dispositivos</strong>. Esta acción no se puede deshacer.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.confirmarBorrado()">Borrar todo</button>' +
    '</div>'
  );
};

App.Actions.confirmarBorrado = async function () {
  for (var i = 0; i < App.DB.STORES.length; i++) {
    await App.DB.clear(App.DB.STORES[i]);
  }
  App.Utils.closeModal();
  App.Utils.toast('Todos los datos eliminados', 'info');
  await App.Seed.run(true);
  await App.Store.loadSettings();
  App.Store.navigate('mesas');
};
