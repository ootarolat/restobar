// caja.js — cash register view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App._getSesionActiva = async function () {
  var sesiones = await App.DB.getAll('sesiones');
  if (sesiones.length === 0) return null;
  sesiones.sort(function (a, b) { return a.fecha - b.fecha; });
  var last = sesiones[sesiones.length - 1];
  return last.tipo === 'apertura' ? last : null;
};

App.Views.caja = async function () {
  var sesion = await App._getSesionActiva();

  // Closed — show open form
  if (!sesion) {
    return '<div class="view">' +
      '<div class="view-title">Caja</div>' +
      '<div class="view-subtitle">Caja cerrada</div>' +
      '<div class="config-form">' +
      '<div class="form-group"><label class="form-label">Monto inicial en caja</label>' +
      '<input type="number" id="caja-monto-inicial" class="form-input" placeholder="50000" value="50000"></div>' +
      '<button class="btn btn-primary btn-block btn-lg" onclick="App.Actions.abrirCaja()">Abrir Caja</button>' +
      '</div></div>';
  }

  // Open — show balance and movements
  var movimientos = (await App.DB.getAll('movimientos')).filter(function (m) {
    return m.fecha >= sesion.fecha;
  });
  movimientos.sort(function (a, b) { return b.fecha - a.fecha; });

  var ingresos = movimientos.filter(function (m) { return m.tipo === 'ingreso'; })
    .reduce(function (t, m) { return t + m.monto; }, 0);
  var egresos = movimientos.filter(function (m) { return m.tipo === 'egreso'; })
    .reduce(function (t, m) { return t + m.monto; }, 0);
  var balance = sesion.monto + ingresos - egresos;

  var movementsHtml;
  if (movimientos.length === 0) {
    movementsHtml = '<div class="empty-state"><div class="empty-state-text">Sin movimientos todavía</div></div>';
  } else {
    movementsHtml = '<div class="movements-list">';
    movimientos.forEach(function (m) {
      var metodoLabel = m.metodoPago ? ' · ' + m.metodoPago : '';
      movementsHtml +=
        '<div class="movement-item">' +
        '<div class="movement-info">' +
        '<span class="movement-concept">' + App.Utils.esc(m.concepto) + '</span>' +
        '<span class="movement-time">' + App.Utils.formatTime(m.fecha) + metodoLabel + '</span>' +
        '</div>' +
        '<span class="movement-amount ' + m.tipo + '">' +
        (m.tipo === 'ingreso' ? '+' : '-') + App.Utils.formatCLP(m.monto) + '</span>' +
        '</div>';
    });
    movementsHtml += '</div>';
  }

  return '<div class="view">' +
    '<div class="balance-card">' +
    '<div class="balance-label">Balance en caja</div>' +
    '<div class="balance-value">' + App.Utils.formatCLP(balance) + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-top:8px">' +
    'Apertura: ' + App.Utils.formatCLP(sesion.monto) + ' · ' +
    'Ingresos: ' + App.Utils.formatCLP(ingresos) + ' · ' +
    'Egresos: ' + App.Utils.formatCLP(egresos) +
    '</div></div>' +
    '<div class="section-header">' +
    '<span class="section-title">Movimientos (' + movimientos.length + ')</span>' +
    '<button class="btn btn-outline btn-sm" onclick="App.Actions.nuevoEgreso()">+ Egreso</button>' +
    '</div>' +
    movementsHtml +
    '<div class="mt-16">' +
    '<button class="btn btn-danger btn-block btn-lg" onclick="App.Actions.cerrarCaja()">Cerrar Caja</button>' +
    '</div></div>';
};

App.Actions.abrirCaja = async function () {
  var monto = parseFloat(document.getElementById('caja-monto-inicial').value) || 0;
  await App.DB.put('sesiones', {
    id: App.Utils.uid('ses'),
    tipo: 'apertura',
    monto: monto,
    fecha: Date.now(),
  });
  App.Utils.toast('Caja abierta', 'success');
  App.render();
};

App.Actions.cerrarCaja = async function () {
  var sesion = await App._getSesionActiva();
  if (!sesion) return;

  var movimientos = (await App.DB.getAll('movimientos')).filter(function (m) {
    return m.fecha >= sesion.fecha;
  });
  var ingresos = movimientos.filter(function (m) { return m.tipo === 'ingreso'; })
    .reduce(function (t, m) { return t + m.monto; }, 0);
  var egresos = movimientos.filter(function (m) { return m.tipo === 'egreso'; })
    .reduce(function (t, m) { return t + m.monto; }, 0);
  var balance = sesion.monto + ingresos - egresos;

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Cerrar Caja</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' +
    '<div class="totals">' +
    '<div class="total-row"><span class="label">Apertura</span><span class="value">' + App.Utils.formatCLP(sesion.monto) + '</span></div>' +
    '<div class="total-row"><span class="label">Ingresos</span><span class="value" style="color:var(--success)">' + App.Utils.formatCLP(ingresos) + '</span></div>' +
    '<div class="total-row"><span class="label">Egresos</span><span class="value" style="color:var(--danger)">' + App.Utils.formatCLP(egresos) + '</span></div>' +
    '<div class="total-row grand-total"><span class="label">Balance esperado</span><span class="value">' + App.Utils.formatCLP(balance) + '</span></div>' +
    '</div>' +
    '<div class="form-group mt-16"><label class="form-label">Monto físico contado</label>' +
    '<input type="number" id="caja-monto-final" class="form-input" placeholder="' + balance + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.confirmarCierreCaja()">Confirmar Cierre</button>' +
    '</div>'
  );
};

App.Actions.confirmarCierreCaja = async function () {
  var input = document.getElementById('caja-monto-final');
  var montoFinal = input ? (parseFloat(input.value) || 0) : 0;
  await App.DB.put('sesiones', {
    id: App.Utils.uid('ses'),
    tipo: 'cierre',
    monto: montoFinal,
    fecha: Date.now(),
  });
  App.Utils.closeModal();
  App.Utils.toast('Caja cerrada', 'success');
  App.render();
};

App.Actions.nuevoEgreso = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Nuevo Egreso</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><div class="config-form">' +
    '<div class="form-group mb-12"><label class="form-label">Concepto</label>' +
    '<input type="text" id="egreso-concepto" class="form-input" placeholder="Ej: Compra de insumos"></div>' +
    '<div class="form-group"><label class="form-label">Monto</label>' +
    '<input type="number" id="egreso-monto" class="form-input" placeholder="0"></div>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.guardarEgreso()">Registrar</button>' +
    '</div>'
  );
};

App.Actions.guardarEgreso = async function () {
  var concepto = document.getElementById('egreso-concepto').value.trim();
  var monto = parseFloat(document.getElementById('egreso-monto').value) || 0;
  if (!concepto || monto <= 0) {
    App.Utils.toast('Completa los datos', 'error');
    return;
  }
  await App.DB.put('movimientos', {
    id: App.Utils.uid('mov'),
    tipo: 'egreso',
    monto: monto,
    concepto: concepto,
    fecha: Date.now(),
  });
  App.Utils.closeModal();
  App.Utils.toast('Egreso registrado', 'success');
  App.render();
};
