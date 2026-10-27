// comanda.js — order taking view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.comanda = async function (params) {
  const comanda = await App.DB.get('comandas', params.comandaId);
  if (!comanda) {
    App.Utils.toast('Comanda no encontrada', 'error');
    App.Store.navigate('mesas');
    return '';
  }

  const categorias = await App.DB.getAll('categorias');
  categorias.sort((a, b) => a.orden - b.orden);
  if (categorias.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No hay categorías. Configura la carta primero.</div></div>';
  }

  const selectedCat = params.catId || categorias[0].id;
  const allProductos = await App.DB.getAll('productos');
  const productos = allProductos.filter(function (p) { return p.categoriaId === selectedCat; });

  // Category tabs
  let catTabs = '<div class="cat-tabs">';
  categorias.forEach(function (cat) {
    catTabs +=
      '<button class="cat-tab ' + (cat.id === selectedCat ? 'active' : '') + '" ' +
      'onclick="App.Actions.selectCat(\'' + cat.id + '\')">' +
      App.Utils.esc(cat.nombre) + '</button>';
  });
  catTabs += '</div>';

  // Product grid
  let productGrid = '<div class="product-grid">';
  if (productos.length === 0) {
    productGrid += '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-text">Sin productos en esta categoría</div></div>';
  } else {
    productos.forEach(function (p) {
      productGrid +=
        '<div class="product-card ' + (p.disponible ? '' : 'no-disponible') + '" ' +
        'onclick="' + (p.disponible ? 'App.Actions.addProduct(\'' + p.id + '\', \'' + params.comandaId + '\')' : '') + '">' +
        '<div class="product-nombre">' + App.Utils.esc(p.nombre) + '</div>' +
        (p.descripcion ? '<div class="product-desc">' + App.Utils.esc(p.descripcion) + '</div>' : '') +
        '<div class="product-precio">' + App.Utils.formatCLP(p.precio) + '</div>' +
        '</div>';
    });
  }
  productGrid += '</div>';

  // Order bar
  const itemCount = comanda.items.reduce(function (t, i) { return t + i.cantidad; }, 0);
  const total = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);

  let orderBar = '';
  if (itemCount > 0) {
    orderBar =
      '<div class="order-bar" onclick="App.Actions.verOrden(\'' + params.comandaId + '\', \'' + params.mesaId + '\')">' +
      '<div class="order-bar-info">' +
      '<span class="order-bar-icon">📋</span>' +
      '<div class="order-bar-text">' +
      '<span class="order-bar-count">' + itemCount + (itemCount === 1 ? ' item' : ' items') + '</span>' +
      '<span class="order-bar-total">' + App.Utils.formatCLP(total) + '</span>' +
      '</div></div>' +
      '<span class="order-bar-arrow">Ver Orden →</span>' +
      '</div>';
  }

  return catTabs + productGrid + orderBar;
};

App.Actions.selectCat = function (catId) {
  var params = Object.assign({}, App.Store.state.params, { catId: catId });
  App.Store.setState({ params: params });
};

App.Actions.addProduct = async function (productoId, comandaId) {
  var producto = await App.DB.get('productos', productoId);
  if (!producto || !producto.disponible) return;

  var comanda = await App.DB.get('comandas', comandaId);
  var existing = null;
  for (var i = 0; i < comanda.items.length; i++) {
    if (comanda.items[i].productoId === productoId) { existing = i; break; }
  }
  if (existing !== null) {
    comanda.items[existing].cantidad += 1;
  } else {
    comanda.items.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad: 1,
      precio: producto.precio,
      notas: '',
    });
  }
  await App.DB.put('comandas', comanda);
  App.render();
};

App.Actions.verOrden = async function (comandaId, mesaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || comanda.items.length === 0) {
    App.Utils.toast('La orden está vacía', 'info');
    return;
  }

  var settings = App.Store.state.settings;
  var subtotal = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
  var ivaIncluido = settings.preciosIncluyenIva !== false;
  var iva = ivaIncluido ? Math.round(subtotal * settings.ivaRate / (100 + settings.ivaRate)) : Math.round(subtotal * settings.ivaRate / 100);

  var itemsHtml = '<div class="order-items">';
  comanda.items.forEach(function (item, idx) {
    itemsHtml +=
      '<div class="order-item">' +
      '<div class="order-item-info">' +
      '<div class="order-item-nombre">' + item.cantidad + 'x ' + App.Utils.esc(item.nombre) + '</div>' +
      '<input type="text" class="form-input" style="margin-top:6px;padding:6px 10px;font-size:12px" ' +
      'placeholder="Notas (ej: sin cebolla)..." value="' + App.Utils.esc(item.notas || '') + '" ' +
      'onchange="App.Actions.setItemNota(\'' + comandaId + '\',' + idx + ',this.value)">' +
      '</div>' +
      '<div class="order-item-precio">' + App.Utils.formatCLP(item.cantidad * item.precio) + '</div>' +
      '<div class="qty-control">' +
      '<button class="qty-btn" onclick="App.Actions.changeQty(\'' + comandaId + '\',' + idx + ',-1)">−</button>' +
      '<span class="qty-display">' + item.cantidad + '</span>' +
      '<button class="qty-btn" onclick="App.Actions.changeQty(\'' + comandaId + '\',' + idx + ',1)">+</button>' +
      '</div>' +
      '</div>';
  });
  itemsHtml += '</div>';

  var totalsHtml =
    '<div class="totals">' +
    '<div class="total-row"><span class="label">Subtotal</span><span class="value">' + App.Utils.formatCLP(subtotal) + '</span></div>' +
    '<div class="total-row"><span class="label">IVA ' + (ivaIncluido ? 'incluido ' : '') + '(' + settings.ivaRate + '%)</span><span class="value">' + App.Utils.formatCLP(iva) + '</span></div>' +
    '</div>';

  var liberarBtn =
    '<div style="text-align:center;padding-top:8px">' +
    '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" ' +
    'onclick="App.Actions.liberarMesaPrompt(\'' + mesaId + '\',\'' + comandaId + '\')">Liberar Mesa</button>' +
    '</div>';

  var footer =
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Agregar más</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.enviarCocina(\'' + comandaId + '\')">Enviar a Cocina</button>' +
    '<button class="btn btn-success" onclick="App.Actions.irACuenta(\'' + comandaId + '\',\'' + mesaId + '\')">Cerrar Cuenta</button>' +
    '</div>';

  App.Utils.modal(
    '<div class="modal-header">' +
    '<span class="modal-title">Orden</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button>' +
    '</div>' +
    '<div class="modal-body">' + itemsHtml + totalsHtml + liberarBtn + '</div>' +
    footer
  );
};

App.Actions.changeQty = async function (comandaId, idx, delta) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda.items[idx]) return;
  comanda.items[idx].cantidad += delta;
  if (comanda.items[idx].cantidad <= 0) {
    comanda.items.splice(idx, 1);
  }
  await App.DB.put('comandas', comanda);
  App.Utils.closeModal();
  // Re-open modal if items remain, else just re-render
  if (comanda.items.length > 0) {
    var mesaId = App.Store.state.params.mesaId;
    App.Actions.verOrden(comandaId, mesaId);
  }
  App.render();
};

App.Actions.setItemNota = async function (comandaId, idx, value) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (comanda.items[idx]) {
    comanda.items[idx].notas = value;
    await App.DB.put('comandas', comanda);
  }
};

App.Actions.enviarCocina = async function (comandaId) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || comanda.items.length === 0) return;
  comanda.estado = 'enviada';
  comanda.enviadaAt = Date.now();
  await App.DB.put('comandas', comanda);
  App.Utils.closeModal();
  App.Utils.alertEvent('cocina', 'Enviado a cocina 🍳', 'success');
};

App.Actions.irACuenta = function (comandaId, mesaId) {
  App.Utils.closeModal();
  App.Store.navigate('cuenta', { comandaId: comandaId, mesaId: mesaId });
};

App.Actions.liberarMesaPrompt = function (mesaId, comandaId) {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Liberar mesa?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se cancelará la comanda actual y la mesa quedará libre. ' +
    'Los items no cobrados se perderán.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.liberarMesa(\'' + mesaId + '\',\'' + comandaId + '\')">Liberar Mesa</button>' +
    '</div>'
  );
};

App.Actions.liberarMesa = async function (mesaId, comandaId) {
  var mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;

  // Solo el mozo dueño o un admin pueden liberar la mesa
  var user = App.Auth.getCurrentUser();
  var isAdmin = user && user.role === 'admin';
  if (!isAdmin && user && mesa.mozoUid && mesa.mozoUid !== user.uid && mesa.mozoUid !== 'reassigned') {
    App.Utils.closeModal();
    App.Utils.toast('Solo ' + (mesa.mozoName || 'el mozo asignado') + ' puede liberar esta mesa', 'error');
    return;
  }

  mesa.estado = 'libre';
  mesa.comandaId = null;
  mesa.mozoUid = null;
  mesa.mozoName = null;
  await App.DB.put('mesas', mesa);
  if (comandaId) {
    await App.DB.remove('comandas', comandaId);
  }
  App.Utils.closeModal();
  App.Utils.toast('Mesa liberada', 'info');
  App.Store.navigate('mesas');
};

App.Actions.volverMesas = function () {
  App.Store.navigate('mesas');
};
