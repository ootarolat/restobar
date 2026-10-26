// cocina.js — kitchen display view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.cocina = async function () {
  var allComandas = await App.DB.getAll('comandas');
  var active = allComandas.filter(function (c) {
    return c.estado === 'enviada' || c.estado === 'preparando';
  });

  // Sort: enviada first, then by oldest first
  active.sort(function (a, b) {
    if (a.estado !== b.estado) return a.estado === 'enviada' ? -1 : 1;
    return a.fecha - b.fecha;
  });

  if (active.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">👨‍🍳</div>' +
      '<div class="empty-state-text">No hay pedidos pendientes</div></div>';
  }

  // Load mesas for display
  var mesas = await App.DB.getAll('mesas');
  var mesaMap = {};
  mesas.forEach(function (m) { mesaMap[m.id] = m; });

  var html = '<div class="cocina-grid">';
  for (var i = 0; i < active.length; i++) {
    var comanda = active[i];
    var mesa = mesaMap[comanda.mesaId];

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
    } else {
      actionBtn = '<button class="btn btn-success btn-sm" onclick="App.Actions.marcarLista(\'' + comanda.id + '\')">Marcar listo ✓</button>';
    }

    html +=
      '<div class="kitchen-card ' + comanda.estado + '">' +
      '<div class="kitchen-card-header">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<span class="kitchen-mesa">Mesa ' + (mesa ? mesa.numero : '?') + '</span>' +
      '<span class="badge badge-' + comanda.estado + '">' + comanda.estado + '</span>' +
      '</div>' +
      '<span class="kitchen-time">⏱ ' + App.Utils.timeAgo(comanda.fecha) + '</span>' +
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
  await App.DB.put('comandas', comanda);
  App.render();
};

App.Actions.marcarLista = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  comanda.estado = 'lista';
  await App.DB.put('comandas', comanda);
  App.Utils.toast('Pedido listo para servir 🍽️', 'success');
  App.render();
};
