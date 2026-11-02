// mantenimiento.js — operaciones de limpieza/reinicio (solo admin).
// Todas afectan a TODOS los dispositivos (datos compartidos en la nube).
//
// Se dejaron solo 3 operaciones, porque las demás ya estaban incluidas:
//  1. Cerrar jornada  → libera mesas + borra comandas + reinicia caja
//                       (cubre "reiniciar mesas", "limpiar comandas" y
//                        "reiniciar caja"). Conserva las ventas.
//  2. Restaurar carta y mesas → vuelve al menú de seed.js.
//  3. Borrar ventas   → elimina el histórico (cuentas) y deja reportes en 0.
// "Borrar todo" se eliminó: equivale a 1 + 2 + 3.
// "Asignar estaciones" se eliminó: las categorías sin estación ya usan
// la estación sugerida automáticamente y se editan en Carta → Categoría.
App.Actions = App.Actions || {};

// ===== Helper: confirmación reforzada (escribir una palabra clave) =====
App.Actions._confirmFuerte = function (opts) {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">' + App.Utils.esc(opts.titulo) + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' +
    '<div class="text-muted">' + opts.mensaje + '</div>' +
    '<div class="form-group mt-12"><label class="form-label">Escribe <strong>' + opts.keyword + '</strong> para confirmar</label>' +
    '<input type="text" id="confirm-keyword" class="form-input" autocapitalize="characters" autocomplete="off" ' +
    'placeholder="' + opts.keyword + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" ' +
    'onclick="App.Actions._ejecutarSiConfirma(\'' + opts.fnName + '\',\'' + opts.keyword + '\')">Confirmar</button>' +
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
  if (typeof App.Actions[fnName] === 'function') App.Actions[fnName]();
};

function esAdmin() {
  var u = App.Auth.getCurrentUser();
  return u && u.role === 'admin';
}

async function _mesasOcupadas() {
  return (await App.DB.getAll('mesas')).filter(function (m) { return m.estado === 'ocupada'; }).length;
}

// ===== 1. Cerrar jornada (con resumen del día) =====
App.Actions.cerrarJornada = async function () {
  if (!esAdmin()) return;

  var hoy = App.Utils.todayStart();
  var cuentas = (await App.DB.getAll('cuentas')).filter(function (c) { return c.fecha >= hoy; });
  var totalVentas = cuentas.reduce(function (t, c) { return t + c.total; }, 0);
  var ocupadas = await _mesasOcupadas();

  var resumen =
    '<div class="totals" style="margin-bottom:12px">' +
    '<div class="total-row"><span class="label">Ventas de hoy</span><span class="value">' + App.Utils.formatCLP(totalVentas) + '</span></div>' +
    '<div class="total-row"><span class="label">Cuentas cobradas</span><span class="value">' + cuentas.length + '</span></div>' +
    '<div class="total-row"><span class="label">Mesas ocupadas ahora</span><span class="value">' + ocupadas + '</span></div>' +
    '</div>' +
    (ocupadas > 0
      ? '<p class="text-sm" style="color:var(--danger)">⚠️ Hay ' + ocupadas + ' mesa(s) ocupadas. Se liberarán y se perderán sus pedidos no cobrados.</p>'
      : '');

  App.Actions._confirmFuerte({
    titulo: '🌙 Cerrar jornada',
    mensaje: resumen +
      '<p>Se liberan las mesas, se borran las comandas y se reinicia la caja. ' +
      'Las <strong>ventas se conservan</strong> para los reportes.</p>',
    keyword: 'CERRAR',
    fnName: '_doCerrarJornada',
    danger: false,
  });
};

App.Actions._doCerrarJornada = async function () {
  App.Utils.toast('Cerrando jornada...', 'info');

  var mesas = await App.DB.getAll('mesas');
  for (var i = 0; i < mesas.length; i++) {
    var m = mesas[i];
    if (m.estado !== 'libre' || m.comandaId || m.mozoUid) {
      m.estado = 'libre'; m.comandaId = null; m.mozoUid = null; m.mozoName = null;
      await App.DB.put('mesas', m);
    }
  }
  var stores = ['comandas', 'sesiones', 'movimientos'];
  for (var s = 0; s < stores.length; s++) {
    var docs = await App.DB.getAll(stores[s]);
    for (var j = 0; j < docs.length; j++) await App.DB.remove(stores[s], docs[j].id);
  }

  App.Utils.toast('Jornada cerrada ✓', 'success');
  App.Store.navigate('mesas');
};

// ===== 2. Restaurar carta y mesas (desde seed.js) =====
App.Actions.restaurarCarta = async function () {
  if (!esAdmin()) return;
  var ocupadas = await _mesasOcupadas();
  if (ocupadas > 0) {
    App.Utils.toast('Hay ' + ocupadas + ' mesa(s) ocupadas. Cierra la jornada primero.', 'error');
    return;
  }
  App.Actions._confirmFuerte({
    titulo: '🔄 Restaurar carta y mesas',
    mensaje: '<p>Se reemplazan las categorías, productos y mesas por los del menú inicial (<code>seed.js</code>). ' +
      'Se pierden los cambios hechos a la carta desde la app.</p>' +
      '<p>No afecta ventas, caja ni configuración del negocio.</p>',
    keyword: 'RESTAURAR',
    fnName: '_doRestaurarCarta',
    danger: true,
  });
};

App.Actions._doRestaurarCarta = async function () {
  await App.DB.clear('mesas');
  await App.DB.clear('categorias');
  await App.DB.clear('productos');
  await App.Seed.run(true);
  App.Utils.toast('Carta y mesas restauradas ✓', 'success');
  App.render();
};

// ===== 3. Borrar ventas y reportes =====
App.Actions.borrarVentas = function () {
  if (!esAdmin()) return;
  App.Actions._confirmFuerte({
    titulo: '📊 Borrar ventas',
    mensaje: '<p>⚠️ Se elimina <strong>todo el histórico de ventas</strong>: los reportes quedan en cero y ' +
      'desaparece la lista de "Cerradas hoy". <strong>Irreversible.</strong></p>' +
      '<p>Úsalo, por ejemplo, para borrar ventas de prueba antes de empezar a operar.</p>',
    keyword: 'BORRAR',
    fnName: '_doBorrarVentas',
    danger: true,
  });
};

App.Actions._doBorrarVentas = async function () {
  var cuentas = await App.DB.getAll('cuentas');
  for (var i = 0; i < cuentas.length; i++) await App.DB.remove('cuentas', cuentas[i].id);
  App.Utils.toast('Ventas eliminadas', 'info');
  App.render();
};
