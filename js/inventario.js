// inventario.js — gestión de inventario y presupuesto de stock (solo admin).
//
// Modelo (Firestore):
//  insumos/{id}:    nombre, categoria, unidad ('u'|'g'|'ml'), compraNombre,
//                   compraFactor (unidades base por unidad de compra), stock,
//                   stockMin, stockObjetivo (todo en unidad base), costo
//                   (CLP por unidad base, promedio ponderado), diasReposicion,
//                   inicializado (true tras la primera compra o conteo).
//  recetas/{productoId}: { productoId, lineas: [{ insumoId, cantidad }] }
//                   (colección propia: "Restaurar carta" no las borra).
//  inventario/{id}: movimientos: compra | merma | conteo. Se sincronizan
//                   solo los últimos 45 días (ver db.js).
//
// El stock cambia por compras, mermas y conteos. El CONSUMO de cada día se
// obtiene del conteo al cerrar la jornada (esperado − contado). De ahí salen
// las tendencias. Los insumos "sin control" (nunca comprados ni contados) no
// bloquean productos ni generan alertas.
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Inv = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const CATEGORIAS = ['Empanadas', 'Papas', 'Proteínas', 'Bebidas', 'Pulpas', 'Cervezas', 'Vinos', 'Licores', 'Café'];
  const UNIDADES = { u: 'unidades', g: 'gramos', ml: 'ml' };
  const NIVELES = {
    agotado:   { label: 'Agotado',     icon: '⚫', rank: 4 },
    critico:   { label: 'Crítico',     icon: '🔴', rank: 3 },
    bajo:      { label: 'Bajo',        icon: '🟡', rank: 2 },
    ok:        { label: 'OK',          icon: '🟢', rank: 1 },
    sincontrol:{ label: 'Sin control', icon: '⚪', rank: 0 },
  };
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // ===== Insumos y recetas sugeridos (se cargan con un botón, editables) =====
  function ins(id, nombre, categoria, unidad, compraNombre, compraFactor) {
    return { id: id, nombre: nombre, categoria: categoria, unidad: unidad, compraNombre: compraNombre,
      compraFactor: compraFactor, stock: 0, stockMin: 0, stockObjetivo: 0, costo: 0,
      diasReposicion: 2, inicializado: false };
  }
  const SUGERIDOS = [
    ins('ins-emp-queso', 'Empanada Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-camaron', 'Empanada Camarón Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-carapacho', 'Empanada Carapacho Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-macha', 'Empanada Macha Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-mechada', 'Empanada Mechada Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-papas', 'Papas congeladas', 'Papas', 'g', 'bolsa 2,5 kg', 2500),
    ins('ins-carne', 'Carne', 'Proteínas', 'g', 'kg', 1000),
    ins('ins-pollo', 'Pollo', 'Proteínas', 'g', 'kg', 1000),
    ins('ins-pescado', 'Pescado', 'Proteínas', 'g', 'kg', 1000),
    ins('ins-coca', 'Coca Cola (lata)', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-fanta', 'Fanta (lata)', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-sprite', 'Sprite (lata)', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-pulpa-frambuesa', 'Pulpa Frambuesa', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-frutilla', 'Pulpa Frutilla', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-mango', 'Pulpa Mango', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-maracuya', 'Pulpa Maracuyá', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-pina', 'Pulpa Piña', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-cerv-lata', 'Cerveza Lata', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-heineken', 'Cerveza Litro Heineken', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-royal', 'Cerveza Litro Royal', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-corona', 'Cerveza Corona', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-cristal', 'Cerveza Cristal', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-kunstmann', 'Cerveza Kunstmann', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-vino-casillero', 'Vino Casillero del Diablo', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-oveja', 'Vino Oveja Negra', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-viento', 'Vino Viento del Sur', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-blanco', 'Vino Blanco', 'Vinos', 'u', 'botella', 1),
    ins('ins-ron', 'Ron', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-pisco', 'Pisco', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-whiskey', 'Whiskey (Jack Daniel\'s)', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-whisky', 'Whisky (Johnnie Walker)', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-cafe-grano', 'Café en grano', 'Café', 'g', 'kg', 1000),
    ins('ins-cafe-instantaneo', 'Café instantáneo', 'Café', 'g', 'frasco 170 g', 170),
  ];
  // productoId → [[insumoId, cantidad en unidad base], ...]
  const PULPA = 100; // g de pulpa por jugo o mojito (a confirmar)
  const RECETAS = {
    p105: [['ins-emp-queso', 1]], p106: [['ins-emp-camaron', 1]], p107: [['ins-emp-carapacho', 1]],
    p108: [['ins-emp-macha', 1]], p109: [['ins-emp-mechada', 1]],
    p110: [['ins-papas', 500]], p505: [['ins-papas', 250]],
    p507: [['ins-papas', 700]], p508: [['ins-papas', 700]],
    p501: [['ins-carne', 200]], p502: [['ins-pollo', 200]], p503: [['ins-pescado', 200]],
    p703: [['ins-coca', 1]], p704: [['ins-fanta', 1]], p705: [['ins-sprite', 1]],
    p706: [['ins-pulpa-frambuesa', PULPA]], p707: [['ins-pulpa-frutilla', PULPA]], p708: [['ins-pulpa-mango', PULPA]],
    p709: [['ins-pulpa-maracuya', PULPA]], p710: [['ins-pulpa-pina', PULPA]],
    p802: [['ins-cerv-lata', 1]], p803: [['ins-cerv-heineken', 1]], p804: [['ins-cerv-royal', 1]],
    p805: [['ins-cerv-corona', 1]], p806: [['ins-cerv-cristal', 1]], p807: [['ins-cerv-kunstmann', 1]],
    p901: [['ins-vino-blanco', 1]], p902: [['ins-vino-casillero', 1]], p903: [['ins-vino-oveja', 1]], p904: [['ins-vino-viento', 1]],
    p1001: [['ins-ron', 90], ['ins-pulpa-frambuesa', PULPA]], p1002: [['ins-ron', 90], ['ins-pulpa-frutilla', PULPA]],
    p1003: [['ins-ron', 90], ['ins-pulpa-mango', PULPA]], p1004: [['ins-ron', 90], ['ins-pulpa-maracuya', PULPA]],
    p1005: [['ins-ron', 90], ['ins-pulpa-pina', PULPA]],
    p1006: [['ins-pisco', 90]], p1007: [['ins-pisco', 90]],
    p1009: [['ins-whiskey', 90]], p1010: [['ins-whisky', 90]],
    p1101: [['ins-cafe-grano', 20]], p1102: [['ins-cafe-grano', 20]], p1103: [['ins-cafe-grano', 20]],
  };

  // ===== Utilidades =====
  function esc(s) { return App.Utils.esc(s); }
  function clp(n) { return App.Utils.formatCLP(n || 0); }
  function esAdmin() { var u = App.Auth.getCurrentUser(); return !!(u && u.role === 'admin'); }
  function num(v) {
    var n = parseFloat(String(v == null ? '' : v).trim().replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }
  function fmtNum(n, dec) {
    return (Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec)).toLocaleString('es-CL', { maximumFractionDigits: dec });
  }
  function factor(i) { return Number(i.compraFactor) > 0 ? Number(i.compraFactor) : 1; }
  function plural(nombre, n) {
    if (Math.abs(n - 1) < 1e-9) return nombre;
    var p = nombre.split(' ');
    var w = p[0];
    if (/^(kg|ml|g)$/i.test(w)) return nombre;
    p[0] = /[aeiou]$/i.test(w) ? w + 's' : w + 'es';
    return p.join(' ');
  }
  // Cantidad en unidad base → texto en unidad de compra (ej. "3,5 botellas")
  function fmtCant(i, base) {
    var f = factor(i);
    if (i.unidad === 'u' && f === 1 && (!i.compraNombre || i.compraNombre === 'unidad')) return fmtNum(base, 2) + ' u';
    var v = base / f;
    return fmtNum(v, 2) + ' ' + plural(i.compraNombre || 'unidad', v);
  }
  // Valor para un <input type=number> en unidad de compra (punto decimal)
  function enCompra(base, f) { return String(Math.round(base / f * 100) / 100); }
  function fmtBase(i, base) { return fmtNum(base, 0) + ' ' + (i.unidad === 'u' ? 'u' : i.unidad); }
  function dayKey(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function errorMsg(e) {
    if (e && e.code === 'permission-denied') return 'Sin permiso. Publica las reglas de Firestore actualizadas (inventario).';
    return 'Error: ' + (e && e.message ? e.message : e);
  }
  async function safe(fn) {
    try { return await fn(); } catch (e) { console.error(e); App.Utils.toast(errorMsg(e), 'error'); return null; }
  }
  function userName() { var u = App.Auth.getCurrentUser(); return u ? u.name : null; }

  async function datos() {
    var insumos = await App.DB.getAll('insumos');
    var movs = await App.DB.getAll('inventario');
    var recetas = await App.DB.getAll('recetas');
    var productos = await App.DB.getAll('productos');
    var map = {};
    insumos.forEach(function (i) { map[i.id] = i; });
    return { insumos: insumos, movs: movs, recetas: recetas, productos: productos, map: map };
  }

  // ===== Indicadores por insumo =====
  function stats(i, movs) {
    var T = dayKey(Date.now());
    var ms = movs.filter(function (m) { return m.insumoId === i.id; });
    // Consumo por día (de los conteos que no son el inicial)
    var porDia = {};
    var stockConteos30 = [];
    ms.forEach(function (m) {
      if (m.tipo !== 'conteo' || m.inicial) return;
      var d = dayKey(m.fecha);
      porDia[d] = (porDia[d] || 0) + (m.consumo || 0);
      if (d > T - 30 * DAY) stockConteos30.push(m.stockResultante || 0);
    });
    function prom(desde, hasta) { // días [T-hasta+1 .. T-desde]
      var suma = 0, n = 0;
      Object.keys(porDia).forEach(function (k) {
        var d = Number(k);
        if (d > T - hasta * DAY && d <= T - desde * DAY) { suma += porDia[k]; n++; }
      });
      return n ? { prom: suma / n, total: suma, dias: n } : null;
    }
    var p7 = prom(0, 7), pPrev = prom(7, 14), p30 = prom(0, 30);
    var diario = p7 ? p7.prom : (p30 ? p30.prom : null);
    var tendencia = (p7 && pPrev && pPrev.prom > 0) ? (p7.prom - pPrev.prom) / pPrev.prom : null;
    var cobertura = diario && diario > 0 ? (i.stock || 0) / diario : null;
    var merma30 = ms.filter(function (m) { return m.tipo === 'merma' && m.fecha > T - 29 * DAY; })
      .reduce(function (t, m) { return t + Math.abs(m.cantidad || 0); }, 0);
    var consumo30 = p30 ? p30.total : 0;
    var mermaPct = (consumo30 + merma30) > 0 ? merma30 / (consumo30 + merma30) : null;
    var stockProm = stockConteos30.length
      ? stockConteos30.reduce(function (t, v) { return t + v; }, 0) / stockConteos30.length
      : (i.stock || 0);
    var rotacion = stockProm > 0 && consumo30 > 0 ? consumo30 / stockProm : null;
    var serie = [];
    for (var k = 13; k >= 0; k--) {
      var d = T - k * DAY;
      serie.push({ d: d, v: porDia[d] || 0, operado: porDia[d] !== undefined });
    }
    var costo = Number(i.costo) || 0;
    var stock = Number(i.stock) || 0;
    var faltante = Math.max(0, (Number(i.stockObjetivo) || 0) - stock);
    return {
      diario: diario, d7: p7 ? p7.prom : null, d30: p30 ? p30.prom : null,
      tendencia: tendencia, cobertura: cobertura, merma30: merma30, consumo30: consumo30,
      mermaPct: mermaPct, rotacion: rotacion, serie: serie,
      valor: stock * costo,
      reposicion: faltante * costo,
      compraUnidades: Math.ceil(faltante / factor(i) - 1e-9),
      ultimos: ms.slice().sort(function (a, b) { return b.fecha - a.fecha; }).slice(0, 15),
    };
  }

  function nivel(i, st) {
    if (!i.inicializado) return 'sincontrol';
    var stock = Number(i.stock) || 0;
    var min = Number(i.stockMin) || 0;
    if (stock <= 0) return 'agotado';
    if ((min > 0 && stock <= min / 2) || (st.cobertura != null && st.cobertura < 1)) return 'critico';
    if ((min > 0 && stock <= min) || (st.cobertura != null && st.cobertura <= (Number(i.diasReposicion) || 2))) return 'bajo';
    return 'ok';
  }
  function enAlerta(nv) { return nv === 'bajo' || nv === 'critico' || nv === 'agotado'; }

  async function analisis() {
    var D = await datos();
    var filas = D.insumos.map(function (i) {
      var st = stats(i, D.movs);
      return { i: i, st: st, nivel: nivel(i, st) };
    });
    var tot = filas.reduce(function (t, f) {
      t.valor += f.st.valor; t.reposicion += f.st.reposicion;
      if (enAlerta(f.nivel)) t.alerta++;
      if (f.nivel === 'agotado') t.agotados++;
      return t;
    }, { valor: 0, reposicion: 0, alerta: 0, agotados: 0 });
    return { D: D, filas: filas, tot: tot };
  }

  // ===== Bloqueo de productos sin stock =====
  // Devuelve { productoId: ['Pisco', ...] } con los insumos que faltan.
  async function bloqueos() {
    var recetas = await App.DB.getAll('recetas');
    var insumos = await App.DB.getAll('insumos');
    var map = {};
    insumos.forEach(function (i) { map[i.id] = i; });
    var res = {};
    recetas.forEach(function (r) {
      var faltan = (r.lineas || []).filter(function (l) {
        var i = map[l.insumoId];
        return i && i.inicializado && (Number(i.stock) || 0) < (Number(l.cantidad) || 0);
      }).map(function (l) { return map[l.insumoId].nombre; });
      if (faltan.length) res[r.productoId || r.id] = faltan;
    });
    return res;
  }

  // ===== Alertas (solo admin): avisa cuando un insumo empeora de nivel =====
  var prevNiveles = null;
  function reset() { prevNiveles = null; App._invAlertas = 0; }
  async function checkAlertas() {
    if (!esAdmin()) { App._invAlertas = 0; return; }
    var A = await analisis();
    App._invAlertas = A.tot.alerta;
    var actual = {};
    A.filas.forEach(function (f) { actual[f.i.id] = f.nivel; });
    if (prevNiveles) {
      A.filas.forEach(function (f) {
        var antes = prevNiveles[f.i.id];
        if (antes === undefined || !enAlerta(f.nivel)) return;
        if (NIVELES[f.nivel].rank <= NIVELES[antes].rank) return;
        var msg = NIVELES[f.nivel].icon + ' Stock ' + NIVELES[f.nivel].label.toLowerCase() + ': ' + f.i.nombre +
          ' (' + fmtCant(f.i, f.i.stock || 0) + ')';
        App.Utils.alertEvent('cocina', msg, f.nivel === 'bajo' ? 'info' : 'error');
      });
    }
    prevNiveles = actual;
  }

  // ===== Vistas =====
  function header(titulo, backAction) {
    return '<div class="cfg-subhead">' +
      '<button class="header-back" onclick="' + backAction + '">' +
      '<span class="header-back-arrow">‹</span> ' + (backAction.indexOf('cfgSection') >= 0 ? 'Configuración' : 'Inventario') + '</button>' +
      '<div class="view-title" style="margin-top:8px">' + titulo + '</div></div>';
  }
  function badgeNivel(nv) {
    return '<span class="inv-nivel inv-' + nv + '">' + NIVELES[nv].icon + ' ' + NIVELES[nv].label + '</span>';
  }
  function fmtTend(t) {
    if (t == null) return '<span class="text-muted">—</span>';
    var pct = Math.round(t * 100);
    var cls = pct > 5 ? 'inv-up' : pct < -5 ? 'inv-down' : 'text-muted';
    return '<span class="' + cls + '">' + (pct > 5 ? '↑' : pct < -5 ? '↓' : '→') + ' ' + (pct > 0 ? '+' : '') + pct + '%</span>';
  }
  function fmtCob(c) { return c == null ? '—' : (c >= 99 ? '+99 días' : fmtNum(c, 1) + ' días'); }
  function tabs(activo) {
    return '<div class="cat-tabs" style="padding:0 0 12px;position:static">' +
      '<button class="cat-tab ' + (activo === 'resumen' ? 'active' : '') + '" onclick="App.Actions.invNav({inv:\'resumen\'})">📦 Inventario</button>' +
      '<button class="cat-tab ' + (activo === 'costos' ? 'active' : '') + '" onclick="App.Actions.invNav({inv:\'costos\'})">💲 Costos de la carta</button>' +
      '</div>';
  }

  async function view(params) {
    if (!esAdmin()) return '<div class="view"><div class="empty-state-text">Solo el administrador.</div></div>';
    if (params.inv === 'detalle' && params.insumoId) return await viewDetalle(params.insumoId);
    if (params.inv === 'costos') return await viewCostos();
    return await viewResumen(params);
  }

  async function viewResumen(params) {
    var A = await analisis();
    var top = header('📦 Inventario', 'App.Actions.cfgSection(null)') + tabs('resumen');
    if (A.filas.length === 0) {
      return '<div class="view">' + top +
        '<div class="empty-state"><div class="empty-state-icon">📦</div>' +
        '<div class="empty-state-text">Aún no hay insumos.</div></div>' +
        '<button class="btn btn-primary btn-block" onclick="App.Actions.invCargarSugeridos()">Cargar insumos sugeridos (' + SUGERIDOS.length + ')</button>' +
        '<div class="text-muted text-sm mt-8 mb-16">Crea los insumos de tu lista y sus recetas (pisco/ron/whisky 90 ml, proteínas 200 g, papas 250/500/700 g, café 20 g). ' +
        'Luego registra compras o un conteo para empezar a controlar.</div>' +
        '<button class="btn btn-outline btn-block" onclick="App.Actions.invInsumoForm(null)">＋ Crear insumo manualmente</button>' +
        '</div>';
    }

    var cat = params.invCat || 'todas';
    var soloAlerta = !!params.invAlerta;
    var filas = A.filas.filter(function (f) {
      return (cat === 'todas' || f.i.categoria === cat) && (!soloAlerta || enAlerta(f.nivel));
    }).sort(function (a, b) {
      return (NIVELES[b.nivel].rank - NIVELES[a.nivel].rank) ||
        (CATEGORIAS.indexOf(a.i.categoria) - CATEGORIAS.indexOf(b.i.categoria)) ||
        a.i.nombre.localeCompare(b.i.nombre);
    });

    var kpis =
      '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-label">Valor del inventario</div><div class="stat-value primary">' + clp(A.tot.valor) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Presupuesto de reposición</div><div class="stat-value info">' + clp(A.tot.reposicion) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">En alerta</div><div class="stat-value" style="color:' + (A.tot.alerta ? 'var(--danger)' : 'var(--success)') + '">' + A.tot.alerta + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Agotados</div><div class="stat-value">' + A.tot.agotados + '</div></div>' +
      '</div>';

    var alertas = A.filas.filter(function (f) { return enAlerta(f.nivel); })
      .sort(function (a, b) { return NIVELES[b.nivel].rank - NIVELES[a.nivel].rank; });
    var alertBox = alertas.length
      ? '<div class="inv-alert-box"><div class="font-bold mb-12">⚠️ Requieren reposición</div>' +
        alertas.map(function (f) {
          var compra = f.st.compraUnidades > 0
            ? ' · comprar ' + fmtNum(f.st.compraUnidades, 0) + ' ' + esc(plural(f.i.compraNombre || 'unidad', f.st.compraUnidades)) +
              (f.st.reposicion > 0 ? ' (' + clp(f.st.reposicion) + ')' : '')
            : '';
          return '<div class="inv-alert-row" onclick="App.Actions.invNav({inv:\'detalle\',insumoId:\'' + f.i.id + '\'})">' +
            NIVELES[f.nivel].icon + ' <strong>' + esc(f.i.nombre) + '</strong> · ' + fmtCant(f.i, f.i.stock || 0) +
            (f.st.cobertura != null ? ' · ' + fmtCob(f.st.cobertura) : '') + compra + '</div>';
        }).join('') + '</div>'
      : '';

    var acciones =
      '<div class="inv-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="App.Actions.invCompraForm(null)">🛒 Compra</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.invMermaForm(null)">🗑️ Merma</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.invConteo(null)">📋 Conteo</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.invInsumoForm(null)">＋ Insumo</button>' +
      '</div>';

    var cats = ['todas'].concat(CATEGORIAS.filter(function (c) { return A.filas.some(function (f) { return f.i.categoria === c; }); }));
    A.filas.forEach(function (f) { if (cats.indexOf(f.i.categoria) < 0) cats.push(f.i.categoria); });
    var filtros = '<div class="cat-tabs" style="padding:0 0 10px;position:static">' +
      cats.map(function (c) {
        return '<button class="cat-tab ' + (c === cat ? 'active' : '') + '" onclick="App.Actions.invNav({invCat:\'' + esc(c) + '\'})">' +
          (c === 'todas' ? 'Todas' : esc(c)) + '</button>';
      }).join('') +
      '<button class="cat-tab ' + (soloAlerta ? 'active' : '') + '" onclick="App.Actions.invNav({invAlerta:' + (!soloAlerta) + '})">⚠️ Solo alertas</button>' +
      '</div>';

    var totalF = { valor: 0, reposicion: 0 };
    var lista = filas.length ? filas.map(function (f) {
      totalF.valor += f.st.valor; totalF.reposicion += f.st.reposicion;
      return '<div class="inv-row" onclick="App.Actions.invNav({inv:\'detalle\',insumoId:\'' + f.i.id + '\'})">' +
        '<div class="inv-row-main">' +
        '<div class="inv-row-name">' + esc(f.i.nombre) + ' ' + badgeNivel(f.nivel) + '</div>' +
        '<div class="inv-row-meta">' + fmtCant(f.i, f.i.stock || 0) +
        (f.i.stockObjetivo ? ' / obj. ' + fmtCant(f.i, f.i.stockObjetivo) : ' · <span style="color:var(--primary)">sin objetivo</span>') +
        ' · cobertura ' + fmtCob(f.st.cobertura) + ' · ' + fmtTend(f.st.tendencia) + '</div>' +
        '</div>' +
        '<div class="inv-row-nums"><div>' + clp(f.st.valor) + '</div>' +
        '<div class="text-muted text-sm">repos. ' + clp(f.st.reposicion) + '</div></div>' +
        '</div>';
    }).join('') : '<div class="empty-state"><div class="empty-state-text">Sin insumos para este filtro</div></div>';

    var totales =
      '<div class="totals mt-12">' +
      '<div class="total-row"><span class="label">Valor (' + filas.length + ' insumos)</span><span class="value">' + clp(totalF.valor) + '</span></div>' +
      '<div class="total-row"><span class="label">Reposición</span><span class="value">' + clp(totalF.reposicion) + '</span></div>' +
      '<div class="total-row grand-total"><span class="label">Total inventario</span><span class="value">' + clp(A.tot.valor) + '</span></div>' +
      '<div class="total-row"><span class="label">Total reposición</span><span class="value">' + clp(A.tot.reposicion) + '</span></div>' +
      '</div>';

    return '<div class="view">' + top + kpis + alertBox + acciones + filtros +
      '<div class="inv-list">' + lista + '</div>' + totales + insights(A) +
      '<div class="text-muted text-sm mt-12">Los datos se actualizan en tiempo real. El consumo se calcula con el conteo al cerrar cada jornada.</div>' +
      '</div>';
  }

  // Indicadores globales de tendencia
  function insights(A) {
    var T = dayKey(Date.now());
    var porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    var hay = false;
    A.D.movs.forEach(function (m) {
      if (m.tipo !== 'conteo' || m.inicial || !m.consumo || m.fecha <= T - 30 * DAY) return;
      var i = A.D.map[m.insumoId];
      var v = m.consumo * ((i && Number(i.costo)) || 0);
      porDiaSemana[new Date(m.fecha).getDay()] += v; hay = true;
    });
    var conT = A.filas.filter(function (f) { return f.st.tendencia != null; });
    var suben = conT.slice().sort(function (a, b) { return b.st.tendencia - a.st.tendencia; }).filter(function (f) { return f.st.tendencia > 0.05; }).slice(0, 3);
    var bajan = conT.slice().sort(function (a, b) { return a.st.tendencia - b.st.tendencia; }).filter(function (f) { return f.st.tendencia < -0.05; }).slice(0, 3);
    var merma = A.filas.filter(function (f) { return f.st.mermaPct != null && f.st.mermaPct > 0; })
      .sort(function (a, b) { return b.st.mermaPct - a.st.mermaPct; }).slice(0, 3);
    if (!hay && !suben.length && !bajan.length && !merma.length) {
      return '<div class="mt-16"><div class="section-title mb-12">📈 Tendencias</div>' +
        '<div class="text-muted text-sm">Aparecerán después de los primeros conteos al cerrar jornada.</div></div>';
    }
    function lista(arr, fmt) { return arr.length ? arr.map(fmt).join('') : '<div class="text-muted text-sm">—</div>'; }
    var maxDia = porDiaSemana.indexOf(Math.max.apply(null, porDiaSemana));
    return '<div class="mt-16"><div class="section-title mb-12">📈 Tendencias (últimos 30 días)</div>' +
      (hay ? '<div class="top-item mb-12"><div><div class="top-item-name">Día de mayor consumo</div>' +
        '<div class="top-item-meta">según costo de lo consumido</div></div>' +
        '<div class="top-item-value">' + DIAS[maxDia] + '</div></div>' : '') +
      '<div class="inv-insights">' +
      '<div><div class="form-label">↑ Suben</div>' + lista(suben, function (f) { return '<div class="text-sm">' + esc(f.i.nombre) + ' ' + fmtTend(f.st.tendencia) + '</div>'; }) + '</div>' +
      '<div><div class="form-label">↓ Bajan</div>' + lista(bajan, function (f) { return '<div class="text-sm">' + esc(f.i.nombre) + ' ' + fmtTend(f.st.tendencia) + '</div>'; }) + '</div>' +
      '<div><div class="form-label">Mayor merma</div>' + lista(merma, function (f) { return '<div class="text-sm">' + esc(f.i.nombre) + ' · ' + Math.round(f.st.mermaPct * 100) + '%</div>'; }) + '</div>' +
      '</div></div>';
  }

  async function viewDetalle(insumoId) {
    var D = await datos();
    var i = D.map[insumoId];
    if (!i) return '<div class="view">' + header('Insumo', 'App.Actions.invNav({inv:\'resumen\'})') + '<div class="empty-state-text">Insumo no encontrado</div></div>';
    var st = stats(i, D.movs);
    var nv = nivel(i, st);
    function card(label, value, cls) {
      return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value ' + (cls || '') + '" style="font-size:17px">' + value + '</div></div>';
    }
    var costoCompra = (Number(i.costo) || 0) * factor(i);
    var grid =
      '<div class="stat-grid">' +
      card('Stock actual', fmtCant(i, i.stock || 0), 'primary') +
      card('Objetivo / mínimo', (i.stockObjetivo ? fmtCant(i, i.stockObjetivo) : '—') + ' / ' + (i.stockMin ? fmtCant(i, i.stockMin) : '—')) +
      card('Valor', clp(st.valor)) +
      card('Reposición', clp(st.reposicion), 'info') +
      card('Costo promedio', costoCompra ? clp(costoCompra) + ' / ' + esc(i.compraNombre || 'unidad') : '—') +
      card('Compra sugerida', st.compraUnidades > 0 ? fmtNum(st.compraUnidades, 0) + ' ' + esc(plural(i.compraNombre || 'unidad', st.compraUnidades)) : '—') +
      card('Consumo diario (7 d)', st.d7 != null ? fmtCant(i, st.d7) : '—') +
      card('Consumo diario (30 d)', st.d30 != null ? fmtCant(i, st.d30) : '—') +
      card('Tendencia semanal', fmtTend(st.tendencia)) +
      card('Cobertura', fmtCob(st.cobertura)) +
      card('Merma (30 d)', st.mermaPct != null ? Math.round(st.mermaPct * 100) + '%' : '—') +
      card('Rotación (30 d)', st.rotacion != null ? fmtNum(st.rotacion, 1) + ' veces' : '—') +
      '</div>';

    var max = Math.max.apply(null, st.serie.map(function (s) { return s.v; }).concat([0]));
    var chart = '<div class="section-title mb-12 mt-16">Consumo últimos 14 días</div><div class="inv-chart">' +
      st.serie.map(function (s) {
        var h = max > 0 ? Math.max(2, Math.round(s.v / max * 100)) : 2;
        var d = new Date(s.d);
        return '<div class="inv-bar-col" title="' + App.Utils.formatDate(s.d) + ': ' + (s.operado ? fmtCant(i, s.v) : 'sin conteo') + '">' +
          '<div class="inv-bar' + (s.operado ? '' : ' inv-bar-empty') + '" style="height:' + h + '%"></div>' +
          '<div class="inv-bar-label">' + d.getDate() + '</div></div>';
      }).join('') + '</div>' +
      '<div class="text-muted text-sm">Barras grises: días sin conteo.</div>';

    var usos = D.recetas.filter(function (r) { return (r.lineas || []).some(function (l) { return l.insumoId === i.id; }); });
    var prodMap = {};
    D.productos.forEach(function (p) { prodMap[p.id] = p; });
    var usosHtml = '<div class="section-title mb-12 mt-16">Productos que lo usan</div>' +
      (usos.length ? usos.map(function (r) {
        var l = r.lineas.filter(function (x) { return x.insumoId === i.id; })[0];
        var p = prodMap[r.productoId || r.id];
        return '<div class="text-sm">• ' + esc(p ? p.nombre : r.productoId) + ' — ' + fmtBase(i, l.cantidad) + '</div>';
      }).join('') : '<div class="text-muted text-sm">Ningún producto (solo se controla en bodega).</div>');

    var tipoLabel = { compra: '🛒 Compra', merma: '🗑️ Merma', conteo: '📋 Conteo' };
    var movsHtml = '<div class="section-title mb-12 mt-16">Últimos movimientos</div>' +
      (st.ultimos.length ? '<div class="movements-list">' + st.ultimos.map(function (m) {
        var det = m.tipo === 'compra' ? '+' + fmtCant(i, m.cantidad) + ' · ' + clp(m.costoTotal)
          : m.tipo === 'merma' ? '−' + fmtCant(i, Math.abs(m.cantidad)) + (m.motivo ? ' · ' + esc(m.motivo) : '')
          : (m.inicial ? 'Inicial: ' + fmtCant(i, m.stockResultante || 0)
            : 'Contado ' + fmtCant(i, m.stockResultante || 0) + (m.consumo ? ' · consumo ' + fmtCant(i, m.consumo) : '') +
              (m.cantidad > 0 ? ' · sobrante ' + fmtCant(i, m.cantidad) : ''));
        return '<div class="movement-item"><div class="movement-info">' +
          '<span class="movement-concept">' + (tipoLabel[m.tipo] || m.tipo) + '</span>' +
          '<span class="movement-time">' + App.Utils.formatDateTime(m.fecha) + (m.usuario ? ' · ' + esc(m.usuario) : '') + '</span></div>' +
          '<span class="text-sm" style="text-align:right">' + det + '</span></div>';
      }).join('') + '</div>' : '<div class="text-muted text-sm">Sin movimientos en los últimos 45 días.</div>');

    var acciones = '<div class="inv-actions mt-16">' +
      '<button class="btn btn-primary btn-sm" onclick="App.Actions.invCompraForm(\'' + i.id + '\')">🛒 Compra</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.invMermaForm(\'' + i.id + '\')">🗑️ Merma</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.invInsumoForm(\'' + i.id + '\')">✏️ Editar</button>' +
      '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="App.Actions.invEliminarInsumo(\'' + i.id + '\')">Eliminar</button>' +
      '</div>';

    return '<div class="view">' + header(esc(i.nombre), 'App.Actions.invNav({inv:\'resumen\',insumoId:null})') +
      '<div class="mb-12">' + badgeNivel(nv) + ' <span class="text-muted text-sm">· ' + esc(i.categoria || '') +
      ' · control en ' + UNIDADES[i.unidad] + '</span></div>' +
      (nv === 'sincontrol' ? '<div class="warning-box mb-12">Registra una compra o un conteo para empezar a controlar este insumo.</div>' : '') +
      (!i.stockMin || !i.stockObjetivo ? '<div class="warning-box mb-12">Define mínimo y objetivo (✏️ Editar) para las alertas y el presupuesto de reposición.</div>' : '') +
      acciones + grid + chart + usosHtml + movsHtml + '</div>';
  }

  async function viewCostos() {
    var D = await datos();
    var s = App.Store.state.settings;
    var ivaRate = Number(s.ivaRate) || 0;
    var incluye = s.preciosIncluyenIva !== false;
    var cats = await App.DB.getAll('categorias');
    var catOrden = {};
    cats.forEach(function (c) { catOrden[c.id] = c.orden || 0; });
    var prodMap = {};
    D.productos.forEach(function (p) { prodMap[p.id] = p; });
    var filas = D.recetas.map(function (r) {
      var p = prodMap[r.productoId || r.id];
      var sinCosto = false;
      var costo = (r.lineas || []).reduce(function (t, l) {
        var i = D.map[l.insumoId];
        if (!i || !(Number(i.costo) > 0)) sinCosto = true;
        return t + (i ? (Number(i.costo) || 0) * (Number(l.cantidad) || 0) : 0);
      }, 0);
      var precio = p ? Number(p.precio) || 0 : 0;
      var neto = incluye ? precio / (1 + ivaRate / 100) : precio;
      var margen = neto > 0 ? (neto - costo) / neto : null;
      return { r: r, p: p, costo: costo, neto: neto, margen: margen, sinCosto: sinCosto };
    }).filter(function (f) { return f.p; })
      .sort(function (a, b) {
        return (catOrden[a.p.categoriaId] - catOrden[b.p.categoriaId]) ||
          (parseInt(a.p.id.replace(/\D/g, ''), 10) - parseInt(b.p.id.replace(/\D/g, ''), 10));
      });

    var lista = filas.length ? filas.map(function (f) {
      var detalle = (f.r.lineas || []).map(function (l) {
        var i = D.map[l.insumoId];
        return i ? esc(i.nombre) + ' ' + fmtBase(i, l.cantidad) : '?';
      }).join(' + ');
      var mCls = f.margen == null ? 'text-muted' : f.margen < 0.5 ? 'inv-down' : f.margen < 0.7 ? '' : 'inv-up';
      return '<div class="inv-row" onclick="App.Actions.invRecetaForm(\'' + f.p.id + '\')">' +
        '<div class="inv-row-main"><div class="inv-row-name">' + esc(f.p.nombre) + '</div>' +
        '<div class="inv-row-meta">' + detalle + '</div></div>' +
        '<div class="inv-row-nums"><div>' + (f.sinCosto ? '<span class="text-muted">sin costo</span>' : clp(f.costo)) + '</div>' +
        '<div class="text-sm ' + mCls + '">' + (f.sinCosto || f.margen == null ? '—' : 'margen ' + Math.round(f.margen * 100) + '%') + '</div></div>' +
        '</div>';
    }).join('') : '<div class="empty-state"><div class="empty-state-text">Sin recetas</div></div>';

    return '<div class="view">' + header('📦 Inventario', 'App.Actions.cfgSection(null)') + tabs('costos') +
      '<div class="text-muted text-sm mb-12">Costo de cada producto según su receta y el costo promedio de sus insumos. ' +
      'Margen sobre el precio ' + (incluye ? 'sin IVA' : 'de venta') + '. Toca un producto para editar su receta.</div>' +
      '<button class="btn btn-outline btn-sm mb-12" onclick="App.Actions.invRecetaNueva()">＋ Receta</button>' +
      '<div class="inv-list">' + lista + '</div></div>';
  }

  // ===== Formularios y acciones =====
  function insumoOptions(insumos, selected) {
    return insumos.slice().sort(function (a, b) {
      return (CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria)) || a.nombre.localeCompare(b.nombre);
    }).map(function (i) {
      return '<option value="' + i.id + '"' + (i.id === selected ? ' selected' : '') + '>' + esc(i.nombre) + '</option>';
    }).join('');
  }
  function footer(cancel, okLabel, okAction, danger) {
    return '<div class="modal-footer"><button class="btn btn-secondary" onclick="' + cancel + '">Cancelar</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" onclick="' + okAction + '">' + okLabel + '</button></div>';
  }
  function modalHead(t) {
    return '<div class="modal-header"><span class="modal-title">' + t + '</span>' +
      '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>';
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  async function cargarSugeridos() {
    if (!esAdmin()) return;
    await safe(async function () {
      var existentes = {};
      (await App.DB.getAll('insumos')).forEach(function (i) { existentes[i.id] = true; });
      var nuevos = SUGERIDOS.filter(function (i) { return !existentes[i.id]; }).map(function (i) { return Object.assign({}, i); });
      if (nuevos.length) await App.DB.bulkPut('insumos', nuevos);
      var recetasExist = {};
      (await App.DB.getAll('recetas')).forEach(function (r) { recetasExist[r.id] = true; });
      var productos = {};
      (await App.DB.getAll('productos')).forEach(function (p) { productos[p.id] = true; });
      var recetas = Object.keys(RECETAS).filter(function (pid) { return productos[pid] && !recetasExist[pid]; }).map(function (pid) {
        return { id: pid, productoId: pid, lineas: RECETAS[pid].map(function (l) { return { insumoId: l[0], cantidad: l[1] }; }) };
      });
      if (recetas.length) await App.DB.bulkPut('recetas', recetas);
      App.Utils.toast(nuevos.length + ' insumos y ' + recetas.length + ' recetas creados', 'success');
      App.render();
    });
  }

  async function insumoForm(id) {
    if (!esAdmin()) return;
    var i = id ? await App.DB.get('insumos', id) : null;
    var u = i ? i.unidad : 'u';
    var f = i ? factor(i) : 1;
    App.Utils.modal(modalHead(i ? 'Editar insumo' : 'Nuevo insumo') +
      '<div class="modal-body"><div class="config-form">' +
      '<div class="form-group"><label class="form-label">Nombre</label>' +
      '<input id="inv-nombre" class="form-input" value="' + esc(i ? i.nombre : '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Categoría</label>' +
      '<input id="inv-cat" class="form-input" list="inv-cats" value="' + esc(i ? i.categoria : '') + '">' +
      '<datalist id="inv-cats">' + CATEGORIAS.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Se controla en</label><select id="inv-unidad" class="form-select">' +
      Object.keys(UNIDADES).map(function (k) { return '<option value="' + k + '"' + (k === u ? ' selected' : '') + '>' + UNIDADES[k] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Se compra en</label>' +
      '<input id="inv-compra" class="form-input" value="' + esc(i ? i.compraNombre : 'unidad') + '" placeholder="botella, kg, caja"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">¿Cuánto trae cada unidad de compra? (en la unidad de control)</label>' +
      '<input id="inv-factor" type="number" inputmode="decimal" class="form-input" value="' + f + '" placeholder="Ej: botella = 750 (ml)"></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Stock mínimo (en unid. de compra)</label>' +
      '<input id="inv-min" type="number" inputmode="decimal" class="form-input" value="' + (i && i.stockMin ? enCompra(i.stockMin, f) : '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Stock objetivo (en unid. de compra)</label>' +
      '<input id="inv-obj" type="number" inputmode="decimal" class="form-input" value="' + (i && i.stockObjetivo ? enCompra(i.stockObjetivo, f) : '') + '"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Días que tarda en llegar una compra</label>' +
      '<input id="inv-dias" type="number" inputmode="numeric" class="form-input" value="' + (i ? (i.diasReposicion || 2) : 2) + '"></div>' +
      '<div class="text-muted text-sm">El stock y el costo cambian solo con compras, mermas y conteos.</div>' +
      '</div></div>' +
      footer('App.Utils.closeModal()', 'Guardar', 'App.Actions.invGuardarInsumo(\'' + (id || '') + '\')'));
  }

  async function guardarInsumo(id) {
    if (!esAdmin()) return;
    var nombre = val('inv-nombre').trim();
    var f = num(val('inv-factor'));
    var min = val('inv-min').trim() === '' ? 0 : num(val('inv-min'));
    var obj = val('inv-obj').trim() === '' ? 0 : num(val('inv-obj'));
    var dias = Math.max(0, Math.round(num(val('inv-dias')) || 0));
    if (!nombre) { App.Utils.toast('Ingresa el nombre', 'error'); return; }
    if (!(f > 0)) { App.Utils.toast('La equivalencia de compra debe ser mayor a 0', 'error'); return; }
    if (!(min >= 0) || !(obj >= 0)) { App.Utils.toast('Mínimo y objetivo deben ser números', 'error'); return; }
    if (obj > 0 && min > obj) { App.Utils.toast('El mínimo no puede superar al objetivo', 'error'); return; }
    var campos = {
      nombre: nombre, categoria: val('inv-cat').trim() || 'Otros', unidad: val('inv-unidad'),
      compraNombre: val('inv-compra').trim() || 'unidad', compraFactor: f,
      stockMin: min * f, stockObjetivo: obj * f, diasReposicion: dias,
    };
    await safe(async function () {
      if (id) {
        await App.DB.update('insumos', id, function (d) { Object.assign(d, campos); });
      } else {
        await App.DB.put('insumos', Object.assign({ id: App.Utils.uid('ins'), stock: 0, costo: 0, inicializado: false }, campos));
      }
      App.Utils.closeModal();
      App.Utils.toast('Insumo guardado', 'success');
      App.render();
    });
  }

  async function eliminarInsumo(id) {
    if (!esAdmin()) return;
    var i = await App.DB.get('insumos', id);
    if (!i) return;
    var usos = (await App.DB.getAll('recetas')).filter(function (r) { return (r.lineas || []).some(function (l) { return l.insumoId === id; }); });
    if (!window.confirm('¿Eliminar "' + i.nombre + '"?' + (usos.length ? ' Se quitará de ' + usos.length + ' receta(s).' : ''))) return;
    await safe(async function () {
      for (var k = 0; k < usos.length; k++) {
        var r = usos[k];
        var lineas = r.lineas.filter(function (l) { return l.insumoId !== id; });
        if (lineas.length) await App.DB.put('recetas', Object.assign({}, r, { lineas: lineas }));
        else await App.DB.remove('recetas', r.id);
      }
      await App.DB.remove('insumos', id);
      App.Utils.toast('Insumo eliminado', 'info');
      nav({ inv: 'resumen', insumoId: null });
    });
  }

  // --- Compra: cantidad + costo (obligatorio) → costo promedio ponderado ---
  async function compraForm(id) {
    if (!esAdmin()) return;
    var insumos = await App.DB.getAll('insumos');
    if (!insumos.length) { App.Utils.toast('Primero crea insumos', 'error'); return; }
    var sel = id || insumos[0].id;
    App.Utils.modal(modalHead('🛒 Registrar compra') +
      '<div class="modal-body"><div class="config-form">' +
      '<div class="form-group"><label class="form-label">Insumo</label>' +
      '<select id="inv-ins" class="form-select" onchange="App.Actions.invCompraHint()">' + insumoOptions(insumos, sel) + '</select></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" id="inv-cant-label">Cantidad</label>' +
      '<input id="inv-cant" type="number" inputmode="decimal" class="form-input" oninput="App.Actions.invCompraHint()"></div>' +
      '<div class="form-group"><label class="form-label" id="inv-costo-label">Costo por unidad ($)</label>' +
      '<input id="inv-costo" type="number" inputmode="numeric" class="form-input" oninput="App.Actions.invCompraHint()"></div>' +
      '</div>' +
      '<div id="inv-hint" class="text-muted text-sm"></div>' +
      '</div></div>' +
      footer('App.Utils.closeModal()', 'Registrar', 'App.Actions.invGuardarCompra()'));
    compraHint();
  }
  async function compraHint() {
    var i = await App.DB.get('insumos', val('inv-ins'));
    if (!i) return;
    var cn = i.compraNombre || 'unidad';
    var lc = document.getElementById('inv-cant-label');
    var lk = document.getElementById('inv-costo-label');
    if (lc) lc.textContent = 'Cantidad (' + plural(cn, 2) + ')';
    if (lk) lk.textContent = 'Costo por ' + cn + ' ($)';
    var q = num(val('inv-cant')), c = num(val('inv-costo'));
    var hint = document.getElementById('inv-hint');
    if (!hint) return;
    var ult = (Number(i.costo) || 0) * factor(i);
    hint.innerHTML = (q > 0 && c > 0 ? 'Total: <strong>' + clp(q * c) + '</strong> · ' : '') +
      'Stock actual: ' + fmtCant(i, i.stock || 0) + (ult ? ' · costo promedio ' + clp(ult) + ' / ' + esc(cn) : '');
  }
  async function guardarCompra() {
    if (!esAdmin()) return;
    var id = val('inv-ins');
    var q = num(val('inv-cant'));
    var c = num(val('inv-costo'));
    if (!(q > 0)) { App.Utils.toast('Ingresa la cantidad', 'error'); return; }
    if (!(c > 0)) { App.Utils.toast('Ingresa el costo de la compra', 'error'); return; }
    await safe(async function () {
      var i0 = await App.DB.get('insumos', id);
      if (!i0) throw new Error('Insumo no encontrado');
      var base = q * factor(i0);
      var costoBase = c / factor(i0);
      var res = await App.DB.update('insumos', id, function (d) {
        var stock = Math.max(0, Number(d.stock) || 0);
        var costo = Number(d.costo) || 0;
        d.costo = stock > 0 && costo > 0 ? (stock * costo + base * costoBase) / (stock + base) : costoBase;
        d.stock = stock + base;
        d.inicializado = true;
      });
      if (!res) throw new Error('Insumo no encontrado');
      await App.DB.put('inventario', {
        id: App.Utils.uid('inv'), insumoId: id, tipo: 'compra', cantidad: base,
        costoUnit: costoBase, costoTotal: Math.round(q * c), stockResultante: res.stock,
        usuario: userName(), fecha: Date.now(),
      });
      App.Utils.closeModal();
      App.Utils.toast('Compra registrada: ' + fmtCant(res, base) + ' de ' + res.nombre, 'success');
      App.render();
    });
  }

  // --- Merma ---
  async function mermaForm(id) {
    if (!esAdmin()) return;
    var insumos = (await App.DB.getAll('insumos')).filter(function (i) { return i.inicializado; });
    if (!insumos.length) { App.Utils.toast('No hay insumos con stock controlado', 'error'); return; }
    var sel = id && insumos.some(function (i) { return i.id === id; }) ? id : insumos[0].id;
    App.Utils.modal(modalHead('🗑️ Registrar merma') +
      '<div class="modal-body"><div class="config-form">' +
      '<div class="form-group"><label class="form-label">Insumo</label>' +
      '<select id="inv-ins" class="form-select">' + insumoOptions(insumos, sel) + '</select></div>' +
      '<div class="form-group"><label class="form-label">Cantidad (en unidad de compra: botellas, kg, unidades…)</label>' +
      '<input id="inv-cant" type="number" inputmode="decimal" class="form-input"></div>' +
      '<div class="form-group"><label class="form-label">Motivo</label>' +
      '<input id="inv-motivo" class="form-input" list="inv-motivos" placeholder="Ej: vencido, derrame">' +
      '<datalist id="inv-motivos"><option value="Vencido"><option value="Derrame / quiebre"><option value="Mal preparado"><option value="Consumo interno"></datalist></div>' +
      '</div></div>' +
      footer('App.Utils.closeModal()', 'Registrar', 'App.Actions.invGuardarMerma()', true));
  }
  async function guardarMerma() {
    if (!esAdmin()) return;
    var id = val('inv-ins');
    var q = num(val('inv-cant'));
    var motivo = val('inv-motivo').trim();
    if (!(q > 0)) { App.Utils.toast('Ingresa la cantidad', 'error'); return; }
    await safe(async function () {
      var i0 = await App.DB.get('insumos', id);
      if (!i0) throw new Error('Insumo no encontrado');
      var base = q * factor(i0);
      if (base > (Number(i0.stock) || 0) + 1e-9) {
        App.Utils.toast('La merma supera el stock (' + fmtCant(i0, i0.stock || 0) + ')', 'error');
        return;
      }
      var res = await App.DB.update('insumos', id, function (d) {
        d.stock = Math.max(0, (Number(d.stock) || 0) - base);
      });
      if (!res) throw new Error('Insumo no encontrado');
      await App.DB.put('inventario', {
        id: App.Utils.uid('inv'), insumoId: id, tipo: 'merma', cantidad: -base,
        costoUnit: Number(res.costo) || 0, costoTotal: Math.round(base * (Number(res.costo) || 0)),
        stockResultante: res.stock, motivo: motivo || null, usuario: userName(), fecha: Date.now(),
      });
      App.Utils.closeModal();
      App.Utils.toast('Merma registrada', 'success');
      App.render();
    });
  }

  // --- Conteo físico (al cerrar jornada o manual) ---
  // onDone: nombre de una acción de App.Actions a ejecutar al terminar.
  async function conteo(onDone) {
    if (!esAdmin()) return;
    var insumos = (await App.DB.getAll('insumos')).sort(function (a, b) {
      return (CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria)) || a.nombre.localeCompare(b.nombre);
    });
    if (!insumos.length) {
      if (onDone && App.Actions[onDone]) App.Actions[onDone]();
      else App.Utils.toast('Primero crea insumos', 'error');
      return;
    }
    var grupo = '';
    var filas = insumos.map(function (i) {
      var h = '';
      if (i.categoria !== grupo) { grupo = i.categoria; h += '<div class="order-section-title">' + esc(grupo) + '</div>'; }
      var actual = i.inicializado ? String(Math.round((Number(i.stock) || 0) / factor(i) * 100) / 100) : '';
      return h + '<div class="inv-count-row">' +
        '<div class="inv-count-name">' + esc(i.nombre) +
        '<div class="text-muted text-sm">' + (i.inicializado ? 'esperado ' + fmtCant(i, i.stock || 0) : 'sin control aún') + '</div></div>' +
        '<input type="number" inputmode="decimal" class="form-input inv-count-input" data-id="' + i.id + '" value="' + actual + '" ' +
        'placeholder="—"><span class="text-muted text-sm inv-count-unit">' + esc(plural(i.compraNombre || 'unidad', 2)) + '</span></div>';
    }).join('');
    var jornada = !!onDone;
    App.Utils.modal(modalHead('📋 Conteo de inventario') +
      '<div class="modal-body">' +
      '<div class="text-muted text-sm mb-12">Ingresa lo que hay físicamente (en unidad de compra, se aceptan decimales: 2,5 botellas). ' +
      'La diferencia con lo esperado se registra como el <strong>consumo del día</strong>. Deja en blanco lo que no cuentes.</div>' +
      filas + '</div>' +
      '<div class="modal-footer">' +
      (jornada
        ? '<button class="btn btn-secondary" onclick="App.Actions.invConteoGuardar(\'' + onDone + '\', true)">Cerrar sin contar</button>' +
          '<button class="btn btn-primary" onclick="App.Actions.invConteoGuardar(\'' + onDone + '\')">Guardar y continuar</button>'
        : '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
          '<button class="btn btn-primary" onclick="App.Actions.invConteoGuardar(null)">Guardar conteo</button>') +
      '</div>');
  }

  async function conteoGuardar(onDone, omitir) {
    if (!esAdmin()) return;
    if (!omitir) {
      var inputs = Array.prototype.slice.call(document.querySelectorAll('.inv-count-input'));
      var lecturas = [];
      for (var k = 0; k < inputs.length; k++) {
        var raw = inputs[k].value.trim();
        if (raw === '') continue;
        var q = num(raw);
        if (!(q >= 0)) { App.Utils.toast('Cantidad inválida en el conteo', 'error'); inputs[k].focus(); return; }
        lecturas.push({ id: inputs[k].getAttribute('data-id'), q: q });
      }
      var ok = await safe(async function () {
        var now = Date.now();
        for (var j = 0; j < lecturas.length; j++) {
          var i0 = await App.DB.get('insumos', lecturas[j].id);
          if (!i0) continue;
          var contado = lecturas[j].q * factor(i0);
          var previo = { stock: 0, ini: false };
          var res = await App.DB.update('insumos', lecturas[j].id, function (d) {
            previo.stock = Number(d.stock) || 0;
            previo.ini = !!d.inicializado;
            d.stock = contado;
            d.inicializado = true;
            d.ultimoConteo = now;
          });
          if (!res) continue;
          var diff = contado - previo.stock;
          await App.DB.put('inventario', {
            id: App.Utils.uid('inv'), insumoId: res.id, tipo: 'conteo', cantidad: diff,
            consumo: previo.ini ? Math.max(0, -diff) : 0, inicial: !previo.ini,
            costoUnit: Number(res.costo) || 0, stockResultante: contado,
            usuario: userName(), fecha: now,
          });
        }
        return true;
      });
      if (!ok) return;
      App.Utils.toast('Conteo guardado (' + lecturas.length + ' insumos)', 'success');
    }
    App.Utils.closeModal();
    if (onDone && onDone !== 'null' && App.Actions[onDone]) App.Actions[onDone]();
    else App.render();
  }

  // --- Recetas ---
  var draft = null;
  async function recetaNueva() {
    if (!esAdmin()) return;
    var recetas = {};
    (await App.DB.getAll('recetas')).forEach(function (r) { recetas[r.id] = true; });
    var productos = (await App.DB.getAll('productos')).filter(function (p) { return !recetas[p.id]; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    if (!productos.length) { App.Utils.toast('Todos los productos ya tienen receta', 'info'); return; }
    App.Utils.modal(modalHead('＋ Receta') +
      '<div class="modal-body"><div class="form-group"><label class="form-label">Producto</label>' +
      '<select id="inv-prod" class="form-select">' + productos.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>';
      }).join('') + '</select></div></div>' +
      footer('App.Utils.closeModal()', 'Continuar', 'App.Actions.invRecetaForm(document.getElementById(\'inv-prod\').value)'));
  }
  async function recetaForm(productoId) {
    if (!esAdmin()) return;
    var r = await App.DB.get('recetas', productoId);
    draft = { productoId: productoId, lineas: r ? (r.lineas || []).map(function (l) { return { insumoId: l.insumoId, cantidad: l.cantidad }; }) : [] };
    if (!draft.lineas.length) draft.lineas.push({ insumoId: '', cantidad: '' });
    await renderReceta();
  }
  async function renderReceta() {
    var p = await App.DB.get('productos', draft.productoId);
    var insumos = await App.DB.getAll('insumos');
    var map = {};
    insumos.forEach(function (i) { map[i.id] = i; });
    var filas = draft.lineas.map(function (l, idx) {
      var i = map[l.insumoId];
      return '<div class="inv-receta-row">' +
        '<select class="form-select inv-rec-ins" onchange="App.Actions.invRecetaSync()"><option value="">— insumo —</option>' + insumoOptions(insumos, l.insumoId) + '</select>' +
        '<input type="number" inputmode="decimal" class="form-input inv-rec-cant" value="' + (l.cantidad === '' ? '' : l.cantidad) + '" placeholder="cant.">' +
        '<span class="text-muted text-sm">' + (i ? (i.unidad === 'u' ? 'u' : i.unidad) : '') + '</span>' +
        '<button class="icon-btn danger" onclick="App.Actions.invRecetaQuitar(' + idx + ')">✕</button></div>';
    }).join('');
    App.Utils.modal(modalHead('Receta · ' + esc(p ? p.nombre : draft.productoId)) +
      '<div class="modal-body">' +
      '<div class="text-muted text-sm mb-12">Cantidad de cada insumo por unidad vendida (en la unidad de control: u, g o ml).</div>' +
      filas +
      '<button class="btn btn-outline btn-sm mt-12" onclick="App.Actions.invRecetaAgregar()">＋ Agregar insumo</button>' +
      '</div>' +
      footer('App.Utils.closeModal()', 'Guardar', 'App.Actions.invRecetaGuardar()'));
  }
  function syncDraft() {
    var sels = document.querySelectorAll('.inv-rec-ins');
    var cants = document.querySelectorAll('.inv-rec-cant');
    draft.lineas = Array.prototype.map.call(sels, function (s, k) {
      var c = cants[k].value.trim();
      return { insumoId: s.value, cantidad: c === '' ? '' : num(c) };
    });
  }
  async function recetaGuardar() {
    if (!esAdmin()) return;
    syncDraft();
    var lineas = draft.lineas.filter(function (l) { return l.insumoId; });
    for (var k = 0; k < lineas.length; k++) {
      if (!(lineas[k].cantidad > 0)) { App.Utils.toast('Cada insumo necesita una cantidad mayor a 0', 'error'); return; }
    }
    var ids = lineas.map(function (l) { return l.insumoId; });
    if (ids.some(function (x, i) { return ids.indexOf(x) !== i; })) { App.Utils.toast('Hay insumos repetidos', 'error'); return; }
    await safe(async function () {
      if (lineas.length) await App.DB.put('recetas', { id: draft.productoId, productoId: draft.productoId, lineas: lineas });
      else await App.DB.remove('recetas', draft.productoId);
      App.Utils.closeModal();
      App.Utils.toast(lineas.length ? 'Receta guardada' : 'Receta eliminada', 'success');
      App.render();
    });
  }

  function nav(patch) {
    var params = Object.assign({}, App.Store.state.params, { section: 'inventario' }, patch);
    App.Store.setState({ params: params });
  }

  // Acciones expuestas para los onclick
  App.Actions.invNav = nav;
  App.Actions.invCargarSugeridos = cargarSugeridos;
  App.Actions.invInsumoForm = insumoForm;
  App.Actions.invGuardarInsumo = guardarInsumo;
  App.Actions.invEliminarInsumo = eliminarInsumo;
  App.Actions.invCompraForm = compraForm;
  App.Actions.invCompraHint = compraHint;
  App.Actions.invGuardarCompra = guardarCompra;
  App.Actions.invMermaForm = mermaForm;
  App.Actions.invGuardarMerma = guardarMerma;
  App.Actions.invConteo = conteo;
  App.Actions.invConteoGuardar = conteoGuardar;
  App.Actions.invRecetaNueva = recetaNueva;
  App.Actions.invRecetaForm = recetaForm;
  App.Actions.invRecetaSync = function () { syncDraft(); renderReceta(); };
  App.Actions.invRecetaAgregar = function () { syncDraft(); draft.lineas.push({ insumoId: '', cantidad: '' }); renderReceta(); };
  App.Actions.invRecetaQuitar = function (idx) { syncDraft(); draft.lineas.splice(idx, 1); renderReceta(); };
  App.Actions.invRecetaGuardar = recetaGuardar;

  return {
    view: view,
    analisis: analisis,
    bloqueos: bloqueos,
    checkAlertas: checkAlertas,
    reset: reset,
    // expuestos para pruebas
    _stats: stats, _nivel: nivel, _fmtCant: fmtCant, _SUGERIDOS: SUGERIDOS, _RECETAS: RECETAS,
  };
})();
