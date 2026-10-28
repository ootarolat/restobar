// mantenimiento.js — operaciones de limpieza/reinicio (solo admin).
// Todas las acciones afectan a TODOS los dispositivos (datos compartidos).
// Las ventas (colección 'cuentas') se conservan salvo acción explícita.
App.Actions = App.Actions || {};

// ===== Helper: confirmación reforzada (escribir una palabra clave) =====
// onConfirm se ejecuta solo si el usuario escribe exactamente 'keyword'.
App.Actions._confirmFuerte = function (opts) {
  var titulo = opts.titulo;
  var mensaje = opts.mensaje;
  var keyword = opts.keyword;       // palabra a escribir (ej: 'CERRAR')
  var fnName = opts.fnName;         // nombre de la acción en App.Actions a ejecutar
  var danger = opts.danger;

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">' + App.Utils.esc(titulo) + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' +
    '<p class="text-muted">' + mensaje + '</p>' +
    '<div class="form-group mt-12"><label class="form-label">Escribe <strong>' + keyword + '</strong> para confirmar</label>' +
    '<input type="text" id="confirm-keyword" class="form-input" autocapitalize="characters" autocomplete="off" ' +
    'placeholder="' + keyword + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" ' +
    'onclick="App.Actions._ejecutarSiConfirma(\'' + fnName + '\',\'' + keyword + '\')">Confirmar</button>' +
    '</div>'
  );
};

App.Actions._ejecutarSiConfirma = function (fnName, keyword) {
  var val = (document.getElementById('confirm-keyword').value || '').trim().toUpperCase();
  if (val !== keyword.toUpperCase()) {
    App.Utils.toast('Texto incorrecto. Escribe "' + keyword + '"', 'error');
    return;
  }
  App.Utils.closeModal();
  if (typeof App.Actions[fnName] === 'function') {
    App.Actions[fnName]();
  }
};

function esAdmin() {
  var u = App.Auth.getCurrentUser();
  return u && u.role === 'admin';
}

// ===== 1. Cerrar jornada (con resumen del día, mejora d) =====
App.Actions.cerrarJornada = async function () {
  if (!esAdmin()) return;

  // Resumen del día a la vista antes de confirmar
  var hoy = App.Utils.todayStart();
  var cuentas = (await App.DB.getAll('cuentas')).filter(function (c) { return c.fecha >= hoy; });
  var totalVentas = cuentas.reduce(function (t, c) { return t + c.total; }, 0);
  var nCuentas = cuentas.length;
  var mesasOcupadas = (await App.DB.getAll('mesas')).filter(function (m) { return m.estado === 'ocupada'; }).length;

  var resumen =
    '<div class="totals" style="margin-bottom:12px">' +
    '<div class="total-row"><span class="label">Ventas de hoy</span><span class="value">' + App.Utils.formatCLP(totalVentas) + '</span></div>' +
    '<div class="total-row"><span class="label">Cuentas cobradas</span><span class="value">' + nCuentas + '</span></div>' +
    '<div class="total-row"><span class="label">Mesas ocupadas ahora</span><span class="value">' + mesasOcupadas + '</span></div>' +
    '</div>';
  if (mesasOcupadas > 0) {
    resumen += '<p class="text-muted text-sm">⚠️ Hay ' + mesasOcupadas + ' mesa(s) ocupadas. Al cerrar la jornada se liberarán y se perderán sus pedidos no cobrados.</p>';
  }

  App.Actions._confirmFuerte({
    titulo: '🌙 Cerrar jornada',
    mensaje: resumen +
      'Se liberarán las mesas, se borrarán las comandas y se cerrará la caja. ' +
      'Las <strong>ventas se conservan</strong> para los reportes.',
    keyword: 'CERRAR',
    fnName: '_doCerrarJornada',
    danger: false,
  });
};

App.Actions._doCerrarJornada = async function () {
  App.Utils.toast('Cerrando jornada...', 'info');

  // 1. Liberar todas las mesas
  var mesas = await App.DB.getAll('mesas');
  for (var i = 0; i < mesas.length; i++) {
    var m = mesas[i];
    if (m.estado !== 'libre' || m.comandaId || m.mozoUid) {
      m.estado = 'libre'; m.comandaId = null; m.mozoUid = null; m.mozoName = null;
      await App.DB.put('mesas', m);
    }
  }

  // 2. Borrar TODAS las comandas (las ventas ya están registradas en 'cuentas')
  var comandas = await App.DB.getAll('comandas');
  for (var j = 0; j < comandas.length; j++) {
    await App.DB.remove('comandas', comandas[j].id);
  }

  // 3. Cerrar caja: borrar sesiones y movimientos (las ventas se conservan)
  var sesiones = await App.DB.getAll('sesiones');
  for (var k = 0; k < sesiones.length; k++) {
    await App.DB.remove('sesiones', sesiones[k].id);
  }
  var movs = await App.DB.getAll('movimientos');
  for (var l = 0; l < movs.length; l++) {
    await App.DB.remove('movimientos', movs[l].id);
  }

  App.Utils.toast('Jornada cerrada ✓', 'success');
  App.Store.navigate('mesas');
};

// ===== 2. Reiniciar mesas =====
App.Actions.reiniciarMesas = function () {
  if (!esAdmin()) return;
  App.Actions._confirmFuerte({
    titulo: '🍽️ Reiniciar mesas',
    mensaje: 'Todas las mesas quedarán libres y se eliminarán las comandas <strong>no cobradas</strong>. ' +
      'Se perderán los pedidos en curso. Afecta a todos los dispositivos.',
    keyword: 'REINICIAR',
    fnName: '_doReiniciarMesas',
    danger: true,
  });
};

App.Actions._doReiniciarMesas = async function () {
  App.Utils.toast('Reiniciando mesas...', 'info');

  // Eliminar comandas activas (no cerradas)
  var comandas = await App.DB.getAll('comandas');
  for (var i = 0; i < comandas.length; i++) {
    if (comandas[i].estado !== 'cerrada') {
      await App.DB.remove('comandas', comandas[i].id);
    }
  }

  // Liberar todas las mesas
  var mesas = await App.DB.getAll('mesas');
  for (var j = 0; j < mesas.length; j++) {
    var m = mesas[j];
    m.estado = 'libre'; m.comandaId = null; m.mozoUid = null; m.mozoName = null;
    await App.DB.put('mesas', m);
  }

  App.Utils.toast('Mesas reiniciadas ✓', 'success');
  App.Store.navigate('mesas');
};

// ===== 3. Limpiar comandas procesadas =====
App.Actions.limpiarComandas = function () {
  if (!esAdmin()) return;
  App.Actions._confirmFuerte({
    titulo: '📋 Limpiar comandas procesadas',
    mensaje: 'Se eliminarán las comandas ya <strong>cerradas o servidas</strong>. ' +
      'No afecta mesas activas ni las ventas.',
    keyword: 'LIMPIAR',
    fnName: '_doLimpiarComandas',
    danger: false,
  });
};

App.Actions._doLimpiarComandas = async function () {
  var comandas = await App.DB.getAll('comandas');
  var mesas = await App.DB.getAll('mesas');

  // IDs de comandas actualmente vinculadas a una mesa (activas): no se borran
  var comandasActivas = {};
  mesas.forEach(function (m) { if (m.comandaId) comandasActivas[m.comandaId] = true; });

  var n = 0;
  for (var i = 0; i < comandas.length; i++) {
    var c = comandas[i];
    // Procesada = cerrada (ya cobrada) y no vinculada a ninguna mesa ocupada
    if (c.estado === 'cerrada' && !comandasActivas[c.id]) {
      await App.DB.remove('comandas', c.id);
      n++;
    }
  }
  App.Utils.toast(n + (n === 1 ? ' comanda eliminada' : ' comandas eliminadas'), 'success');
  App.render();
};

// ===== 4. Reiniciar caja =====
App.Actions.reiniciarCaja = function () {
  if (!esAdmin()) return;
  App.Actions._confirmFuerte({
    titulo: '💰 Reiniciar caja',
    mensaje: 'Se cerrará la caja y se borrarán todos sus movimientos y aperturas. ' +
      'Las <strong>ventas se conservan</strong>. Afecta a todos los dispositivos.',
    keyword: 'REINICIAR',
    fnName: '_doReiniciarCaja',
    danger: true,
  });
};

App.Actions._doReiniciarCaja = async function () {
  var sesiones = await App.DB.getAll('sesiones');
  for (var i = 0; i < sesiones.length; i++) {
    await App.DB.remove('sesiones', sesiones[i].id);
  }
  var movs = await App.DB.getAll('movimientos');
  for (var j = 0; j < movs.length; j++) {
    await App.DB.remove('movimientos', movs[j].id);
  }
  App.Utils.toast('Caja reiniciada ✓', 'success');
  App.render();
};

// ===== 5. Borrar ventas y reportes =====
App.Actions.borrarVentas = function () {
  if (!esAdmin()) return;
  App.Actions._confirmFuerte({
    titulo: '📊 Borrar ventas y reportes',
    mensaje: '⚠️ Se eliminará <strong>todo el histórico de ventas</strong>. ' +
      'Los reportes quedarán en cero. Esta acción es <strong>irreversible</strong>.',
    keyword: 'BORRAR',
    fnName: '_doBorrarVentas',
    danger: true,
  });
};

App.Actions._doBorrarVentas = async function () {
  var cuentas = await App.DB.getAll('cuentas');
  for (var i = 0; i < cuentas.length; i++) {
    await App.DB.remove('cuentas', cuentas[i].id);
  }
  App.Utils.toast('Ventas eliminadas', 'info');
  App.render();
};
