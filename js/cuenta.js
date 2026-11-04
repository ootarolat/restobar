// cuenta.js — cobro: totales, propina, pago simple o DIVIDIDO por método.
// El cobro trabaja sobre comanda.items (las líneas anuladas no se cobran).
// La división en estaciones (cocina/bar) no afecta el cobro.
App.Views = App.Views || {};
App.Actions = App.Actions || {};
// Versión de este archivo (app.js detecta si se cargó una mezcla de versiones)
App.BUILD = App.BUILD || {}; App.BUILD.cuenta = 'v27';

var METODOS = [
  { id: 'efectivo', icon: '💵', label: 'Efectivo' },
  { id: 'tarjeta', icon: '💳', label: 'Tarjeta' },
  { id: 'transferencia', icon: '📱', label: 'Transfer.' },
];

function _metodoLabel(id) {
  var m = METODOS.filter(function (x) { return x.id === id; })[0];
  return m ? m.icon + ' ' + m.label : id;
}

function _propinaRate(params) {
  var s = App.Store.state.settings;
  return params.propinaRate !== undefined ? params.propinaRate : (s.propinaEnabled ? s.propinaDefault : 0);
}
// Propina manual en pesos (undefined = se usa el %)
function _propinaMonto(params) {
  return typeof params.propinaMonto === 'number' ? params.propinaMonto : undefined;
}
function _propinaLabel(params, tot) {
  if (typeof params.propinaMonto === 'number') return 'Propina (manual)';
  return 'Propina (' + _propinaRate(params) + '%)';
}

App.Views.cuenta = async function (params) {
  var comanda = await App.DB.get('comandas', params.comandaId);
  if (!comanda || comanda.estado === 'cerrada' || comanda.estado === 'cancelada') {
    return App.comandaNoDisponible(comanda, params.comandaId);
  }

  var activos = App.Utils.itemsActivos(comanda.items);
  if (activos.length === 0) {
    return '<div class="view"><div class="empty-state">' +
      '<div class="empty-state-icon">🧾</div>' +
      '<div class="empty-state-text">No hay items en la comanda</div>' +
      '<button class="btn btn-primary mt-16" onclick="App.Actions.volverMesas()">Volver a mesas</button>' +
      '</div></div>';
  }

  var settings = App.Store.state.settings;
  var propinaRate = _propinaRate(params);
  var metodoPago = params.metodoPago || 'efectivo';
  var dividir = !!params.dividir;
  var pagos = params.pagos || [];
  var mesa = await App.DB.get('mesas', params.mesaId);
  var propinaMonto = _propinaMonto(params);
  var tot = App.Utils.calcTotales(comanda.items, settings, propinaRate, propinaMonto);

  // Items (activos) + anulados informativos
  var itemsHtml = '<div class="order-items">';
  activos.forEach(function (item) {
    itemsHtml +=
      '<div class="order-item">' +
      '<div class="order-item-info">' +
      '<div class="order-item-nombre">' + item.cantidad + 'x ' + App.Utils.esc(item.nombre) + '</div>' +
      (item.notas ? '<div class="order-item-notas">' + App.Utils.esc(item.notas) + '</div>' : '') +
      '</div>' +
      '<div class="order-item-precio">' + App.Utils.formatCLP(item.cantidad * item.precio) + '</div>' +
      '</div>';
  });
  itemsHtml += '</div>';

  var anulados = (comanda.items || []).filter(function (i) { return i.anulado; });
  var anuladosHtml = anulados.length
    ? '<div class="text-muted text-sm mb-12">🚫 ' + anulados.length + ' producto(s) anulado(s), no se cobran: ' +
      anulados.map(function (i) { return i.cantidad + 'x ' + App.Utils.esc(i.nombre); }).join(', ') + '</div>'
    : '';

  var sinEnviar = activos.filter(function (i) { return !i.tandaId; }).length;
  var avisoSinEnviar = sinEnviar
    ? '<div class="warning-box">⚠️ Hay ' + sinEnviar + ' producto(s) que no se enviaron a preparar. Igual se cobrarán.</div>'
    : '';

  // Totals
  var totalsHtml =
    '<div class="totals">' +
    '<div class="total-row"><span class="label">Subtotal</span><span class="value">' + App.Utils.formatCLP(tot.subtotal) + '</span></div>' +
    '<div class="total-row"><span class="label">IVA ' + (tot.ivaIncluido ? 'incluido ' : '') + '(' + tot.ivaRate + '%)</span><span class="value">' + App.Utils.formatCLP(tot.iva) + '</span></div>' +
    (tot.propina > 0 ? '<div class="total-row"><span class="label">' + _propinaLabel(params, tot) + '</span><span class="value">' + App.Utils.formatCLP(tot.propina) + '</span></div>' : '') +
    '<div class="total-row grand-total"><span class="label">Total</span><span class="value">' + App.Utils.formatCLP(tot.total) + '</span></div>' +
    '</div>';

  // Propina section
  var propinaHtml = '';
  if (settings.propinaEnabled) {
    var manual = typeof propinaMonto === 'number';
    function pBtn(rate, label) {
      return '<button class="propina-btn ' + (!manual && propinaRate === rate ? 'active' : '') +
        '" onclick="App.Actions.setPropina(' + rate + ')">' + label + '</button>';
    }
    propinaHtml =
      '<div class="propina-section">' +
      '<div class="form-label">' + _propinaLabel(params, tot) + ' · ' + App.Utils.formatCLP(tot.propina) + '</div>' +
      '<div class="propina-buttons">' +
      pBtn(0, 'Sin') + pBtn(10, '10%') + pBtn(15, '15%') +
      '<button class="propina-btn ' + (manual ? 'active' : '') + '" onclick="App.Actions.propinaManualPrompt()">Otra $</button>' +
      '</div>' +
      '</div>';
  }

  function metodoButtons(selected, action) {
    return '<div class="payment-methods">' + METODOS.map(function (m) {
      return '<div class="payment-method ' + (selected === m.id ? 'active' : '') + '" onclick="' + action + '(\'' + m.id + '\')">' +
        '<span class="payment-method-icon">' + m.icon + '</span>' + m.label + '</div>';
    }).join('') + '</div>';
  }

  var paymentHtml = '';
  var actionBtn = '';
  var dividirToggle =
    '<div class="toggle-row"><span class="form-label" style="margin:0">Dividir pago</span>' +
    '<button class="toggle ' + (dividir ? 'on' : '') + '" onclick="App.Actions.setDividirPago(' + (!dividir) + ')"></button></div>';

  if (!dividir) {
    paymentHtml = '<div class="form-label">Método de pago</div>' + metodoButtons(metodoPago, 'App.Actions.setMetodoPago');
    actionBtn =
      '<button class="btn btn-success btn-block btn-lg" onclick="App.Actions.cobrar(\'' + params.comandaId + '\',\'' + params.mesaId + '\')">' +
      'Cobrar ' + App.Utils.formatCLP(tot.total) + '</button>';
  } else {
    var pagado = pagos.reduce(function (t, p) { return t + p.monto; }, 0);
    var restante = tot.total - pagado;
    var lista = pagos.map(function (p, i) {
      return '<div class="pago-row"><span>' + _metodoLabel(p.metodo) + '</span>' +
        '<span class="pago-monto">' + App.Utils.formatCLP(p.monto) + '</span>' +
        '<button class="icon-btn danger" onclick="App.Actions.quitarPago(' + i + ')">✕</button></div>';
    }).join('');
    paymentHtml =
      '<div class="pagos-box">' +
      (lista || '<div class="text-muted text-sm">Agrega los pagos parciales.</div>') +
      '<div class="pago-row pago-resto"><span>Restante</span><span class="pago-monto">' + App.Utils.formatCLP(Math.max(restante, 0)) + '</span></div>' +
      '</div>';
    if (restante > 0) {
      paymentHtml +=
        '<div class="form-label mt-12">Nuevo pago</div>' +
        metodoButtons(metodoPago, 'App.Actions.setMetodoPago') +
        '<div class="flex gap-8 mt-12">' +
        '<input type="number" id="pago-monto" class="form-input" value="' + restante + '" min="1" max="' + restante + '">' +
        '<button class="btn btn-primary" onclick="App.Actions.agregarPago(' + restante + ')">Agregar</button>' +
        '</div>';
    }
    if (restante < 0) {
      paymentHtml += '<div class="warning-box mt-12">Los pagos superan el total. Quita alguno.</div>';
    }
    actionBtn =
      '<button class="btn btn-success btn-block btn-lg" ' + (restante === 0 ? '' : 'disabled ') +
      'onclick="App.Actions.cobrar(\'' + params.comandaId + '\',\'' + params.mesaId + '\')">' +
      (restante === 0 ? 'Cobrar ' + App.Utils.formatCLP(tot.total) + ' (' + pagos.length + ' pagos)' : 'Falta ' + App.Utils.formatCLP(Math.max(restante, 0))) +
      '</button>';
  }

  return '<div class="view">' +
    '<div class="section-header"><span class="section-title">Mesa ' + (mesa ? mesa.numero : '?') + '</span>' +
    '<span class="badge badge-enviada">Cobro</span></div>' +
    avisoSinEnviar + itemsHtml + anuladosHtml + totalsHtml + propinaHtml + dividirToggle + paymentHtml +
    '<div class="mt-16">' + actionBtn + '</div>' +
    '</div>';
};

App.Actions.setPropina = function (rate) {
  // Cambiar la propina cambia el total → se reinician los pagos parciales
  var params = Object.assign({}, App.Store.state.params, { propinaRate: rate, pagos: [] });
  delete params.propinaMonto;
  App.Store.setState({ params: params });
};

// Propina manual: el cliente indica un monto en pesos
App.Actions.propinaManualPrompt = function () {
  var actual = typeof App.Store.state.params.propinaMonto === 'number' ? App.Store.state.params.propinaMonto : '';
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Propina manual</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><div class="form-group">' +
    '<label class="form-label">Monto de la propina ($)</label>' +
    '<input type="number" id="propina-monto" class="form-input" inputmode="numeric" min="0" step="100" ' +
    'value="' + actual + '" placeholder="Ej: 3000" autofocus ' +
    'onkeydown="if(event.key===\'Enter\')App.Actions.aplicarPropinaManual()"></div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.aplicarPropinaManual()">Aplicar</button>' +
    '</div>'
  );
};

App.Actions.aplicarPropinaManual = async function () {
  var input = document.getElementById('propina-monto');
  var raw = input ? input.value.trim() : '';
  var monto = Math.round(Number(raw));
  if (raw === '' || !isFinite(monto) || monto < 0) {
    App.Utils.toast('Ingresa un monto válido', 'error');
    return;
  }
  // Aviso si la propina supera el 30% del consumo (posible cero de más)
  var params = App.Store.state.params;
  var comanda = await App.DB.get('comandas', params.comandaId);
  var subtotal = comanda ? App.Utils.calcTotales(comanda.items, App.Store.state.settings, 0).subtotal : 0;
  if (subtotal > 0 && monto > subtotal * 0.3 &&
      !window.confirm('La propina (' + App.Utils.formatCLP(monto) + ') supera el 30% del consumo. ¿Confirmar?')) {
    return;
  }
  App.Utils.closeModal();
  App.Store.setState({ params: Object.assign({}, params, { propinaMonto: monto, pagos: [] }) });
};

App.Actions.setMetodoPago = function (method) {
  var params = Object.assign({}, App.Store.state.params, { metodoPago: method });
  App.Store.setState({ params: params });
};

App.Actions.setDividirPago = function (on) {
  var params = Object.assign({}, App.Store.state.params, { dividir: !!on, pagos: [] });
  App.Store.setState({ params: params });
};

App.Actions.agregarPago = function (restante) {
  var input = document.getElementById('pago-monto');
  var monto = Math.round(parseFloat(input ? input.value : '') || 0);
  if (monto <= 0) { App.Utils.toast('Monto inválido', 'error'); return; }
  if (monto > restante) { App.Utils.toast('El monto supera lo restante', 'error'); return; }
  var params = App.Store.state.params;
  var pagos = (params.pagos || []).concat([{ metodo: params.metodoPago || 'efectivo', monto: monto }]);
  App.Store.setState({ params: Object.assign({}, params, { pagos: pagos }) });
};

App.Actions.quitarPago = function (idx) {
  var params = App.Store.state.params;
  var pagos = (params.pagos || []).slice();
  pagos.splice(idx, 1);
  App.Store.setState({ params: Object.assign({}, params, { pagos: pagos }) });
};

App.Actions.cobrar = async function (comandaId, mesaId) {
  App.marcarCierre(comandaId);
  try {
    await _cobrar(comandaId, mesaId);
  } finally {
    App.desmarcarCierre(comandaId);
  }
};

async function _cobrar(comandaId, mesaId) {
  var params = App.Store.state.params;
  var settings = App.Store.state.settings;
  var propinaRate = _propinaRate(params);
  var user = App.Auth.getCurrentUser();
  var now = Date.now();

  // 1. Cerrar la comanda de forma atómica: si otro dispositivo ya la cobró,
  //    no se vuelve a cobrar.
  var comanda = await App.DB.update('comandas', comandaId, function (c) {
    if (c.estado === 'cerrada' || c.estado === 'cancelada') return false;
    if (App.Utils.itemsActivos(c.items).length === 0) return false;
    c.estado = 'cerrada';
    c.cerradaAt = now;
  });
  if (!comanda) {
    App.Utils.toast('Esta cuenta ya fue cobrada o no tiene productos', 'error');
    App.Store.navigate('mesas');
    return;
  }

  var propinaMonto = _propinaMonto(params);
  var tot = App.Utils.calcTotales(comanda.items, settings, propinaRate, propinaMonto);
  // Con propina manual, guardar el % equivalente (1 decimal) para los reportes
  if (typeof propinaMonto === 'number') {
    propinaRate = tot.subtotal > 0 ? Math.round(tot.propina / tot.subtotal * 1000) / 10 : 0;
  }
  var pagos;
  if (params.dividir) {
    pagos = (params.pagos || []).slice();
    var suma = pagos.reduce(function (t, p) { return t + p.monto; }, 0);
    if (suma !== tot.total) {
      // El total cambió mientras se dividía (ej. otro anuló un producto)
      await App.DB.update('comandas', comandaId, function (c) { c.estado = 'abierta'; delete c.cerradaAt; });
      App.Utils.toast('El total cambió. Revisa los pagos.', 'error');
      App.Store.setState({ params: Object.assign({}, params, { pagos: [] }) });
      return;
    }
  } else {
    pagos = [{ metodo: params.metodoPago || 'efectivo', monto: tot.total }];
  }
  var metodoPago = pagos.length === 1 ? pagos[0].metodo : 'mixto';
  var mesa = await App.DB.get('mesas', mesaId);

  // 2. Registro de la cuenta (venta) — con área por línea y tiempos por tanda
  var cuenta = {
    id: App.Utils.uid('cue'),
    comandaId: comanda.id,
    mesaId: mesaId,
    mesaNumero: mesa ? mesa.numero : null,
    mozoUid: (comanda.mozoUid || (user ? user.uid : null)),
    mozoName: (comanda.mozoName || (user ? user.name : null)),
    cobradoPor: user ? user.name : null,
    items: App.Utils.itemsActivos(comanda.items).map(function (i) {
      return {
        productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio,
        notas: i.notas || '', area: i.area || null,
      };
    }),
    anulados: (comanda.items || []).filter(function (i) { return i.anulado; }).map(function (i) {
      return {
        productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio,
        area: i.area || null, motivo: i.motivoAnulacion || '', por: i.anuladoPor || null, at: i.anuladoAt || null,
      };
    }),
    tiempos: (comanda.tandas || []).map(function (t) {
      return {
        area: App.Estaciones.tandaArea(t), numero: t.numero, estado: t.estado, directa: !!t.directa,
        enviadaAt: t.enviadaAt || null, preparandoAt: t.preparandoAt || null,
        listaAt: t.listaAt || null, servidoAt: t.servidoAt || null,
      };
    }),
    subtotal: tot.subtotal,
    iva: tot.iva,
    propina: tot.propina,
    propinaRate: propinaRate,
    propinaManual: typeof propinaMonto === 'number',
    total: tot.total,
    metodoPago: metodoPago,
    pagos: pagos,
    fecha: now,
  };
  await App.DB.put('cuentas', cuenta);

  // 3. Un movimiento de caja por cada pago (la caja ve cada método)
  for (var i = 0; i < pagos.length; i++) {
    await App.DB.put('movimientos', {
      id: App.Utils.uid('mov'),
      tipo: 'ingreso',
      monto: pagos[i].monto,
      concepto: 'Venta Mesa ' + (mesa ? mesa.numero : '?') + (pagos.length > 1 ? ' (' + (i + 1) + '/' + pagos.length + ')' : ''),
      metodoPago: pagos[i].metodo,
      cuentaId: cuenta.id,
      fecha: now,
    });
  }

  // 4. Liberar mesa
  await App.DB.update('mesas', mesaId, function (m) {
    if (m.comandaId && m.comandaId !== comandaId) return false;
    m.estado = 'libre';
    m.comandaId = null;
    m.mozoUid = null;
    m.mozoName = null;
  });

  App.Utils.toast('Cobrado: ' + App.Utils.formatCLP(tot.total) + ' ✅', 'success');
  App.Store.navigate('mesas');
}
