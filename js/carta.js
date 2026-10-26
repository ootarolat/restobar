// carta.js — menu management view and CRUD actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.carta = async function (params) {
  var categorias = await App.DB.getAll('categorias');
  categorias.sort(function (a, b) { return a.orden - b.orden; });

  if (categorias.length === 0) {
    return '<div class="view"><div class="empty-state"><div class="empty-state-icon">📋</div>' +
      '<div class="empty-state-text">No hay categorías. Usa "Reiniciar datos" en Configuración.</div></div></div>';
  }

  var selectedCat = params.catId || categorias[0].id;
  var allProductos = await App.DB.getAll('productos');
  var productos = allProductos.filter(function (p) { return p.categoriaId === selectedCat; });
  var isAdmin = App.Store.state.userRole === 'admin';

  // Category tabs
  var catTabs = '<div class="cat-tabs">';
  categorias.forEach(function (cat) {
    catTabs += '<button class="cat-tab ' + (cat.id === selectedCat ? 'active' : '') + '" ' +
      'onclick="App.Actions.selectCatCarta(\'' + cat.id + '\')">' + App.Utils.esc(cat.nombre) + '</button>';
  });
  catTabs += '</div>';

  // Product list
  var list = '<div class="carta-list">';
  if (productos.length === 0) {
    list += '<div class="empty-state"><div class="empty-state-text">Sin productos en esta categoría</div></div>';
  } else {
    productos.forEach(function (p) {
      list +=
        '<div class="carta-item">' +
        '<div class="carta-item-info">' +
        '<div class="carta-item-nombre">' + App.Utils.esc(p.nombre) +
        (p.disponible ? '' : ' <span class="badge badge-ocupada">No disp.</span>') + '</div>' +
        '<div class="carta-item-meta">' + App.Utils.esc(p.descripcion || '') + '</div>' +
        '</div>' +
        '<div class="carta-item-precio">' + App.Utils.formatCLP(p.precio) + '</div>' +
        (isAdmin ? '<div class="carta-item-actions">' +
        '<button class="icon-btn" onclick="App.Actions.editarProducto(\'' + p.id + '\')">✏️</button>' +
        '<button class="icon-btn danger" onclick="App.Actions.eliminarProducto(\'' + p.id + '\')">🗑</button>' +
        '</div>' : '') +
        '</div>';
    });
  }
  list += '</div>';

  var addBtn = isAdmin ? '<div style="padding:0 16px calc(16px + var(--safe-bottom))">' +
    '<button class="btn btn-primary btn-block" onclick="App.Actions.nuevoProducto(\'' + selectedCat + '\')">+ Agregar producto</button>' +
    '</div>' : '';

  return '<div class="view" style="padding-bottom:0">' +
    '<div class="view-title">Carta</div>' +
    '<div class="view-subtitle">' + productos.length + ' productos</div>' +
    '</div>' + catTabs + list + addBtn;
};

App.Actions.selectCatCarta = function (catId) {
  var params = Object.assign({}, App.Store.state.params, { catId: catId });
  App.Store.setState({ params: params });
};

App.Actions.nuevoProducto = function (defaultCatId) {
  App.Actions._editarProductoForm(null, defaultCatId);
};

App.Actions.editarProducto = function (productoId) {
  App.Actions._editarProductoForm(productoId, null);
};

App.Actions._editarProductoForm = async function (productoId, defaultCatId) {
  var producto = productoId ? await App.DB.get('productos', productoId) : null;
  var categorias = await App.DB.getAll('categorias');
  categorias.sort(function (a, b) { return a.orden - b.orden; });

  var currentCat = producto ? producto.categoriaId : defaultCatId;
  var catOptions = categorias.map(function (c) {
    return '<option value="' + c.id + '"' + (c.id === currentCat ? ' selected' : '') + '>' +
      App.Utils.esc(c.nombre) + '</option>';
  }).join('');

  var dispClass = producto ? (producto.disponible ? 'on' : '') : 'on';

  App.Utils.modal(
    '<div class="modal-header">' +
    '<span class="modal-title">' + (producto ? 'Editar producto' : 'Nuevo producto') + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button>' +
    '</div>' +
    '<div class="modal-body"><div class="config-form">' +
    '<div class="form-group"><label class="form-label">Nombre</label>' +
    '<input type="text" id="prod-nombre" class="form-input" value="' + (producto ? App.Utils.esc(producto.nombre) : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Categoría</label>' +
    '<select id="prod-categoria" class="form-select">' + catOptions + '</select></div>' +
    '<div class="form-group"><label class="form-label">Precio (CLP)</label>' +
    '<input type="number" id="prod-precio" class="form-input" value="' + (producto ? producto.precio : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Descripción</label>' +
    '<input type="text" id="prod-desc" class="form-input" value="' + (producto ? App.Utils.esc(producto.descripcion || '') : '') + '"></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Disponible</span>' +
    '<button class="toggle ' + dispClass + '" id="prod-disponible-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.guardarProducto(\'' + (productoId || '') + '\')">Guardar</button>' +
    '</div>'
  );
};

App.Actions.guardarProducto = async function (productoId) {
  var nombre = document.getElementById('prod-nombre').value.trim();
  var categoriaId = document.getElementById('prod-categoria').value;
  var precio = parseFloat(document.getElementById('prod-precio').value) || 0;
  var descripcion = document.getElementById('prod-desc').value.trim();
  var disponible = document.getElementById('prod-disponible-toggle').classList.contains('on');

  if (!nombre || precio <= 0) {
    App.Utils.toast('Completa nombre y precio', 'error');
    return;
  }

  if (productoId) {
    var producto = await App.DB.get('productos', productoId);
    producto.nombre = nombre;
    producto.categoriaId = categoriaId;
    producto.precio = precio;
    producto.descripcion = descripcion;
    producto.disponible = disponible;
    await App.DB.put('productos', producto);
    App.Utils.toast('Producto actualizado', 'success');
  } else {
    await App.DB.put('productos', {
      id: App.Utils.uid('prod'),
      nombre: nombre,
      categoriaId: categoriaId,
      precio: precio,
      descripcion: descripcion,
      disponible: disponible,
    });
    App.Utils.toast('Producto creado', 'success');
  }

  App.Utils.closeModal();
  App.render();
};

App.Actions.eliminarProducto = function (productoId) {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Eliminar producto?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Esta acción no se puede deshacer.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.confirmarEliminarProducto(\'' + productoId + '\')">Eliminar</button>' +
    '</div>'
  );
};

App.Actions.confirmarEliminarProducto = async function (productoId) {
  await App.DB.remove('productos', productoId);
  App.Utils.closeModal();
  App.Utils.toast('Producto eliminado', 'info');
  App.render();
};
