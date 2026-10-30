// estacion.js — pantalla de estación (cocina, bar, ...) y vista "Pase" (admin).
//
// Cada estación ve SOLO las tandas de su área, en 3 columnas:
//   🔔 Enviados → 🔥 Preparando → ✅ Listos  (servido lo marca el mozo)
// Se pueden marcar líneas sueltas como listas; cuando todas las líneas
// activas de la tanda están listas, la tanda pasa a "lista" sola.
App.Views = App.Views || {};
App.Actions = App.Actions || {};

var ESTADOS_ACTIVOS = ['enviada', 'preparando', 'lista'];

// Junta las tandas activas de un área (o de todas si area = null)
async function _ticketsDe(area) {
  var allComandas = await App.DB.getAll('comandas');
  var mesas = await App.DB.getAll('mesas');
  var mesaMap = {};
  mesas.forEach(function (m) { mesaMap[m.id] = m; });

  var tickets = [];
  allComandas.forEach(function (c) {
    if (c.estado === 'cancelada') return;
    (c.tandas || []).forEach(function (t) {
      var tArea = App.Estaciones.tandaArea(t);
      if (area && tArea !== area) return;
      if (ESTADOS_ACTIVOS.indexOf(t.estado) === -1) return;
      tickets.push({
        comandaId: c.id,
        tandaId: t.id,
        numero: t.numero,
        area: tArea,
        directa: !!t.directa,
        mesaNumero: mesaMap[c.mesaId] ? mesaMap[c.mesaId].numero : (c.mesaId || '?').replace('mesa-', ''),
        mozoName: c.mozoName,
        items: t.items || [],
        estado: t.estado,
        enviadaAt: t.enviadaAt,
        otrasAreas: (c.tandas || []).filter(function (o) {
          return o.numero === t.numero && o.id !== t.id && ESTADOS_ACTIVOS.indexOf(o.estado) !== -1;
        }).map(function (o) { return { area: App.Estaciones.tandaArea(o), estado: o.estado }; }),
      });
    });
  });
  tickets.sort(function (a, b) { return a.enviadaAt - b.enviadaAt; });
  return tickets;
}

function _cardHtml(tk) {
  var est = App.Estaciones.get(tk.area);
  var mins = Math.floor((Date.now() - tk.enviadaAt) / 60000);
  var umbral = Number(est.recordatorioMin) || 8;
  var delayClass = '';
  if (tk.estado !== 'lista') {
    if (mins >= umbral * 2) delayClass = ' delay-high';
    else if (mins >= umbral) delayClass = ' delay-mid';
  }
  var editable = tk.estado === 'enviada' || tk.estado === 'preparando';

  var itemsHtml = '<div class="kitchen-items">';
  tk.items.forEach(function (item, idx) {
    var cls = 'kitchen-item' + (item.listo ? ' listo' : '') + (item.anulado ? ' anulado' : '');
    var check = '';
    if (item.anulado) {
      check = '<span class="kitchen-item-check">🚫</span>';
    } else if (editable) {
      check = '<button class="kitchen-item-check btn-check" title="Marcar línea lista" ' +
        'onclick="App.Actions.toggleItemListo(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\',' + idx + ')">' +
        (item.listo ? '☑' : '☐') + '</button>';
    } else {
      check = '<span class="kitchen-item-check">' + (item.listo || tk.estado === 'lista' ? '☑' : '') + '</span>';
    }
    itemsHtml +=
      '<div class="' + cls + '">' + check +
      '<span class="kitchen-item-qty">' + item.cantidad + 'x</span>' +
      '<span class="kitchen-item-name">' + App.Utils.esc(item.nombre) + (item.anulado ? ' <strong class="text-danger">ANULADO</strong>' : '') + '</span>' +
      (item.notas ? '<div class="kitchen-item-notas" style="margin-left:60px">→ ' + App.Utils.esc(item.notas) + '</div>' : '') +
      '</div>';
  });
  itemsHtml += '</div>';

  // La estación controla enviada→preparando→lista. "Servido" lo hace el mozo.
  var actionBtn = '';
  if (tk.estado === 'enviada') {
    actionBtn = '<button class="btn btn-secondary btn-sm" onclick="App.Actions.iniciarPreparacion(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\')">Iniciar ▶</button>' +
      '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\')">Listo ✓</button>';
  } else if (tk.estado === 'preparando') {
    actionBtn = '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\')">Listo ✓</button>';
  } else {
    var quien = tk.mozoName ? App.Utils.esc(tk.mozoName) : 'el mozo';
    actionBtn = '<span class="kitchen-waiting">' + (tk.directa ? '⚡ Despacho directo · ' : '') + 'Listo · esperando a ' + quien + '</span>';
  }

  var mozoTag = tk.mozoName ? '<span class="kitchen-mozo">👤 ' + App.Utils.esc(tk.mozoName) + '</span>' : '';
  // Otras estaciones del mismo envío (para coordinar la salida)
  var otras = tk.otrasAreas.map(function (o) {
    return '<span class="kitchen-otra" title="' + App.Utils.esc(App.Estaciones.get(o.area).nombre) + ': ' + o.estado + '">' +
      App.Estaciones.get(o.area).icono + ' ' + (o.estado === 'lista' ? '✓' : '…') + '</span>';
  }).join('');

  return '<div class="kitchen-card ' + tk.estado + delayClass + '">' +
    '<div class="kitchen-card-header">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    '<span class="kitchen-mesa">Mesa ' + tk.mesaNumero + '</span>' +
    '<span class="kitchen-tanda">T' + tk.numero + '</span>' +
    mozoTag + otras +
    '</div>' +
    '<span class="kitchen-time">⏱ ' + App.Utils.timeAgo(tk.enviadaAt) + '</span>' +
    '</div>' +
    itemsHtml +
    '<div class="kitchen-actions">' + actionBtn + '</div>' +
    '</div>';
}

function _columnHtml(titulo, estado, lista) {
  var cards = lista.length ? lista.map(_cardHtml).join('') : '<div class="kitchen-col-empty">—</div>';
  return '<div class="kitchen-col">' +
    '<div class="kitchen-col-head kitchen-col-' + estado + '">' + titulo +
    ' <span class="kitchen-col-count">' + lista.length + '</span></div>' +
    '<div class="kitchen-col-body">' + cards + '</div>' +
    '</div>';
}

// Tablero de una estación (3 columnas por estado)
App.Views._estacion = async function (area) {
  var est = App.Estaciones.get(area);
  var tickets = await _ticketsDe(area);
  if (tickets.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">' + est.icono + '</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes en ' + App.Utils.esc(est.nombre) + '</div></div>';
  }
  var cols = { enviada: [], preparando: [], lista: [] };
  tickets.forEach(function (tk) { cols[tk.estado].push(tk); });
  return '<div class="cocina-board">' +
    _columnHtml('🔔 Enviados', 'enviada', cols.enviada) +
    _columnHtml('🔥 Preparando', 'preparando', cols.preparando) +
    _columnHtml('✅ Listos', 'lista', cols.lista) +
    '</div>';
};

// ===== Pase (admin): todas las estaciones lado a lado =====
App.Views.pase = async function (params) {
  params = params || {};
  var estaciones = App.Estaciones.list();
  var filtro = params.estacion && App.Estaciones.exists(params.estacion) ? params.estacion : null;
  var todos = await _ticketsDe(null);

  var pendientesPor = {};
  todos.forEach(function (tk) {
    if (tk.estado !== 'lista') pendientesPor[tk.area] = (pendientesPor[tk.area] || 0) + 1;
  });

  var tabs = '<div class="cat-tabs pase-tabs">' +
    '<button class="cat-tab ' + (!filtro ? 'active' : '') + '" onclick="App.Actions.paseFiltro(null)">Todas</button>' +
    estaciones.map(function (e) {
      var n = pendientesPor[e.id] || 0;
      return '<button class="cat-tab ' + (filtro === e.id ? 'active' : '') + '" onclick="App.Actions.paseFiltro(\'' + e.id + '\')">' +
        e.icono + ' ' + App.Utils.esc(e.nombre) + (n ? ' <span class="tab-count">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>';

  if (filtro) return tabs + await App.Views._estacion(filtro);

  if (todos.length === 0) {
    return tabs + '<div class="empty-state"><div class="empty-state-icon">🧑‍🍳</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes</div></div>';
  }

  // Columnas por estación; dentro, ordenado por estado y antigüedad
  var prioridad = { enviada: 0, preparando: 1, lista: 2 };
  var html = '<div class="pase-board" style="--pase-cols:' + estaciones.length + '">';
  estaciones.forEach(function (e) {
    var lista = todos.filter(function (tk) { return tk.area === e.id; })
      .sort(function (a, b) { return (prioridad[a.estado] - prioridad[b.estado]) || (a.enviadaAt - b.enviadaAt); });
    html += '<div class="kitchen-col">' +
      '<div class="kitchen-col-head pase-col-head">' + e.icono + ' ' + App.Utils.esc(e.nombre) +
      ' <span class="kitchen-col-count">' + lista.length + '</span></div>' +
      '<div class="kitchen-col-body">' + (lista.length ? lista.map(_cardHtml).join('') : '<div class="kitchen-col-empty">—</div>') + '</div>' +
      '</div>';
  });
  html += '</div>';
  return tabs + html;
};

App.Actions.paseFiltro = function (estacion) {
  App.Store.setState({ params: Object.assign({}, App.Store.state.params, { estacion: estacion }) });
};

// ===== Acciones de estación (atómicas) =====
async function _updateTanda(comandaId, tandaId, fn) {
  var tandaFinal = null;
  var res = await App.DB.update('comandas', comandaId, function (comanda) {
    tandaFinal = null;
    var t = (comanda.tandas || []).filter(function (x) { return x.id === tandaId; })[0];
    if (!t) return false;
    if (fn(t) === false) return false;
    tandaFinal = t;
  });
  return res ? tandaFinal : null;
}

App.Actions.iniciarPreparacion = async function (comandaId, tandaId) {
  var now = Date.now();
  var t = await _updateTanda(comandaId, tandaId, function (t) {
    if (t.estado !== 'enviada') return false;
    t.estado = 'preparando';
    t.preparandoAt = now;
  });
  if (t) App.Utils.alertEvent('preparando', 'Preparación iniciada', 'info');
  App.render();
};

App.Actions.marcarLista = async function (comandaId, tandaId) {
  var now = Date.now();
  var t = await _updateTanda(comandaId, tandaId, function (t) {
    if (t.estado !== 'enviada' && t.estado !== 'preparando') return false;
    if (!t.preparandoAt) t.preparandoAt = now;
    t.estado = 'lista';
    t.listaAt = now;
    t.items.forEach(function (it) { if (!it.anulado) it.listo = true; });
  });
  if (t) App.Utils.alertEvent('listo', 'Pedido listo para servir ' + App.Estaciones.get(App.Estaciones.tandaArea(t)).icono, 'success');
  App.render();
};

// Marca/desmarca UNA línea como lista. Si estaba "enviada" pasa a
// "preparando"; si todas las activas quedan listas, la tanda pasa a "lista".
App.Actions.toggleItemListo = async function (comandaId, tandaId, idx) {
  var now = Date.now();
  var t = await _updateTanda(comandaId, tandaId, function (t) {
    if (t.estado !== 'enviada' && t.estado !== 'preparando') return false;
    var it = t.items[idx];
    if (!it || it.anulado) return false;
    it.listo = !it.listo;
    if (t.estado === 'enviada') { t.estado = 'preparando'; t.preparandoAt = now; }
    App._recalcularTanda(t, now);
  });
  if (t && t.estado === 'lista') {
    App.Utils.alertEvent('listo', 'Pedido listo para servir ' + App.Estaciones.get(App.Estaciones.tandaArea(t)).icono, 'success');
  }
  App.render();
};
