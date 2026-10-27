// cocina.js — kitchen display view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.cocina = async function () {
  var user = App.Auth.getCurrentUser();
  var allComandas = await App.DB.getAll('comandas');
  var active = allComandas.filter(function (c) {
    return c.estado === 'enviada' || c.estado === 'preparando' || c.estado === 'lista';
  });

  // Sort: enviada → preparando → lista, then oldest first
  var order = { enviada: 0, preparando: 1, lista: 2 };
  active.sort(function (a, b) {
    if (order[a.estado] !== order[b.estado]) return order[a.estado] - order[b.estado];
    return a.fecha - b.fecha;
  });

  if (active.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">👨‍🍳</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes</div></div>';
  }

  var mesas = await App.DB.getAll('mesas');
  var mesaMap = {};
  mesas.forEach(function (m) { mesaMap[m.id] = m; });

  var html = '<div class="cocina-grid">';
  for (var i = 0; i < active.length; i++) {
    var comanda = active[i];
    var mesa = mesaMap[comanda.mesaId];

    // Delay coloring based on time since sent to kitchen
    var refTime = comanda.enviadaAt || comanda.fecha;
    var mins = Math.floor((Date.now() - refTime) / 60000);
    var delayClass = '';
    if (comanda.estado !== 'lista') {
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
    if (comanda.estado === 'enviada') {
      actionBtn = '<button class="btn btn-secondary btn-sm" onclick="App.Actions.iniciarPreparacion(\'' + comanda.id + '\')">Iniciar preparación</button>';
    } else if (comanda.estado === 'preparando') {
      actionBtn = '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + comanda.id + '\')">Marcar listo ✓</button>';
    } else { // lista
      actionBtn = '<button class="btn btn-primary btn-sm" onclick="App.Actions.marcarServido(\'' + comanda.id + '\')">Servido 🍽️</button>';
    }

    var mozoTag = comanda.mozoName
      ? '<span class="kitchen-mozo">👤 ' + App.Utils.esc(comanda.mozoName) + '</span>' : '';

    html +=
      '<div class="kitchen-card ' + comanda.estado + delayClass + '">' +
      '<div class="kitchen-card-header">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span class="kitchen-mesa">Mesa ' + (mesa ? mesa.numero : '?') + '</span>' +
      '<span class="badge badge-' + comanda.estado + '">' + comanda.estado + '</span>' +
      mozoTag +
      '</div>' +
      '<span class="kitchen-time">⏱ ' + App.Utils.timeAgo(refTime) + '</span>' +
      '</div>' +
      itemsHtml +
      '<div class="kitchen-actions">' + actionBtn + '</div>' +
      '</div>';
  }
  html += '</div>';
  return html;
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
