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
  var catSel = categorias.filter(function (c) { return c.id === selectedCat; })[0];
  var catArea = App.Estaciones.areaDe(null, catSel);

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
        (p.disponible ? '' : ' <span class="badge badge-ocupada">No disp.</span>') +
        (p.area && App.Estaciones.exists(p.area) && p.area !== catArea ? ' <span class="tag-area">' + App.Estaciones.label(p.area) + '</span>' : '') +
        (p.despachoDirecto ? ' <span class="tag-directo">⚡ directo</span>' : '') + '</div>' +
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

  // Estación de la categoría seleccionada (+ edición para admin)
  var catInfo = '<div class="carta-cat-info">' +
    '<span>Se prepara en <strong>' + App.Estaciones.label(catArea) + '</strong>' +
    (catSel && !catSel.area ? ' <span class="text-muted">(sugerido)</span>' : '') + '</span>' +
    (isAdmin ? '<span class="flex gap-8">' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.editarCategoria(\'' + selectedCat + '\')">✏️ Categoría</button>' +
      '<button class="btn btn-outline btn-sm" onclick="App.Actions.editarCategoria(null)">+ Categoría</button>' +
      '</span>' : '') +
    '</div>';

  return '<div class="view" style="padding-bottom:0">' +
    '<div class="view-title">Carta</div>' +
    '<div class="view-subtitle">' + productos.length + ' productos</div>' +
    '</div>' + catTabs + catInfo + list + addBtn;
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

  // Área: vacío = hereda de la categoría
  var prodArea = producto && producto.area ? producto.area : '';
  var areaOptions = '<option value=""' + (!prodArea ? ' selected' : '') + '>Según la categoría</option>' +
    App.Estaciones.list().map(function (e) {
      return '<option value="' + e.id + '"' + (prodArea === e.id ? ' selected' : '') + '>' +
        e.icono + ' ' + App.Utils.esc(e.nombre) + '</option>';
    }).join('');

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
    '<div class="form-group"><label class="form-label">Se prepara en</label>' +
    '<select id="prod-area" class="form-select">' + areaOptions + '</select></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Disponible</span>' +
    '<button class="toggle ' + dispClass + '" id="prod-disponible-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">⚡ Despacho directo <span class="text-muted text-sm">(no requiere preparación: lata, agua...)</span></span>' +
    '<button class="toggle ' + (producto && producto.despachoDirecto ? 'on' : '') + '" id="prod-directo-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
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
  var area = document.getElementById('prod-area').value || null;
  var despachoDirecto = document.getElementById('prod-directo-toggle').classList.contains('on');

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
    producto.area = area;
    producto.despachoDirecto = despachoDirecto;
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
      area: area,
      despachoDirecto: despachoDirecto,
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

// ===== Categorías: nombre y estación donde se preparan sus productos =====
App.Actions.editarCategoria = async function (catId) {
  var cat = catId ? await App.DB.get('categorias', catId) : null;
  var area = cat ? App.Estaciones.areaDe(null, cat) : App.Estaciones.principal();
  var options = App.Estaciones.list().map(function (e) {
    return '<option value="' + e.id + '"' + (area === e.id ? ' selected' : '') + '>' +
      e.icono + ' ' + App.Utils.esc(e.nombre) + '</option>';
  }).join('');

  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">' + (cat ? 'Editar categoría' : 'Nueva categoría') + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><div class="config-form">' +
    '<div class="form-group"><label class="form-label">Nombre</label>' +
    '<input type="text" id="cat-nombre" class="form-input" value="' + (cat ? App.Utils.esc(cat.nombre) : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Se prepara en</label>' +
    '<select id="cat-area" class="form-select">' + options + '</select></div>' +
    '<p class="text-muted text-sm">Los productos de esta categoría se envían a esa estación (salvo que el producto indique otra).</p>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.guardarCategoria(\'' + (catId || '') + '\')">Guardar</button>' +
    '</div>'
  );
};

App.Actions.guardarCategoria = async function (catId) {
  var nombre = document.getElementById('cat-nombre').value.trim();
  var area = document.getElementById('cat-area').value;
  if (!nombre) { App.Utils.toast('Ingresa un nombre', 'error'); return; }
  if (catId) {
    var cat = await App.DB.get('categorias', catId);
    if (!cat) return;
    cat.nombre = nombre;
    cat.area = area;
    await App.DB.put('categorias', cat);
    App.Utils.toast('Categoría actualizada', 'success');
  } else {
    var cats = await App.DB.getAll('categorias');
    var orden = cats.reduce(function (m, c) { return Math.max(m, c.orden || 0); }, 0) + 1;
    var id = App.Utils.uid('cat');
    await App.DB.put('categorias', { id: id, nombre: nombre, orden: orden, area: area });
    App.Utils.toast('Categoría creada', 'success');
    App.Store.state.params = Object.assign({}, App.Store.state.params, { catId: id });
  }
  App.Utils.closeModal();
  App.render();
};
