// comanda.js — toma de pedidos, envío a estaciones (cocina/bar) y anulaciones.
//
// Modelo (colección 'comandas'):
//   items[]  → TODAS las líneas (lo que se cobra). Cada línea:
//              { key, productoId, nombre, cantidad, precio, notas,
//                area, despachoDirecto, tandaId|null,
//                anulado?, anuladoAt?, anuladoPor?, motivoAnulacion? }
//   tandas[] → lo enviado a preparar. UNA TANDA POR ÁREA Y ENVÍO:
//              { id, envioId, numero, area, directa?, estado,
//                items:[{ key, productoId, nombre, cantidad, notas, listo?, anulado? }],
//                enviadaAt, preparandoAt?, listaAt?, servidoAt?, anuladaAt? }
//   Estados de tanda: enviada → preparando → lista → servida  (| anulada)
//
// Todas las escrituras usan App.DB.update (transacción) para que cocina,
// bar y mozo no se pisen al modificar la misma comanda.
App.Views = App.Views || {};
App.Actions = App.Actions || {};

// Ids de tandas creadas en ESTE dispositivo (para no auto-alertarse)
App._localTandas = App._localTandas || {};

App.Views.comanda = async function (params) {
  const comanda = await App.DB.get('comandas', params.comandaId);
  if (!comanda || comanda.estado === 'cancelada' || comanda.estado === 'cerrada') {
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
  const catActual = categorias.filter(function (c) { return c.id === selectedCat; })[0];
  const allProductos = await App.DB.getAll('productos');
  const productos = allProductos.filter(function (p) { return p.categoriaId === selectedCat; });
  const multiEstacion = App.Estaciones.list().length > 1;

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
      var area = App.Estaciones.areaDe(p, catActual);
      var areaTag = multiEstacion
        ? '<span class="product-area" title="' + App.Utils.esc(App.Estaciones.get(area).nombre) + '">' +
          App.Estaciones.get(area).icono + (p.despachoDirecto ? '⚡' : '') + '</span>'
        : '';
      productGrid +=
        '<div class="product-card ' + (p.disponible ? '' : 'no-disponible') + '" ' +
        'onclick="' + (p.disponible ? 'App.Actions.addProduct(\'' + p.id + '\', \'' + params.comandaId + '\')' : '') + '">' +
        areaTag +
        '<div class="product-nombre">' + App.Utils.esc(p.nombre) + '</div>' +
        (p.descripcion ? '<div class="product-desc">' + App.Utils.esc(p.descripcion) + '</div>' : '') +
        '<div class="product-precio">' + App.Utils.formatCLP(p.precio) + '</div>' +
        '</div>';
    });
  }
  productGrid += '</div>';

  // Order bar (solo líneas activas)
  const activos = App.Utils.itemsActivos(comanda.items);
  const itemCount = activos.reduce(function (t, i) { return t + i.cantidad; }, 0);
  const total = App.Utils.calcTotales(comanda.items, App.Store.state.settings, 0).subtotal;
  const pendientes = activos.filter(function (i) { return !i.tandaId; }).length;

  let orderBar = '';
  if (itemCount > 0) {
    orderBar =
      '<div class="order-bar" onclick="App.Actions.verOrden(\'' + params.comandaId + '\', \'' + params.mesaId + '\')">' +
      '<div class="order-bar-info">' +
      '<span class="order-bar-icon">📋</span>' +
      '<div class="order-bar-text">' +
      '<span class="order-bar-count">' + itemCount + (itemCount === 1 ? ' item' : ' items') +
      (pendientes > 0 ? ' · ' + pendientes + ' por enviar' : '') + '</span>' +
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

// Área de un item (los antiguos sin 'area' se resuelven por producto)
function _itemArea(it, areaPorProducto) {
  if (it.area && App.Estaciones.exists(it.area)) return it.area;
  if (areaPorProducto && areaPorProducto[it.productoId]) return areaPorProducto[it.productoId];
  return App.Estaciones.principal();
}

// Mapa productoId → área para items pendientes que no tienen área guardada
async function _areasFaltantes(comanda) {
  var map = {};
  var items = (comanda.items || []).filter(function (it) { return !it.tandaId && !it.area; });
  for (var i = 0; i < items.length; i++) {
    if (!map[items[i].productoId]) map[items[i].productoId] = await App.Estaciones.areaDeProductoId(items[i].productoId);
  }
  return map;
}

App.Actions.addProduct = async function (productoId, comandaId) {
  var producto = await App.DB.get('productos', productoId);
  if (!producto || !producto.disponible) return;
  var categoria = await App.DB.get('categorias', producto.categoriaId);
  var area = App.Estaciones.areaDe(producto, categoria);
  var key = App.Utils.uid('it'); // generado fuera del mutator (determinista ante reintentos)

  await App.DB.update('comandas', comandaId, function (comanda) {
    comanda.items = comanda.items || [];
    // Buscar solo entre items PENDIENTES (sin tandaId). Los ya enviados no
    // se modifican: un reorder del mismo producto es una línea nueva.
    var existing = null;
    for (var i = 0; i < comanda.items.length; i++) {
      var it = comanda.items[i];
      if (it.productoId === productoId && !it.tandaId && !it.anulado) { existing = it; break; }
    }
    if (existing) {
      existing.cantidad += 1;
    } else {
      comanda.items.push({
        key: key,
        productoId: producto.id,
        nombre: producto.nombre,
        cantidad: 1,
        precio: producto.precio,
        notas: '',
        area: area,
        despachoDirecto: !!producto.despachoDirecto,
        tandaId: null,
      });
    }
  });
  App.render();
};

// Asegura que todas las líneas tengan 'key' (comandas creadas antes de v18)
async function _ensureKeys(comandaId) {
  var c = await App.DB.get('comandas', comandaId);
  if (!c || !(c.items || []).some(function (it) { return !it.key; })) return;
  var keys = c.items.map(function () { return App.Utils.uid('it'); });
  await App.DB.update('comandas', comandaId, function (comanda) {
    var changed = false;
    (comanda.items || []).forEach(function (it, idx) {
      if (!it.key) { it.key = keys[idx] || App.Utils.uid('it'); changed = true; }
    });
    return changed ? undefined : false;
  });
}

function _puedeGestionar(comanda) {
  var user = App.Auth.getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'cajero') return true;
  return !comanda.mozoUid || comanda.mozoUid === user.uid || comanda.mozoUid === 'reassigned';
}

var ESTADO_LABEL = {
  enviada: 'Enviado', preparando: 'Preparando', lista: 'Listo', servida: 'Servido', anulada: 'Anulado',
};

App.Actions.verOrden = async function (comandaId, mesaId) {
  await _ensureKeys(comandaId);
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda || App.Utils.itemsActivos(comanda.items).length === 0 && !(comanda.tandas || []).length) {
    App.Utils.toast('La orden está vacía', 'info');
    return;
  }

  var settings = App.Store.state.settings;
  var tot = App.Utils.calcTotales(comanda.items, settings, 0);
  var areaPorProducto = await _areasFaltantes(comanda);
  var multi = App.Estaciones.list().length > 1;
  var puedeGestionar = _puedeGestionar(comanda);

  // ----- Pendientes (editables), agrupados por área -----
  var pendientes = comanda.items.filter(function (it) { return !it.tandaId && !it.anulado; });
  var porArea = {};
  pendientes.forEach(function (it) {
    var a = _itemArea(it, areaPorProducto);
    (porArea[a] = porArea[a] || []).push(it);
  });
  var areasPend = App.Estaciones.ids().filter(function (a) { return porArea[a]; });

  var pendientesHtml = '';
  areasPend.forEach(function (a) {
    if (multi) pendientesHtml += '<div class="order-area-head">' + App.Estaciones.label(a) + '</div>';
    pendientesHtml += '<div class="order-items">';
    porArea[a].forEach(function (item) {
      pendientesHtml +=
        '<div class="order-item">' +
        '<div class="order-item-info">' +
        '<div class="order-item-nombre">' + item.cantidad + 'x ' + App.Utils.esc(item.nombre) +
        (item.despachoDirecto ? ' <span class="tag-directo" title="Despacho directo, no requiere preparación">⚡ directo</span>' : '') + '</div>' +
        '<input type="text" class="form-input" style="margin-top:6px;padding:6px 10px;font-size:12px" ' +
        'placeholder="Notas (ej: sin cebolla)..." value="' + App.Utils.esc(item.notas || '') + '" ' +
        'onchange="App.Actions.setItemNota(\'' + comandaId + '\',\'' + item.key + '\',this.value)">' +
        '</div>' +
        '<div class="order-item-precio">' + App.Utils.formatCLP(item.cantidad * item.precio) + '</div>' +
        '<div class="qty-control">' +
        '<button class="qty-btn" onclick="App.Actions.changeQty(\'' + comandaId + '\',\'' + item.key + '\',-1)">−</button>' +
        '<span class="qty-display">' + item.cantidad + '</span>' +
        '<button class="qty-btn" onclick="App.Actions.changeQty(\'' + comandaId + '\',\'' + item.key + '\',1)">+</button>' +
        '</div>' +
        '</div>';
    });
    pendientesHtml += '</div>';
  });
  if (pendientesHtml) {
    pendientesHtml = '<div class="order-section-title">Por enviar</div>' + pendientesHtml;
  }

  // ----- Enviados: agrupados por número de envío, una tanda por área -----
  var envios = {};
  (comanda.tandas || []).forEach(function (t) { (envios[t.numero] = envios[t.numero] || []).push(t); });
  var numeros = Object.keys(envios).map(Number).sort(function (a, b) { return a - b; });

  var tandasHtml = '';
  numeros.forEach(function (n) {
    tandasHtml += '<div class="order-envio"><div class="order-envio-head">Envío ' + n + '</div>';
    envios[n].forEach(function (t) {
      var lineas = comanda.items.filter(function (it) { return it.tandaId === t.id; });
      var rows = lineas.map(function (it) {
        var anularBtn = (!it.anulado && puedeGestionar)
          ? '<button class="icon-btn danger btn-anular" title="Anular" onclick="App.Actions.anularItemPrompt(\'' + comandaId + '\',\'' + it.key + '\')">✕</button>'
          : '';
        return '<div class="order-item-ro' + (it.anulado ? ' anulado' : '') + '">' +
          '<span>' + it.cantidad + 'x ' + App.Utils.esc(it.nombre) +
          (it.notas ? ' <span class="text-muted">· ' + App.Utils.esc(it.notas) + '</span>' : '') +
          (it.anulado ? ' <span class="text-muted">(anulado' + (it.motivoAnulacion ? ': ' + App.Utils.esc(it.motivoAnulacion) : '') + ')</span>' : '') +
          '</span>' + anularBtn + '</div>';
      }).join('');
      tandasHtml +=
        '<div class="order-tanda">' +
        '<div class="order-tanda-head">' + (multi ? App.Estaciones.label(App.Estaciones.tandaArea(t)) : 'Tanda ' + t.numero) +
        (t.directa ? ' <span class="tag-directo">⚡</span>' : '') +
        ' <span class="badge badge-' + t.estado + '">' + (ESTADO_LABEL[t.estado] || t.estado) + '</span></div>' +
        rows + '</div>';
    });
    tandasHtml += '</div>';
  });
  if (tandasHtml) {
    tandasHtml = '<div class="order-section-title">Enviado</div>' + tandasHtml;
  }

  var totalsHtml =
    '<div class="totals">' +
    '<div class="total-row"><span class="label">Subtotal</span><span class="value">' + App.Utils.formatCLP(tot.subtotal) + '</span></div>' +
    '<div class="total-row"><span class="label">IVA ' + (tot.ivaIncluido ? 'incluido ' : '') + '(' + tot.ivaRate + '%)</span><span class="value">' + App.Utils.formatCLP(tot.iva) + '</span></div>' +
    '</div>';

  var liberarBtn =
    '<div style="text-align:center;padding-top:8px">' +
    '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" ' +
    'onclick="App.Actions.liberarMesaPrompt(\'' + mesaId + '\',\'' + comandaId + '\')">Liberar Mesa</button>' +
    '</div>';

  // Botones de envío: "Enviar pedido" (todo) + envío parcial por área
  var enviarHtml = '';
  if (areasPend.length > 0) {
    var labelTodo = areasPend.length === 1 && multi
      ? 'Enviar a ' + App.Estaciones.label(areasPend[0])
      : 'Enviar pedido';
    enviarHtml = '<button class="btn btn-primary" onclick="App.Actions.enviarPedido(\'' + comandaId + '\')">' + labelTodo + '</button>';
  }
  var parcialHtml = '';
  if (areasPend.length > 1) {
    parcialHtml = '<div class="order-envio-parcial"><span class="text-muted text-sm">Enviar solo:</span>' +
      areasPend.map(function (a) {
        return '<button class="btn btn-outline btn-sm" onclick="App.Actions.enviarPedido(\'' + comandaId + '\',\'' + a + '\')">' +
          App.Estaciones.label(a) + '</button>';
      }).join('') + '</div>';
  }

  var footer =
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Agregar más</button>' +
    enviarHtml +
    '<button class="btn btn-success" onclick="App.Actions.irACuenta(\'' + comandaId + '\',\'' + mesaId + '\')">Cerrar Cuenta</button>' +
    '</div>';

  App.Utils.modal(
    '<div class="modal-header">' +
    '<span class="modal-title">Orden</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button>' +
    '</div>' +
    '<div class="modal-body">' + pendientesHtml + parcialHtml + tandasHtml + totalsHtml + liberarBtn + '</div>' +
    footer
  );
};

function _reabrirOrden(comandaId) {
  var mesaId = App.Store.state.params.mesaId;
  App.Utils.closeModal();
  App.Actions.verOrden(comandaId, mesaId);
}

App.Actions.changeQty = async function (comandaId, key, delta) {
  var result = await App.DB.update('comandas', comandaId, function (comanda) {
    var idx = -1;
    comanda.items.forEach(function (it, i) { if (it.key === key) idx = i; });
    if (idx === -1) return false;
    // Solo se pueden editar items pendientes (no enviados)
    if (comanda.items[idx].tandaId) return false;
    comanda.items[idx].cantidad += delta;
    if (comanda.items[idx].cantidad <= 0) comanda.items.splice(idx, 1);
  });
  App.Utils.closeModal();
  if (result && (App.Utils.itemsActivos(result.items).length > 0 || (result.tandas || []).length > 0)) {
    _reabrirOrden(comandaId);
  }
  App.render();
};

App.Actions.setItemNota = async function (comandaId, key, value) {
  await App.DB.update('comandas', comandaId, function (comanda) {
    var it = comanda.items.filter(function (i) { return i.key === key; })[0];
    if (!it || it.tandaId) return false;
    it.notas = value;
  });
};

// Envía los items pendientes a sus estaciones. Crea UNA TANDA POR ÁREA
// (y una tanda aparte, ya "lista", para productos de despacho directo).
// soloArea: si se indica, envía solo los pendientes de esa estación.
App.Actions.enviarPedido = async function (comandaId, soloArea) {
  var antes = await App.DB.get('comandas', comandaId);
  if (!antes) return;
  var areaPorProducto = await _areasFaltantes(antes);

  // Ids generados fuera del mutator (deterministas ante reintentos)
  var envioId = App.Utils.uid('env');
  var tandaIds = {};
  function tandaIdFor(grupo) { return tandaIds[grupo] || (tandaIds[grupo] = App.Utils.uid('tanda')); }
  var now = Date.now();
  var resumen = null;

  var result = await App.DB.update('comandas', comandaId, function (comanda) {
    resumen = {};
    var pendientes = (comanda.items || []).filter(function (it) {
      return !it.tandaId && !it.anulado && (!soloArea || _itemArea(it, areaPorProducto) === soloArea);
    });
    if (pendientes.length === 0) return false;

    comanda.tandas = comanda.tandas || [];
    var numero = comanda.tandas.reduce(function (m, t) { return Math.max(m, t.numero || 0); }, 0) + 1;

    // Agrupar por área (+ directo)
    var grupos = {};
    var orden = [];
    pendientes.forEach(function (it) {
      var area = _itemArea(it, areaPorProducto);
      it.area = area;
      var g = area + (it.despachoDirecto ? ':directo' : '');
      if (!grupos[g]) { grupos[g] = { area: area, directa: !!it.despachoDirecto, items: [] }; orden.push(g); }
      grupos[g].items.push(it);
    });

    orden.forEach(function (g) {
      var grupo = grupos[g];
      var id = tandaIdFor(g);
      var tanda = {
        id: id,
        envioId: envioId,
        numero: numero,
        area: grupo.area,
        items: grupo.items.map(function (it) {
          var ti = { key: it.key, productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad, notas: it.notas || '' };
          if (grupo.directa) ti.listo = true;
          return ti;
        }),
        estado: grupo.directa ? 'lista' : 'enviada',
        enviadaAt: now,
      };
      if (grupo.directa) { tanda.directa = true; tanda.listaAt = now; }
      comanda.tandas.push(tanda);
      grupo.items.forEach(function (it) { it.tandaId = id; });
      var cant = grupo.items.reduce(function (t, i) { return t + i.cantidad; }, 0);
      resumen[grupo.area] = (resumen[grupo.area] || 0) + cant;
    });
  });

  if (!result) {
    App.Utils.toast('No hay productos nuevos para enviar', 'info');
    return;
  }
  Object.keys(tandaIds).forEach(function (k) { App._localTandas[tandaIds[k]] = true; });

  var partes = Object.keys(resumen).map(function (a) { return App.Estaciones.label(a) + ' ' + resumen[a]; });
  App.Utils.closeModal();
  App.Utils.alertEvent('cocina', 'Enviado: ' + partes.join(' · '), 'success');
  // Si quedan pendientes (envío parcial), reabrir la orden
  var quedan = (result.items || []).some(function (it) { return !it.tandaId && !it.anulado; });
  if (quedan) _reabrirOrden(comandaId);
  App.render();
};

// Compatibilidad con el nombre anterior
App.Actions.enviarCocina = function (comandaId) { return App.Actions.enviarPedido(comandaId); };

// ===== Anulación de items ya enviados (no se borran: quedan auditados) =====
App.Actions.anularItemPrompt = async function (comandaId, key) {
  var comanda = await App.DB.get('comandas', comandaId);
  if (!comanda) return;
  if (!_puedeGestionar(comanda)) {
    App.Utils.toast('Solo el mozo de la mesa o un admin puede anular', 'error');
    return;
  }
  var item = (comanda.items || []).filter(function (i) { return i.key === key; })[0];
  if (!item) return;
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">Anular producto</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' +
    '<p class="mb-12"><strong>' + item.cantidad + 'x ' + App.Utils.esc(item.nombre) + '</strong></p>' +
    '<p class="text-muted text-sm mb-12">Ya fue enviado a ' + App.Estaciones.label(_itemArea(item)) +
    '. Se avisará a la estación y no se cobrará. Queda registrado.</p>' +
    '<div class="form-group"><label class="form-label">Motivo</label>' +
    '<input type="text" id="anular-motivo" class="form-input" placeholder="Ej: cliente cambió de opinión"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Actions.verOrden(\'' + comandaId + '\',\'' + App.Store.state.params.mesaId + '\')">Volver</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.anularItem(\'' + comandaId + '\',\'' + key + '\')">Anular</button>' +
    '</div>'
  );
};

App.Actions.anularItem = async function (comandaId, key) {
  var input = document.getElementById('anular-motivo');
  var motivo = input ? input.value.trim() : '';
  if (!motivo) { App.Utils.toast('Indica un motivo', 'error'); return; }
  var user = App.Auth.getCurrentUser();
  var now = Date.now();

  await App.DB.update('comandas', comandaId, function (comanda) {
    var item = (comanda.items || []).filter(function (i) { return i.key === key; })[0];
    if (!item || item.anulado) return false;
    item.anulado = true;
    item.anuladoAt = now;
    item.anuladoPor = user ? user.name : null;
    item.motivoAnulacion = motivo;

    var tanda = (comanda.tandas || []).filter(function (t) { return t.id === item.tandaId; })[0];
    if (!tanda) return;
    // Marcar la línea en la tanda (por key; tandas antiguas por coincidencia)
    var ti = tanda.items.filter(function (x) { return x.key && x.key === key; })[0] ||
      tanda.items.filter(function (x) {
        return !x.key && !x.anulado && x.productoId === item.productoId && x.cantidad === item.cantidad;
      })[0];
    if (ti) ti.anulado = true;
    _recalcularTanda(tanda, now);
  });

  App.Utils.closeModal();
  App.Utils.toast('Producto anulado', 'info');
  _reabrirOrden(comandaId);
  App.render();
};

// Si todas las líneas de una tanda están anuladas → anulada.
// Si todas las activas están listas → lista.
function _recalcularTanda(tanda, now) {
  var activas = tanda.items.filter(function (x) { return !x.anulado; });
  if (activas.length === 0) {
    tanda.estado = 'anulada';
    tanda.anuladaAt = now;
    return;
  }
  if ((tanda.estado === 'enviada' || tanda.estado === 'preparando') &&
      activas.every(function (x) { return x.listo; })) {
    tanda.estado = 'lista';
    tanda.listaAt = now;
  }
}
App._recalcularTanda = _recalcularTanda;

App.Actions.irACuenta = function (comandaId, mesaId) {
  App.Utils.closeModal();
  App.Store.navigate('cuenta', { comandaId: comandaId, mesaId: mesaId });
};

// ===== Liberar mesa (cancela la comanda; avisa a las estaciones) =====
function _tandasEnCurso(comanda) {
  return (comanda && comanda.tandas || []).filter(function (t) {
    return t.estado === 'enviada' || t.estado === 'preparando' || t.estado === 'lista';
  });
}

App.Actions.liberarMesaPrompt = async function (mesaId, comandaId) {
  var comanda = comandaId ? await App.DB.get('comandas', comandaId) : null;
  var enCurso = _tandasEnCurso(comanda);
  var aviso = '';
  if (enCurso.length > 0) {
    var porArea = {};
    enCurso.forEach(function (t) {
      var a = App.Estaciones.tandaArea(t);
      porArea[a] = (porArea[a] || 0) + 1;
    });
    aviso = '<div class="warning-box">⚠️ Hay pedidos en curso: ' +
      Object.keys(porArea).map(function (a) { return App.Estaciones.label(a) + ' (' + porArea[a] + ')'; }).join(', ') +
      '. Se anularán y se avisará a las estaciones.</div>';
  }
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Liberar mesa?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body">' + aviso + '<p class="text-muted">Se cancelará la comanda actual y la mesa quedará libre. ' +
    'Los items no cobrados se perderán.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.liberarMesa(\'' + mesaId + '\',\'' + comandaId + '\')">' +
    (enCurso.length > 0 ? 'Liberar y anular pedidos' : 'Liberar Mesa') + '</button>' +
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

  await App.DB.update('mesas', mesaId, function (m) {
    m.estado = 'libre';
    m.comandaId = null;
    m.mozoUid = null;
    m.mozoName = null;
  });

  if (comandaId && comandaId !== 'undefined' && comandaId !== 'null') {
    var comanda = await App.DB.get('comandas', comandaId);
    if (comanda && (comanda.tandas || []).length > 0) {
      // Hubo envíos: se conserva como 'cancelada' (auditoría) y las tandas
      // en curso pasan a 'anulada' → las estaciones reciben el aviso.
      var now = Date.now();
      await App.DB.update('comandas', comandaId, function (c) {
        c.estado = 'cancelada';
        c.canceladaAt = now;
        c.canceladaPor = user ? user.name : null;
        (c.tandas || []).forEach(function (t) {
          if (t.estado === 'enviada' || t.estado === 'preparando' || t.estado === 'lista') {
            t.estado = 'anulada';
            t.anuladaAt = now;
          }
        });
      });
    } else if (comanda) {
      await App.DB.remove('comandas', comandaId);
    }
  }
  App.Utils.closeModal();
  App.Utils.toast('Mesa liberada', 'info');
  App.Store.navigate('mesas');
};

App.Actions.volverMesas = function () {
  App.Store.navigate('mesas');
};
