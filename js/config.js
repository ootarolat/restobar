// config.js — settings view and data management actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

// Versión visible de la app (coincide con el cache del SW)
App.APP_VERSION = 'v23';

App.Views.config = async function (params) {
  params = params || {};
  var section = params.section || null;

  if (section === 'negocio') return cfgNegocio();
  if (section === 'caja') return await cfgCaja();
  if (section === 'estaciones') return await cfgEstaciones();
  if (section === 'sesion') return cfgSesion();
  if (section === 'mantenimiento') return cfgMantenimiento();
  if (section === 'inventario') return await App.Inv.view(params);
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

  // Resumen de inventario para la tarjeta
  var invResumen = 'Stock, alertas y presupuesto';
  try {
    var inv = await App.Inv.analisis();
    if (inv.filas.length) {
      invResumen = 'Valor ' + App.Utils.formatCLP(inv.tot.valor) +
        (inv.tot.alerta ? ' · ⚠️ ' + inv.tot.alerta + ' en alerta' : ' · sin alertas');
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
    card('inventario', '📦', 'Inventario', invResumen) +
    card('estaciones', '🧑‍🍳', 'Estaciones', App.Estaciones.list().map(function (e) { return e.icono + ' ' + e.nombre; }).join(' · ')) +
    card('sesion', '👤', 'Mi sesión', (user ? user.name : '') + ' · ' + rolLabel(user)) +
    card('mantenimiento', '🧹', 'Mantenimiento', 'Cerrar jornada, restaurar carta, borrar ventas') +
    '</div>' +
    '<div class="cfg-version">Restobar ' + App.APP_VERSION + '</div>' +
    '</div>';
}

function rolLabel(user) {
  if (!user) return '';
  var m = { admin: 'Administrador', mozo: 'Mozo', cajero: 'Cajero' };
  if (m[user.role]) return m[user.role];
  if (App.Estaciones.esRolEstacion(user.role)) return App.Estaciones.label(user.role);
  return user.role;
}

// Lista de roles válidos (para la ayuda): fijos + uno por estación
function rolesDisponibles() {
  return ['admin', 'mozo', 'cajero'].concat(App.Estaciones.ids());
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
    rolesDisponibles().map(function (r) { return '<code>' + App.Utils.esc(r) + '</code>'; }).join(', ') +
    '. Cada estación (Configuración → Estaciones) es un rol.</div>' +
    '<button class="btn btn-outline btn-block mt-16" onclick="App.Actions.logoutUser()">🚪 Cerrar sesión</button>' +
    '</div>';
}

// ===== Subsección: Estaciones (cocina, bar, ...) =====
async function cfgEstaciones() {
  var estaciones = App.Estaciones.list();
  var categorias = await App.DB.getAll('categorias');
  categorias.sort(function (a, b) { return a.orden - b.orden; });

  var rows = estaciones.map(function (e, i) {
    var cats = categorias.filter(function (c) { return App.Estaciones.areaDe(null, c) === e.id; })
      .map(function (c) { return App.Utils.esc(c.nombre); }).join(', ') || '—';
    var borrar = e.id === 'cocina' || estaciones.length <= 1 ? '' :
      '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="App.Actions.eliminarEstacion(\'' + e.id + '\')">Eliminar</button>';
    return '<div class="estacion-card">' +
      '<div class="estacion-card-head"><span class="estacion-icono">' + e.icono + '</span>' +
      '<div><div class="font-bold">' + App.Utils.esc(e.nombre) + '</div>' +
      '<div class="text-muted text-sm">Rol: <code>' + App.Utils.esc(e.id) + '</code></div></div></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Nombre</label>' +
      '<input type="text" id="est-nombre-' + i + '" class="form-input" value="' + App.Utils.esc(e.nombre) + '"></div>' +
      '<div class="form-group"><label class="form-label">Ícono</label>' +
      '<input type="text" id="est-icono-' + i + '" class="form-input" value="' + App.Utils.esc(e.icono) + '" maxlength="4"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Recordatorio si un pedido espera más de (min)</label>' +
      '<input type="number" id="est-min-' + i + '" class="form-input" value="' + (Number(e.recordatorioMin) || 8) + '" min="1"></div>' +
      '<div class="text-muted text-sm mb-12">Categorías: ' + cats + '</div>' +
      borrar +
      '</div>';
  }).join('');

  return '<div class="view">' + cfgHeader('🧑‍🍳 Estaciones') +
    '<div class="text-muted text-sm mb-16">Cada pedido se divide por estación: cada una ve solo lo suyo. ' +
    'El área de cada categoría/producto se define en <strong>Carta</strong>. ' +
    'Para que un usuario opere una estación, asígnale como <strong>role</strong> el id de la estación.</div>' +
    rows +
    '<button class="btn btn-primary btn-block btn-lg mt-12" onclick="App.Actions.guardarEstaciones()">Guardar cambios</button>' +
    '<div class="divider"></div>' +
    '<div class="section-title mb-12">Nueva estación</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Nombre</label>' +
    '<input type="text" id="est-nueva-nombre" class="form-input" placeholder="Ej: Parrilla"></div>' +
    '<div class="form-group"><label class="form-label">Ícono</label>' +
    '<input type="text" id="est-nueva-icono" class="form-input" value="🔥" maxlength="4"></div>' +
    '</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.agregarEstacion()">+ Agregar estación</button>' +
    '</div>';
}

App.Actions.guardarEstaciones = async function () {
  var estaciones = App.Estaciones.list().map(function (e, i) {
    var nombre = document.getElementById('est-nombre-' + i).value.trim() || e.nombre;
    var icono = document.getElementById('est-icono-' + i).value.trim() || e.icono;
    var min = parseInt(document.getElementById('est-min-' + i).value, 10) || 8;
    return { id: e.id, nombre: nombre, icono: icono, recordatorioMin: Math.max(1, min) };
  });
  await App.Store.saveSettings({ estaciones: estaciones });
  App.Utils.toast('Estaciones guardadas', 'success');
  App.render();
};

App.Actions.agregarEstacion = async function () {
  var nombre = document.getElementById('est-nueva-nombre').value.trim();
  var icono = document.getElementById('est-nueva-icono').value.trim() || '📦';
  var id = App.Estaciones.slug(nombre);
  if (!id) { App.Utils.toast('Ingresa un nombre', 'error'); return; }
  if (App.Estaciones.isReserved(id)) { App.Utils.toast('Ese nombre está reservado', 'error'); return; }
  if (App.Estaciones.exists(id)) { App.Utils.toast('Ya existe una estación "' + id + '"', 'error'); return; }
  var estaciones = App.Estaciones.list().concat([{ id: id, nombre: nombre, icono: icono, recordatorioMin: 8 }]);
  await App.Store.saveSettings({ estaciones: estaciones });
  App.Utils.toast('Estación creada. Rol para sus usuarios: ' + id, 'success');
  App.render();
};

App.Actions.eliminarEstacion = async function (id) {
  if (id === 'cocina') return;
  // No permitir si hay categorías/productos asignados o pedidos activos
  var cats = (await App.DB.getAll('categorias')).filter(function (c) { return c.area === id; });
  var prods = (await App.DB.getAll('productos')).filter(function (p) { return p.area === id; });
  var activos = 0;
  (await App.DB.getAll('comandas')).forEach(function (c) {
    (c.tandas || []).forEach(function (t) {
      if (t.area === id && ['enviada', 'preparando', 'lista'].indexOf(t.estado) !== -1) activos++;
    });
  });
  if (cats.length || prods.length || activos) {
    App.Utils.toast('No se puede eliminar: tiene ' + cats.length + ' categorías, ' + prods.length +
      ' productos y ' + activos + ' pedidos activos asignados', 'error');
    return;
  }
  var estaciones = App.Estaciones.list().filter(function (e) { return e.id !== id; });
  await App.Store.saveSettings({ estaciones: estaciones });
  App.Utils.toast('Estación eliminada', 'info');
  App.render();
};

// ===== Subsección: Mantenimiento =====
function cfgMantenimiento() {
  return '<div class="view">' + cfgHeader('🧹 Mantenimiento') +
    '<div class="text-muted text-sm mb-16">Todas estas acciones afectan a <strong>todos los dispositivos</strong>.</div>' +
    '<div class="order-section-title">Fin del día</div>' +
    '<button class="btn btn-primary btn-block btn-lg" onclick="App.Actions.cerrarJornada()">🌙 Cerrar jornada</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Pide el conteo de inventario, libera todas las mesas, borra las comandas y reinicia la caja. ' +
    '<strong>Las ventas y el inventario se conservan</strong>. Muestra el resumen del día antes de confirmar.</div>' +
    '<div class="order-section-title" style="color:var(--danger)">Zona de riesgo</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.restaurarCarta()">🔄 Restaurar carta y mesas</button>' +
    '<div class="text-muted text-sm mt-8 mb-16">Vuelve al menú y las mesas de <code>seed.js</code>. Úsalo después de actualizar el menú inicial. ' +
    'Requiere todas las mesas libres.</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.borrarVentas()" style="color:var(--danger);border-color:var(--danger)">📊 Borrar ventas</button>' +
    '<div class="text-muted text-sm mt-8">Elimina el histórico de ventas y deja los reportes en cero. Irreversible.</div>' +
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
