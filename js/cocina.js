// cocina.js — kitchen display view (column layout, per-tanda cards)
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.cocina = async function () {
  var allComandas = await App.DB.getAll('comandas');
  var mesas = await App.DB.getAll('mesas');
  var mesaMap = {};
  mesas.forEach(function (m) { mesaMap[m.id] = m; });

  // Flatten tandas from all comandas into kitchen "tickets"
  var tickets = [];
  allComandas.forEach(function (c) {
    (c.tandas || []).forEach(function (t) {
      if (t.estado === 'enviada' || t.estado === 'preparando' || t.estado === 'lista') {
        tickets.push({
          comandaId: c.id,
          tandaId: t.id,
          numero: t.numero,
          mesaNumero: mesaMap[c.mesaId] ? mesaMap[c.mesaId].numero : '?',
          mozoName: c.mozoName,
          items: t.items,
          estado: t.estado,
          enviadaAt: t.enviadaAt,
        });
      }
    });
  });

  var cols = { enviada: [], preparando: [], lista: [] };
  tickets.forEach(function (tk) { cols[tk.estado].push(tk); });
  Object.keys(cols).forEach(function (k) {
    cols[k].sort(function (a, b) { return a.enviadaAt - b.enviadaAt; });
  });

  var total = tickets.length;
  if (total === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">👨‍🍳</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes</div></div>';
  }

  function cardHtml(tk) {
    var mins = Math.floor((Date.now() - tk.enviadaAt) / 60000);
    var delayClass = '';
    if (tk.estado !== 'lista') {
      if (mins >= 15) delayClass = ' delay-high';
      else if (mins >= 8) delayClass = ' delay-mid';
    }

    var itemsHtml = '<div class="kitchen-items">';
    tk.items.forEach(function (item) {
      itemsHtml +=
        '<div class="kitchen-item">' +
        '<span class="kitchen-item-qty">' + item.cantidad + 'x</span>' +
        '<span>' + App.Utils.esc(item.nombre) + '</span>' +
        (item.notas ? '<div class="kitchen-item-notas" style="margin-left:36px">→ ' + App.Utils.esc(item.notas) + '</div>' : '') +
        '</div>';
    });
    itemsHtml += '</div>';

    // Cocina solo controla enviada→preparando→lista. "Servido" lo hace el mozo.
    var actionBtn = '';
    if (tk.estado === 'enviada') {
      actionBtn = '<button class="btn btn-secondary btn-sm" onclick="App.Actions.iniciarPreparacion(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\')">Iniciar ▶</button>';
    } else if (tk.estado === 'preparando') {
      actionBtn = '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + tk.comandaId + '\',\'' + tk.tandaId + '\')">Listo ✓</button>';
    } else {
      // lista: informativo, esperando que el mozo sirva
      var quien = tk.mozoName ? App.Utils.esc(tk.mozoName) : 'el mozo';
      actionBtn = '<span class="kitchen-waiting">Listo · esperando a ' + quien + '</span>';
    }

    var mozoTag = tk.mozoName
      ? '<span class="kitchen-mozo">👤 ' + App.Utils.esc(tk.mozoName) + '</span>' : '';

    return '<div class="kitchen-card ' + tk.estado + delayClass + '">' +
      '<div class="kitchen-card-header">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span class="kitchen-mesa">Mesa ' + tk.mesaNumero + '</span>' +
      '<span class="kitchen-tanda">T' + tk.numero + '</span>' +
      mozoTag +
      '</div>' +
      '<span class="kitchen-time">⏱ ' + App.Utils.timeAgo(tk.enviadaAt) + '</span>' +
      '</div>' +
      itemsHtml +
      '<div class="kitchen-actions">' + actionBtn + '</div>' +
      '</div>';
  }

  function columnHtml(titulo, estado, lista) {
    var cards = lista.length
      ? lista.map(cardHtml).join('')
      : '<div class="kitchen-col-empty">—</div>';
    return '<div class="kitchen-col">' +
      '<div class="kitchen-col-head kitchen-col-' + estado + '">' + titulo +
      ' <span class="kitchen-col-count">' + lista.length + '</span></div>' +
      '<div class="kitchen-col-body">' + cards + '</div>' +
      '</div>';
  }

  return '<div class="cocina-board">' +
    columnHtml('🔔 Enviados', 'enviada', cols.enviada) +
    columnHtml('🔥 Preparando', 'preparando', cols.preparando) +
    columnHtml('✅ Listos', 'lista', cols.lista) +
    '</div>';
};

// Helpers to update a specific tanda inside a comanda
async function _setTandaEstado(comandaId, tandaId, estado, timeField) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || !comanda.tandas) return null;
  var changed = false;
  comanda.tandas.forEach(function (t) {
    if (t.id === tandaId) {
      t.estado = estado;
      if (timeField) t[timeField] = Date.now();
      changed = true;
    }
  });
  if (changed) await App.DB.put('comandas', comanda);
  return comanda;
}

App.Actions.iniciarPreparacion = async function (comandaId, tandaId) {
  var c = await _setTandaEstado(comandaId, tandaId, 'preparando', 'preparandoAt');
  if (c) App.Utils.alertEvent('preparando', 'Preparación iniciada', 'info');
  App.render();
};

App.Actions.marcarLista = async function (comandaId, tandaId) {
  var c = await _setTandaEstado(comandaId, tandaId, 'lista', 'listaAt');
  if (c) App.Utils.alertEvent('listo', 'Pedido listo para servir 🍽️', 'success');
  App.render();
};
