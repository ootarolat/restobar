// cocina.js — kitchen display view and actions (column layout)
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.cocina = async function () {
  var allComandas = await App.DB.getAll('comandas');
  var mesas = await App.DB.getAll('mesas');
  var mesaMap = {};
  mesas.forEach(function (m) { mesaMap[m.id] = m; });

  var cols = {
    enviada: [],
    preparando: [],
    lista: [],
  };
  allComandas.forEach(function (c) {
    if (cols[c.estado]) cols[c.estado].push(c);
  });
  Object.keys(cols).forEach(function (k) {
    cols[k].sort(function (a, b) { return (a.enviadaAt || a.fecha) - (b.enviadaAt || b.fecha); });
  });

  var totalActivos = cols.enviada.length + cols.preparando.length + cols.lista.length;

  if (totalActivos === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">👨‍🍳</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes</div></div>';
  }

  function cardHtml(comanda, estado) {
    var mesa = mesaMap[comanda.mesaId];
    var refTime = comanda.enviadaAt || comanda.fecha;
    var mins = Math.floor((Date.now() - refTime) / 60000);
    var delayClass = '';
    if (estado !== 'lista') {
      if (mins >= 15) delayClass = ' delay-high';
      else if (mins >= 8) delayClass = ' delay-mid';
    }

    var itemsHtml = '<div class="kitchen-items">';
    comanda.items.forEach(function (item) {
      itemsHtml +=
        '<div class="kitchen-item">' +
        '<span class="kitchen-item-qty">' + item.cantidad + 'x</span>' +
        '<span>' + App.Utils.esc(item.nombre) + '</span>' +
        (item.notas ? '<div class="kitchen-item-notas" style="margin-left:36px">→ ' + App.Utils.esc(item.notas) + '</div>' : '') +
        '</div>';
    });
    itemsHtml += '</div>';

    var actionBtn;
    if (estado === 'enviada') {
      actionBtn = '<button class="btn btn-secondary btn-sm" onclick="App.Actions.iniciarPreparacion(\'' + comanda.id + '\')">Iniciar ▶</button>';
    } else if (estado === 'preparando') {
      actionBtn = '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + comanda.id + '\')">Listo ✓</button>';
    } else {
      actionBtn = '<button class="btn btn-primary btn-sm" onclick="App.Actions.marcarServido(\'' + comanda.id + '\')">Servido 🍽️</button>';
    }

    var mozoTag = comanda.mozoName
      ? '<span class="kitchen-mozo">👤 ' + App.Utils.esc(comanda.mozoName) + '</span>' : '';

    return '<div class="kitchen-card ' + estado + delayClass + '">' +
      '<div class="kitchen-card-header">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span class="kitchen-mesa">Mesa ' + (mesa ? mesa.numero : '?') + '</span>' +
      mozoTag +
      '</div>' +
      '<span class="kitchen-time">⏱ ' + App.Utils.timeAgo(refTime) + '</span>' +
      '</div>' +
      itemsHtml +
      '<div class="kitchen-actions">' + actionBtn + '</div>' +
      '</div>';
  }

  function columnHtml(titulo, estado, lista) {
    var cards = lista.length
      ? lista.map(function (c) { return cardHtml(c, estado); }).join('')
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

App.Actions.iniciarPreparacion = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  comanda.estado = 'preparando';
  comanda.preparandoAt = Date.now();
  await App.DB.put('comandas', comanda);
  App.Utils.alertEvent('preparando', 'Preparación iniciada', 'info');
  App.render();
};

App.Actions.marcarLista = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  comanda.estado = 'lista';
  comanda.listaAt = Date.now();
  await App.DB.put('comandas', comanda);
  App.Utils.alertEvent('listo', 'Pedido listo para servir 🍽️', 'success');
  App.render();
};

App.Actions.marcarServido = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  // Vuelve a estado "abierta" para poder seguir agregando/cobrar,
  // pero registra que ya se sirvió esta ronda.
  comanda.estado = 'abierta';
  comanda.servidoAt = Date.now();
  await App.DB.put('comandas', comanda);
  App.Utils.toast('Marcado como servido', 'info');
  App.render();
};
