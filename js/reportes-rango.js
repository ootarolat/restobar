// reportes-rango.js — reporte de ventas por rango de fechas (solo admin).
// Aditivo: envuelve App.Views.reportes sin modificar reportes.js.
// Lee de la cache en memoria (App.DB.getAll('cuentas')): cero lecturas extra.
App.RepRango = (function () {
  var MAX_DIAS = 366;
  var U = function () { return App.Utils; };

  // ---------- fechas (hora local del dispositivo, DST-safe) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return key(d) === k ? d : null; // round trip: rechaza 2026-02-31
  }
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function mondayOf(d) { var w = (d.getDay() + 6) % 7; return addDays(d, -w); }
  function diasEntre(a, b) { // a<b, días calendario
    var n = 0, x = new Date(a.getTime());
    while (x < b && n < 100000) { x = addDays(x, 1); n++; }
    return n;
  }
  function hoy() { return startOfDay(new Date(App.Utils.todayStart())); }

  // Devuelve {desde, hasta} (Date, inclusivos) para un preset
  function presetRango(p) {
    var h = hoy();
    switch (p) {
      case 'hoy': return { desde: h, hasta: h };
      case 'ayer': var y = addDays(h, -1); return { desde: y, hasta: y };
      case '7d': return { desde: addDays(h, -6), hasta: h };
      case 'semana': return { desde: mondayOf(h), hasta: h };
      case 'semanaPas': var m = addDays(mondayOf(h), -7); return { desde: m, hasta: addDays(m, 6) };
      case 'mes': return { desde: new Date(h.getFullYear(), h.getMonth(), 1), hasta: h };
      case 'mesPas': return { desde: new Date(h.getFullYear(), h.getMonth() - 1, 1), hasta: new Date(h.getFullYear(), h.getMonth(), 0) };
      case '30d': return { desde: addDays(h, -29), hasta: h };
    }
    return null;
  }
  var PRESETS = [
    ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['semana', 'Esta semana'],
    ['semanaPas', 'Semana pasada'], ['mes', 'Este mes'], ['mesPas', 'Mes pasado'], ['30d', 'Últimos 30 días']
  ];

  // Resuelve params → {desde, hasta, preset, clamp}
  function resolver(params) {
    var r = null, preset = null, clamp = false;
    if (params.preset && presetRango(params.preset)) { preset = params.preset; r = presetRango(preset); }
    else {
      var d = parseKey(params.desde), h = parseKey(params.hasta);
      if (d && h) r = { desde: d, hasta: h };
    }
    if (!r) { preset = '7d'; r = presetRango('7d'); }
    var desde = r.desde, hasta = r.hasta;
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    if (diasEntre(desde, addDays(hasta, 1)) > MAX_DIAS) { desde = addDays(hasta, -(MAX_DIAS - 1)); clamp = true; }
    return { desde: desde, hasta: hasta, preset: preset, clamp: clamp };
  }

  // ---------- datos ----------
  // Único punto de lectura; cambiable a consulta bajo demanda en el futuro.
  async function cuentasEnRango(desdeTs, finExclTs) {
    var all = await App.DB.getAll('cuentas');
    return all.filter(function (c) { return c.fecha >= desdeTs && c.fecha < finExclTs; });
  }
  function suma(cs, f) { return cs.reduce(function (t, c) { return t + (f(c) || 0); }, 0); }
  function resumen(cs) {
    var total = suma(cs, function (c) { return c.total; });
    var prop = suma(cs, function (c) { return c.propina; });
    var iva = suma(cs, function (c) { return c.iva; });
    return { n: cs.length, total: total, propinas: prop, iva: iva, neto: total - iva - prop,
      ticket: cs.length ? Math.round(total / cs.length) : 0 };
  }
  function delta(act, prev) {
    if (!prev) return '<span class="rr-delta">sin datos previos</span>';
    var pct = Math.round((act - prev) / prev * 100);
    var cls = pct >= 0 ? 'rr-up' : 'rr-down';
    return '<span class="rr-delta ' + cls + '">' + (pct >= 0 ? '▲ +' : '▼ ') + pct + '%</span>';
  }

  // ---------- helpers de UI ----------
  function fmtCorto(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function tabsHtml(activa) {
    return '<div class="rr-presets">' +
      '<button class="cat-tab' + (activa === 'hoy' ? ' active' : '') + '" style="position:static" onclick="App.Actions.rrTab(\'hoy\')">Hoy</button>' +
      '<button class="cat-tab' + (activa === 'rango' ? ' active' : '') + '" style="position:static" onclick="App.Actions.rrTab(\'rango\')">Por fechas</button>' +
      '</div>';
  }
  function seccion(titulo, cuerpo) { return '<div class="mt-16"><div class="section-title mb-12">' + titulo + '</div>' + cuerpo + '</div>'; }
  function item(nombre, meta, valor, onclick) {
    return '<div class="top-item"' + (onclick ? ' style="cursor:pointer" onclick="' + onclick + '"' : '') + '>' +
      '<div><div class="top-item-name">' + nombre + '</div><div class="top-item-meta">' + meta + '</div></div>' +
      '<div class="top-item-value">' + U().formatCLP(valor) + '</div></div>';
  }

  // ---------- vista de rango ----------
  async function vistaRango(params) {
    var esc = U().esc, clp = U().formatCLP;
    var rg = resolver(params);
    if (rg.clamp) U().toast('Máximo ' + MAX_DIAS + ' días; se ajustó el inicio', 'info');
    var desde = rg.desde, hasta = rg.hasta;
    var fin = addDays(hasta, 1);
    var dias = diasEntre(desde, fin);
    var cs = await cuentasEnRango(desde.getTime(), fin.getTime());
    var prevDesde = addDays(desde, -dias);
    var prevCs = await cuentasEnRango(prevDesde.getTime(), desde.getTime());
    var R = resumen(cs), P = resumen(prevCs);

    // catálogo para resolver estación de cuentas antiguas
    var productos = await App.DB.getAll('productos');
    var categorias = await App.DB.getAll('categorias');
    var prodMap = {}, catMap = {};
    productos.forEach(function (p) { prodMap[p.id] = p; });
    categorias.forEach(function (c) { catMap[c.id] = c; });
    function areaItem(it) {
      if (it.area && App.Estaciones.exists(it.area)) return it.area;
      var p = it.productoId ? prodMap[it.productoId] : null;
      if (p) return App.Estaciones.areaDe(p, catMap[p.categoriaId]);
      return App.Estaciones.principal();
    }

    // controles
    var chips = '<div class="rr-presets">' + PRESETS.map(function (p) {
      return '<button class="cat-tab' + (rg.preset === p[0] ? ' active' : '') + '" style="position:static" onclick="App.Actions.rrPreset(\'' + p[0] + '\')">' + p[1] + '</button>';
    }).join('') + '</div>';
    var fechas = '<div class="rr-dates">' +
      '<input type="date" id="rr-desde" class="form-input" value="' + key(desde) + '">' +
      '<input type="date" id="rr-hasta" class="form-input" value="' + key(hasta) + '">' +
      '</div><button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="App.Actions.rrAplicar()">Aplicar</button>';

    var titulo = '<div class="rr-range-title">' + (dias === 1 ? fmtCorto(desde) : fmtCorto(desde) + ' – ' + fmtCorto(hasta) + ' · ' + dias + ' días') + '</div>';
    var cmpTxt = '<div class="text-muted text-sm" style="margin-bottom:8px">Comparado con ' +
      (dias === 1 ? fmtCorto(prevDesde) : fmtCorto(prevDesde) + ' – ' + fmtCorto(addDays(desde, -1))) + '</div>';

    var stats =
      '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-label">Ventas</div><div class="stat-value primary">' + clp(R.total) + '</div>' + delta(R.total, P.total) + '</div>' +
      '<div class="stat-card"><div class="stat-label">Transacciones</div><div class="stat-value">' + R.n + '</div>' + delta(R.n, P.n) + '</div>' +
      '<div class="stat-card"><div class="stat-label">Ticket promedio</div><div class="stat-value info">' + clp(R.ticket) + '</div>' + delta(R.ticket, P.ticket) + '</div>' +
      '<div class="stat-card"><div class="stat-label">Propinas</div><div class="stat-value success">' + clp(R.propinas) + '</div>' + delta(R.propinas, P.propinas) + '</div>' +
      '</div>' +
      '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-label">IVA incluido</div><div class="stat-value">' + clp(R.iva) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Ventas netas</div><div class="stat-value">' + clp(R.neto) + '</div></div>' +
      '</div>';

    // buckets (día ≤31 días, si no semana)
    var modoSemana = dias > 31;
    var buckets = [], bmap = {};
    if (dias > 1) {
      if (!modoSemana) {
        for (var x = new Date(desde.getTime()); x < fin; x = addDays(x, 1)) {
          var b = { k: key(x), ini: x, v: 0, n: 0 }; buckets.push(b); bmap[b.k] = b;
        }
      } else {
        for (var w = mondayOf(desde); w < fin; w = addDays(w, 7)) {
          var bw = { k: key(w), ini: w, v: 0, n: 0 }; buckets.push(bw); bmap[bw.k] = bw;
        }
      }
      cs.forEach(function (c) {
        var d = startOfDay(new Date(c.fecha));
        var bk = bmap[key(modoSemana ? mondayOf(d) : d)];
        if (bk) { bk.v += c.total || 0; bk.n += 1; }
      });
    }
    var chart = '';
    if (buckets.length > 1) {
      var max = Math.max.apply(null, buckets.map(function (b) { return b.v; }).concat([0]));
      var step = Math.ceil(buckets.length / 16);
      chart = seccion(modoSemana ? 'Ventas por semana' : 'Ventas por día',
        '<div class="inv-chart">' + buckets.map(function (b, i) {
          var h = max > 0 ? Math.max(2, Math.round(b.v / max * 100)) : 2;
          var lbl = i % step === 0 ? (modoSemana ? pad(b.ini.getDate()) + '/' + pad(b.ini.getMonth() + 1) : b.ini.getDate()) : '&nbsp;';
          return '<div class="inv-bar-col" style="cursor:pointer" title="' + fmtCorto(b.ini) + ': ' + clp(b.v) + '" onclick="App.Actions.' + (modoSemana ? "rrSemana('" : "rrDia('") + b.k + '\')">' +
            '<div class="inv-bar' + (b.v ? '' : ' inv-bar-empty') + '" style="height:' + h + '%"></div>' +
            '<div class="inv-bar-label">' + lbl + '</div></div>';
        }).join('') + '</div>');
    }

    // lista
    var lista = '';
    if (dias > 1) {
      var conVentas = buckets.filter(function (b) { return b.n > 0; });
      if (conVentas.length) {
        lista = seccion(modoSemana ? 'Detalle por semana' : 'Detalle por día', '<div class="top-list">' + conVentas.map(function (b) {
          var nom = modoSemana ? 'Semana del ' + fmtCorto(b.ini) : fmtCorto(b.ini);
          return item(nom, b.n + (b.n === 1 ? ' cuenta' : ' cuentas'), b.v, "App.Actions." + (modoSemana ? 'rrSemana' : 'rrDia') + "('" + b.k + "')");
        }).join('') + '</div>');
      }
    } else if (cs.length) {
      var ord = cs.slice().sort(function (a, b) { return b.fecha - a.fecha; });
      var extra = ord.length > 150 ? '<div class="text-muted text-sm">Mostrando las últimas 150 de ' + ord.length + '</div>' : '';
      lista = seccion('Ventas del día', '<div class="top-list">' + ord.slice(0, 150).map(function (c) {
        return item('Mesa ' + (c.mesaNumero || '?') + ' · ' + U().formatTime(c.fecha),
          '👤 ' + esc(c.mozoName || 'Sin asignar') + ' · ' + esc(c.metodoPago || ''), c.total || 0,
          "App.Actions.rrVenta('" + esc(c.id) + "')");
      }).join('') + '</div>' + extra);
    }

    // método de pago
    var porMetodo = {};
    cs.forEach(function (c) {
      var pagos = c.pagos && c.pagos.length ? c.pagos : [{ metodo: c.metodoPago, monto: c.total }];
      pagos.forEach(function (p) { porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + (p.monto || 0); });
    });
    var etq = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📱 Transferencia', mixto: '🔀 Mixto' };
    var metodoHtml = seccion('Por método de pago', '<div class="stat-grid">' + (Object.keys(porMetodo).length
      ? Object.keys(porMetodo).map(function (m) {
        return '<div class="stat-card"><div class="stat-label">' + esc(etq[m] || m || 'Otro') + '</div><div class="stat-value">' + clp(porMetodo[m]) + '</div></div>';
      }).join('')
      : '<div class="stat-card" style="grid-column:1/-1"><div class="empty-state-text text-muted">Sin ventas en el período</div></div>') + '</div>');

    // estación + tiempos
    var porArea = {}, tiempos = {};
    cs.forEach(function (c) {
      (c.items || []).forEach(function (it) {
        var a = areaItem(it);
        if (!porArea[a]) porArea[a] = { monto: 0, unidades: 0 };
        porArea[a].monto += it.cantidad * it.precio; porArea[a].unidades += it.cantidad;
      });
      (c.tiempos || []).forEach(function (t) {
        if (t.directa || !t.enviadaAt || !t.listaAt) return;
        var a = App.Estaciones.normalizar(t.area);
        if (!tiempos[a]) tiempos[a] = { total: 0, n: 0, max: 0 };
        var mins = (t.listaAt - t.enviadaAt) / 60000;
        tiempos[a].total += mins; tiempos[a].n += 1; tiempos[a].max = Math.max(tiempos[a].max, mins);
      });
    });
    var areas = App.Estaciones.ids().filter(function (a) { return porArea[a] || tiempos[a]; });
    var areaHtml = areas.length ? seccion('Por estación', '<div class="top-list">' + areas.map(function (a) {
      var v = porArea[a] || { monto: 0, unidades: 0 }, t = tiempos[a];
      var tTxt = t && t.n ? ' · ⏱ prom. ' + Math.round(t.total / t.n) + ' min (máx ' + Math.round(t.max) + ')' : '';
      return item(App.Estaciones.label(a), v.unidades + ' unidades' + tTxt, v.monto);
    }).join('') + '</div>') : '';

    // mozo
    var porMozo = {};
    cs.forEach(function (c) {
      var k = c.mozoName || 'Sin asignar';
      if (!porMozo[k]) porMozo[k] = { nombre: k, monto: 0, cuentas: 0, propinas: 0 };
      porMozo[k].monto += c.total || 0; porMozo[k].propinas += c.propina || 0; porMozo[k].cuentas += 1;
    });
    var mozos = Object.keys(porMozo).map(function (k) { return porMozo[k]; }).sort(function (a, b) { return b.monto - a.monto; });
    var mozoHtml = mozos.length ? seccion('Ventas por mozo', '<div class="top-list">' + mozos.map(function (m) {
      return item('👤 ' + esc(m.nombre), m.cuentas + (m.cuentas === 1 ? ' cuenta' : ' cuentas') + ' · propinas ' + clp(m.propinas), m.monto);
    }).join('') + '</div>') : '';

    // top productos
    var pc = {};
    cs.forEach(function (c) {
      (c.items || []).forEach(function (it) {
        var k = it.productoId || it.nombre;
        if (!pc[k]) pc[k] = { nombre: it.nombre, cantidad: 0, monto: 0 };
        pc[k].cantidad += it.cantidad; pc[k].monto += it.cantidad * it.precio;
      });
    });
    var top = Object.keys(pc).map(function (k) { return pc[k]; }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 10);
    var topHtml = top.length ? seccion('Productos más vendidos', '<div class="top-list">' + top.map(function (p) {
      return item(esc(p.nombre), p.cantidad + ' unidades', p.monto);
    }).join('') + '</div>') : '';

    // anulaciones
    var anul = [];
    cs.forEach(function (c) { (c.anulados || []).forEach(function (a) { anul.push(Object.assign({ mesa: c.mesaNumero }, a)); }); });
    var anulHtml = '';
    if (anul.length) {
      var montoA = anul.reduce(function (t, a) { return t + a.cantidad * a.precio; }, 0);
      anulHtml = seccion('Anulaciones (' + anul.length + ' · ' + clp(montoA) + ')', '<div class="top-list">' +
        anul.slice(0, 20).map(function (a) {
          return item('🚫 ' + a.cantidad + 'x ' + esc(a.nombre),
            'Mesa ' + (a.mesa || '?') + ' · ' + esc(a.motivo || 'sin motivo') + (a.por ? ' · ' + esc(a.por) : ''), a.cantidad * a.precio);
        }).join('') + (anul.length > 20 ? '<div class="text-muted text-sm">+' + (anul.length - 20) + ' más</div>' : '') + '</div>');
    }

    return '<div class="view"><div class="view-title">Reportes</div>' + tabsHtml('rango') +
      chips + fechas + titulo + cmpTxt + stats + chart + lista + metodoHtml + areaHtml + mozoHtml + topHtml + anulHtml + '</div>';
  }

  // ---------- envoltura de la vista original ----------
  var original = App.Views.reportes;
  if (!original || original.__rr) return { cuentasEnRango: cuentasEnRango, resolver: resolver };
  var MARK = '<div class="view">';
  var wrapper = async function () {
    var st = App.Store.state;
    var esAdm = st.userRole === 'admin';
    if (!esAdm) return '<div class="view"><div class="view-title">Reportes</div><div class="text-muted">Solo disponible para administradores.</div></div>';
    var params = st.params || {};
    if (params.rep === 'rango') {
      try { return await vistaRango(params); }
      catch (e) { console.error('Reporte por fechas', e); U().toast('No se pudo cargar el reporte por fechas', 'error'); }
    }
    var html = await original.apply(this, arguments);
    if (typeof html === 'string' && html.indexOf(MARK) === 0) {
      return MARK + tabsHtml('hoy') + html.slice(MARK.length);
    }
    return html;
  };
  wrapper.__rr = true;
  App.Views.reportes = wrapper;

  // ---------- acciones ----------
  function ir(p) { App.Store.navigate('reportes', Object.assign({ rep: 'rango' }, p)); }
  App.Actions = App.Actions || {};
  App.Actions.rrTab = function (t) { if (t === 'rango') ir({ preset: '7d' }); else App.Store.navigate('reportes', {}); };
  App.Actions.rrPreset = function (p) { ir({ preset: p }); };
  App.Actions.rrAplicar = function () {
    var d = document.getElementById('rr-desde'), h = document.getElementById('rr-hasta');
    if (!d || !h || !parseKey(d.value) || !parseKey(h.value)) { U().toast('Selecciona ambas fechas', 'error'); return; }
    ir({ desde: d.value, hasta: h.value });
  };
  App.Actions.rrDia = function (k) { ir({ desde: k, hasta: k }); };
  App.Actions.rrSemana = function (k) {
    var rg = resolver(App.Store.state.params || {});
    var ini = parseKey(k); if (!ini) return;
    var fin = addDays(ini, 6);
    if (ini < rg.desde) ini = rg.desde;
    if (fin > rg.hasta) fin = rg.hasta;
    ir({ desde: key(ini), hasta: key(fin) });
  };
  App.Actions.rrVenta = async function (id) {
    await App.Actions.verCuentaCerrada(id);
    // el botón original vuelve a "Cerradas hoy"; aquí solo cierra el modal
    var f = document.querySelector('#modal-container .modal-footer button');
    if (f) { f.textContent = '‹ Volver'; f.setAttribute('onclick', 'App.Utils.closeModal()'); }
  };

  return { cuentasEnRango: cuentasEnRango, resolver: resolver };
})();
