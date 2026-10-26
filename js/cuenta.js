// cuenta.js — billing view and payment actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.cuenta = async function (params) {
  var comanda = await App.DB.get('comandas', params.comandaId);
  if (!comanda) {
    App.Utils.toast('Comanda no encontrada', 'error');
    App.Store.navigate('mesas');
    return '';
  }

  if (!comanda.items || comanda.items.length === 0) {
    return '<div class="view"><div class="empty-state">' +
      '<div class="empty-state-icon">🧾</div>' +
      '<div class="empty-state-text">No hay items en la comanda</div>' +
      '<button class="btn btn-primary mt-16" onclick="App.Actions.volverMesas()">Volver a mesas</button>' +
      '</div></div>';
  }

  var settings = App.Store.state.settings;
  var propinaRate = params.propinaRate !== undefined ? params.propinaRate : (settings.propinaEnabled ? settings.propinaDefault : 0);
  var metodoPago = params.metodoPago || 'efectivo';
  var mesa = await App.DB.get('mesas', params.mesaId);

  var subtotal = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
  var ivaIncluido = settings.preciosIncluyenIva !== false;
  var iva = ivaIncluido ? Math.round(subtotal * settings.ivaRate / (100 + settings.ivaRate)) : Math.round(subtotal * settings.ivaRate / 100);
  var propina = Math.round(subtotal * propinaRate / 100);
  var total = ivaIncluido ? subtotal + propina : subtotal + iva + propina;

  // Items
  var itemsHtml = '<div class="order-items">';
  comanda.items.forEach(function (item) {
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

  // Totals
  var totalsHtml =
    '<div class="totals">' +
    '<div class="total-row"><span class="label">Subtotal</span><span class="value">' + App.Utils.formatCLP(subtotal) + '</span></div>' +
    '<div class="total-row"><span class="label">IVA ' + (ivaIncluido ? 'incluido ' : '') + '(' + settings.ivaRate + '%)</span><span class="value">' + App.Utils.formatCLP(iva) + '</span></div>' +
    (propina > 0 ? '<div class="total-row"><span class="label">Propina (' + propinaRate + '%)</span><span class="value">' + App.Utils.formatCLP(propina) + '</span></div>' : '') +
    '<div class="total-row grand-total"><span class="label">Total</span><span class="value">' + App.Utils.formatCLP(total) + '</span></div>' +
    '</div>';

  // Propina section
  var propinaHtml = '';
  if (settings.propinaEnabled) {
    propinaHtml =
      '<div class="propina-section">' +
      '<div class="form-label">Propina (' + propinaRate + '%)</div>' +
      '<div class="propina-buttons">' +
      '<button class="propina-btn ' + (propinaRate === 0 ? 'active' : '') + '" onclick="App.Actions.setPropina(0)">Sin</button>' +
      '<button class="propina-btn ' + (propinaRate === 10 ? 'active' : '') + '" onclick="App.Actions.setPropina(10)">10%</button>' +
      '<button class="propina-btn ' + (propinaRate === 15 ? 'active' : '') + '" onclick="App.Actions.setPropina(15)">15%</button>' +
      '</div>' +
      '</div>';
  }

  // Payment methods
  var paymentHtml =
    '<div class="form-label">Método de pago</div>' +
    '<div class="payment-methods">' +
    '<div class="payment-method ' + (metodoPago === 'efectivo' ? 'active' : '') + '" onclick="App.Actions.setMetodoPago(\'efectivo\')">' +
    '<span class="payment-method-icon">💵</span>Efectivo</div>' +
    '<div class="payment-method ' + (metodoPago === 'tarjeta' ? 'active' : '') + '" onclick="App.Actions.setMetodoPago(\'tarjeta\')">' +
    '<span class="payment-method-icon">💳</span>Tarjeta</div>' +
    '<div class="payment-method ' + (metodoPago === 'transferencia' ? 'active' : '') + '" onclick="App.Actions.setMetodoPago(\'transferencia\')">' +
    '<span class="payment-method-icon">📱</span>Transfer.</div>' +
    '</div>';

  // Action button
  var actionBtn =
    '<button class="btn btn-success btn-block btn-lg" onclick="App.Actions.cobrar(\'' + params.comandaId + '\',\'' + params.mesaId + '\',\'' + metodoPago + '\',' + propinaRate + ')">' +
    'Cobrar ' + App.Utils.formatCLP(total) + '</button>';

  return '<div class="view">' +
    '<div class="section-header"><span class="section-title">Mesa ' + (mesa ? mesa.numero : '?') + '</span>' +
    '<span class="badge badge-enviada">Cobro</span></div>' +
    itemsHtml + totalsHtml + propinaHtml + paymentHtml +
    '<div class="mt-16">' + actionBtn + '</div>' +
    '</div>';
};

App.Actions.setPropina = function (rate) {
  var params = Object.assign({}, App.Store.state.params, { propinaRate: rate });
  App.Store.setState({ params: params });
};

App.Actions.setMetodoPago = function (method) {
  var params = Object.assign({}, App.Store.state.params, { metodoPago: method });
  App.Store.setState({ params: params });
};

App.Actions.cobrar = async function (comandaId, mesaId, metodoPago, propinaRate) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || comanda.items.length === 0) return;

  var settings = App.Store.state.settings;
  var subtotal = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
  var ivaIncluido = settings.preciosIncluyenIva !== false;
  var iva = ivaIncluido ? Math.round(subtotal * settings.ivaRate / (100 + settings.ivaRate)) : Math.round(subtotal * settings.ivaRate / 100);
  var propina = Math.round(subtotal * propinaRate / 100);
  var total = ivaIncluido ? subtotal + propina : subtotal + iva + propina;
  var now = Date.now();
  var mesa = await App.DB.get('mesas', mesaId);

  // Create cuenta (bill record)
  var cuenta = {
    id: App.Utils.uid('cue'),
    comandaId: comanda.id,
    mesaId: mesaId,
    mesaNumero: mesa ? mesa.numero : null,
    items: comanda.items.map(function (i) {
      return { nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, notas: i.notas };
    }),
    subtotal: subtotal,
    iva: iva,
    propina: propina,
    propinaRate: propinaRate,
    total: total,
    metodoPago: metodoPago,
    fecha: now,
  };
  await App.DB.put('cuentas', cuenta);

  // Create movimiento de caja
  var movimiento = {
    id: App.Utils.uid('mov'),
    tipo: 'ingreso',
    monto: total,
    concepto: 'Venta Mesa ' + (mesa ? mesa.numero : '?'),
    metodoPago: metodoPago,
    cuentaId: cuenta.id,
    fecha: now,
  };
  await App.DB.put('movimientos', movimiento);

  // Close comanda and free table
  comanda.estado = 'cerrada';
  await App.DB.put('comandas', comanda);
  mesa.estado = 'libre';
  mesa.comandaId = null;
  await App.DB.put('mesas', mesa);

  App.Utils.toast('Cobrado: ' + App.Utils.formatCLP(total) + ' ✅', 'success');
  App.Store.navigate('mesas');
};
