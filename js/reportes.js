// reportes.js — daily sales summary view
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.reportes = async function () {
  var today = App.Utils.todayStart();
  var allCuentas = await App.DB.getAll('cuentas');
  var cuentas = allCuentas.filter(function (c) { return c.fecha >= today; });

  var totalVentas = cuentas.reduce(function (t, c) { return t + c.total; }, 0);
  var totalPropinas = cuentas.reduce(function (t, c) { return t + (c.propina || 0); }, 0);
  var totalIva = cuentas.reduce(function (t, c) { return t + (c.iva || 0); }, 0);
  var numCuentas = cuentas.length;
  var ticketProm = numCuentas > 0 ? Math.round(totalVentas / numCuentas) : 0;

  // Sales by payment method
  var porMetodo = {};
  cuentas.forEach(function (c) {
    porMetodo[c.metodoPago] = (porMetodo[c.metodoPago] || 0) + c.total;
  });

  // Top products
  var productCount = {};
  cuentas.forEach(function (c) {
    (c.items || []).forEach(function (item) {
      if (!productCount[item.productoId || item.nombre]) {
        productCount[item.productoId || item.nombre] = { nombre: item.nombre, cantidad: 0, monto: 0 };
      }
      productCount[item.productoId || item.nombre].cantidad += item.cantidad;
      productCount[item.productoId || item.nombre].monto += item.cantidad * item.precio;
    });
  });
  var topProducts = Object.keys(productCount).map(function (k) { return productCount[k]; })
    .sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 8);

  // Stat cards
  var statHtml =
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="stat-label">Ventas de hoy</div>' +
    '<div class="stat-value primary">' + App.Utils.formatCLP(totalVentas) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Transacciones</div>' +
    '<div class="stat-value">' + numCuentas + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Ticket promedio</div>' +
    '<div class="stat-value info">' + App.Utils.formatCLP(ticketProm) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Propinas</div>' +
    '<div class="stat-value success">' + App.Utils.formatCLP(totalPropinas) + '</div></div>' +
    '</div>';

  // IVA card
  var ivaHtml =
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="stat-label">IVA incluido</div>' +
    '<div class="stat-value">' + App.Utils.formatCLP(totalIva) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Ventas netas</div>' +
    '<div class="stat-value">' + App.Utils.formatCLP(totalVentas - totalIva - totalPropinas) + '</div></div>' +
    '</div>';

  // Payment methods
  var metodoHtml = '<div class="mt-16"><div class="section-title mb-12">Por método de pago</div><div class="stat-grid">';
  if (Object.keys(porMetodo).length === 0) {
    metodoHtml += '<div class="stat-card" style="grid-column:1/-1"><div class="empty-state-text text-muted">Sin ventas hoy</div></div>';
  } else {
    var metodos = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📱 Transferencia' };
    Object.keys(porMetodo).forEach(function (metodo) {
      metodoHtml +=
        '<div class="stat-card"><div class="stat-label">' + (metodos[metodo] || metodo) + '</div>' +
        '<div class="stat-value">' + App.Utils.formatCLP(porMetodo[metodo]) + '</div></div>';
    });
  }
  metodoHtml += '</div></div>';

  // Top products
  var topHtml = '';
  if (topProducts.length > 0) {
    topHtml = '<div class="mt-16"><div class="section-title mb-12">Productos más vendidos</div><div class="top-list">';
    topProducts.forEach(function (p) {
      topHtml +=
        '<div class="top-item">' +
        '<div><div class="top-item-name">' + App.Utils.esc(p.nombre) + '</div>' +
        '<div class="top-item-meta">' + p.cantidad + ' unidades</div></div>' +
        '<div class="top-item-value">' + App.Utils.formatCLP(p.monto) + '</div>' +
        '</div>';
    });
    topHtml += '</div></div>';
  }

  return '<div class="view">' +
    '<div class="view-title">Reportes</div>' +
    '<div class="view-subtitle">Resumen de hoy · ' + App.Utils.formatDate(today) + '</div>' +
    statHtml + ivaHtml + metodoHtml + topHtml +
    '</div>';
};
