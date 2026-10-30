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

  // Sales by payment method (pagos divididos cuentan en cada método)
  var porMetodo = {};
  cuentas.forEach(function (c) {
    var pagos = c.pagos && c.pagos.length ? c.pagos : [{ metodo: c.metodoPago, monto: c.total }];
    pagos.forEach(function (p) {
      porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto;
    });
  });

  // Ventas por estación (área). Cuentas antiguas sin área → se resuelve
  // por el producto actual; si no existe, la estación principal.
  var productos = await App.DB.getAll('productos');
  var categorias = await App.DB.getAll('categorias');
  var prodMap = {}, catMap = {};
  productos.forEach(function (p) { prodMap[p.id] = p; });
  categorias.forEach(function (c) { catMap[c.id] = c; });
  function areaItem(item) {
    if (item.area && App.Estaciones.exists(item.area)) return item.area;
    var p = item.productoId ? prodMap[item.productoId] : null;
    if (p) return App.Estaciones.areaDe(p, catMap[p.categoriaId]);
    return App.Estaciones.principal();
  }
  var porArea = {};
  cuentas.forEach(function (c) {
    (c.items || []).forEach(function (item) {
      var a = areaItem(item);
      if (!porArea[a]) porArea[a] = { monto: 0, unidades: 0 };
      porArea[a].monto += item.cantidad * item.precio;
      porArea[a].unidades += item.cantidad;
    });
  });

  // Tiempos promedio por estación (envío → listo), sin despacho directo
  var tiempos = {};
  cuentas.forEach(function (c) {
    (c.tiempos || []).forEach(function (t) {
      if (t.directa || !t.enviadaAt || !t.listaAt) return;
      var a = App.Estaciones.normalizar(t.area);
      if (!tiempos[a]) tiempos[a] = { total: 0, n: 0, max: 0 };
      var mins = (t.listaAt - t.enviadaAt) / 60000;
      tiempos[a].total += mins;
      tiempos[a].n += 1;
      tiempos[a].max = Math.max(tiempos[a].max, mins);
    });
  });

  // Anulaciones del día
  var anulados = [];
  cuentas.forEach(function (c) {
    (c.anulados || []).forEach(function (a) { anulados.push(Object.assign({ mesa: c.mesaNumero }, a)); });
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
    var metodos = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📱 Transferencia', mixto: '🔀 Mixto' };
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

  // Sales by waiter (mozo)
  var porMozo = {};
  cuentas.forEach(function (c) {
    var key = c.mozoName || 'Sin asignar';
    if (!porMozo[key]) porMozo[key] = { nombre: key, monto: 0, cuentas: 0, propinas: 0 };
    porMozo[key].monto += c.total;
    porMozo[key].propinas += (c.propina || 0);
    porMozo[key].cuentas += 1;
  });
  var mozos = Object.keys(porMozo).map(function (k) { return porMozo[k]; })
    .sort(function (a, b) { return b.monto - a.monto; });

  var mozoHtml = '';
  if (mozos.length > 0) {
    mozoHtml = '<div class="mt-16"><div class="section-title mb-12">Ventas por mozo</div><div class="top-list">';
    mozos.forEach(function (m) {
      mozoHtml +=
        '<div class="top-item">' +
        '<div><div class="top-item-name">👤 ' + App.Utils.esc(m.nombre) + '</div>' +
        '<div class="top-item-meta">' + m.cuentas + (m.cuentas === 1 ? ' cuenta' : ' cuentas') +
        ' · propinas ' + App.Utils.formatCLP(m.propinas) + '</div></div>' +
        '<div class="top-item-value">' + App.Utils.formatCLP(m.monto) + '</div>' +
        '</div>';
    });
    mozoHtml += '</div></div>';
  }

  // Por estación: ventas + tiempo promedio de preparación
  var areaHtml = '';
  var areasConDatos = App.Estaciones.ids().filter(function (a) { return porArea[a] || tiempos[a]; });
  if (areasConDatos.length > 0) {
    areaHtml = '<div class="mt-16"><div class="section-title mb-12">Por estación</div><div class="top-list">';
    areasConDatos.forEach(function (a) {
      var v = porArea[a] || { monto: 0, unidades: 0 };
      var t = tiempos[a];
      var tTxt = t && t.n ? ' · ⏱ prom. ' + Math.round(t.total / t.n) + ' min (máx ' + Math.round(t.max) + ')' : '';
      areaHtml +=
        '<div class="top-item">' +
        '<div><div class="top-item-name">' + App.Estaciones.label(a) + '</div>' +
        '<div class="top-item-meta">' + v.unidades + ' unidades' + tTxt + '</div></div>' +
        '<div class="top-item-value">' + App.Utils.formatCLP(v.monto) + '</div>' +
        '</div>';
    });
    areaHtml += '</div></div>';
  }

  var anuladosHtml = '';
  if (anulados.length > 0) {
    var montoAnulado = anulados.reduce(function (t, a) { return t + a.cantidad * a.precio; }, 0);
    anuladosHtml = '<div class="mt-16"><div class="section-title mb-12">Anulaciones (' + anulados.length + ' · ' +
      App.Utils.formatCLP(montoAnulado) + ')</div><div class="top-list">';
    anulados.forEach(function (a) {
      anuladosHtml +=
        '<div class="top-item">' +
        '<div><div class="top-item-name">🚫 ' + a.cantidad + 'x ' + App.Utils.esc(a.nombre) + '</div>' +
        '<div class="top-item-meta">Mesa ' + (a.mesa || '?') + ' · ' + App.Utils.esc(a.motivo || 'sin motivo') +
        (a.por ? ' · ' + App.Utils.esc(a.por) : '') + '</div></div>' +
        '<div class="top-item-value">' + App.Utils.formatCLP(a.cantidad * a.precio) + '</div>' +
        '</div>';
    });
    anuladosHtml += '</div></div>';
  }

  return '<div class="view">' +
    '<div class="view-title">Reportes</div>' +
    '<div class="view-subtitle">Resumen de hoy · ' + App.Utils.formatDate(today) + '</div>' +
    statHtml + ivaHtml + metodoHtml + areaHtml + mozoHtml + topHtml + anuladosHtml +
    '</div>';
};
