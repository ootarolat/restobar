// config.js — settings view and data management actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.config = async function () {
  var s = App.Store.state.settings;
  var sync = await App.Sync.getConfig();

  // Build users list (fetched from backend)
  var currentUser = App.Auth.getCurrentUser();
  var usuariosHtml;
  if (!sync.endpoint) {
    usuariosHtml = '<div class="text-muted text-sm">Configura la URL del backend (más abajo) para gestionar usuarios.</div>';
    App.Actions._usuariosCache = [];
  } else {
    var usuarios = await App.Auth.getUsers();
    App.Actions._usuariosCache = usuarios;
    if (usuarios.length === 0) {
      usuariosHtml = '<div class="text-muted text-sm">No se pudo obtener la lista de usuarios. Verifica la conexión.</div>';
    } else {
      usuariosHtml = '<div class="carta-list" style="padding:0">';
      usuarios.forEach(function (u) {
        var roleLabel = u.role === 'admin' ? 'Administrador' : 'Mozo';
        var isMe = currentUser && currentUser.id === u.id;
        usuariosHtml +=
          '<div class="carta-item">' +
          '<div class="carta-item-info">' +
          '<div class="carta-item-nombre">' + App.Utils.esc(u.name) + (isMe ? ' <span class="text-muted text-sm">(tú)</span>' : '') + '</div>' +
          '<div class="carta-item-meta">@' + App.Utils.esc(u.username) + ' · ' + roleLabel + (u.active ? '' : ' · inactivo') + '</div>' +
          '</div>' +
          '<div class="carta-item-actions">' +
          '<button class="icon-btn" onclick="App.Actions.editarUsuario(\'' + u.id + '\')">✏️</button>' +
          '<button class="icon-btn danger" onclick="App.Actions.eliminarUsuario(\'' + u.id + '\')">🗑</button>' +
          '</div>' +
          '</div>';
      });
      usuariosHtml += '</div>';
    }
  }

  return '<div class="view">' +
    '<div class="view-title">Configuración</div>' +
    '<div class="view-subtitle">Datos del negocio</div>' +
    '<div class="config-form">' +
    '<div class="form-group"><label class="form-label">Nombre del negocio</label>' +
    '<input type="text" id="cfg-businessName" class="form-input" value="' + App.Utils.esc(s.businessName) + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">RUT</label>' +
    '<input type="text" id="cfg-rut" class="form-input" value="' + App.Utils.esc(s.rut) + '" placeholder="12.345.678-9"></div>' +
    '<div class="form-group"><label class="form-label">IVA (%)</label>' +
    '<input type="number" id="cfg-ivaRate" class="form-input" value="' + s.ivaRate + '"></div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Dirección</label>' +
    '<input type="text" id="cfg-address" class="form-input" value="' + App.Utils.esc(s.address) + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Propina sugerida (%)</label>' +
    '<input type="number" id="cfg-propinaDefault" class="form-input" value="' + s.propinaDefault + '"></div>' +
    '<div class="form-group"><label class="form-label">Cantidad de mesas</label>' +
    '<input type="number" id="cfg-mesaCount" class="form-input" value="' + s.mesaCount + '"></div>' +
    '</div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Activar propina sugerida</span>' +
    '<button class="toggle ' + (s.propinaEnabled ? 'on' : '') + '" id="cfg-propina-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Precios incluyen IVA</span>' +
    '<button class="toggle ' + (s.preciosIncluyenIva ? 'on' : '') + '" id="cfg-iva-incluido-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<button class="btn btn-primary btn-block btn-lg" onclick="App.Actions.guardarConfig()">Guardar cambios</button>' +
    '<div class="divider"></div>' +
    '<div class="section-header"><span class="section-title">Usuarios</span>' +
    '<button class="btn btn-outline btn-sm" onclick="App.Actions.nuevoUsuario()">+ Agregar</button></div>' +
    usuariosHtml +
    '<div class="divider"></div>' +
    '<div class="section-title mb-12">Gestión de datos</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.reiniciarDatos()">Reiniciar carta y mesas</button>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.borrarTodo()" style="color:var(--danger);border-color:var(--danger);margin-top:8px">Borrar todos los datos</button>' +
    '<div class="divider"></div>' +
    '<div class="section-title mb-12">Sincronización con Google Sheets</div>' +
    '<div class="form-group"><label class="form-label">URL del Web App (Apps Script)</label>' +
    '<input type="text" id="cfg-syncEndpoint" class="form-input" value="' + App.Utils.esc(sync.endpoint) + '" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Sync automática (cada 5 min)</span>' +
    '<button class="toggle ' + (sync.autoSync ? 'on' : '') + '" id="cfg-autosync-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '<div class="flex gap-8 mt-12">' +
    '<button class="btn btn-secondary btn-block" onclick="App.Actions.testSync()">Probar conexión</button>' +
    '<button class="btn btn-primary btn-block" onclick="App.Actions.syncNow()">Sincronizar ahora</button>' +
    '</div>' +
    (sync.lastSync ? '<div class="text-muted text-sm text-center mt-12">Última sync: ' + App.Utils.formatDateTime(sync.lastSync) + '</div>' : '<div class="text-muted text-sm text-center mt-12">Sin sincronizar aún</div>') +
    '</div></div>';
};

App.Actions.guardarConfig = async function () {
  var settings = {
    businessName: document.getElementById('cfg-businessName').value.trim() || 'Mi Restobar',
    rut: document.getElementById('cfg-rut').value.trim(),
    address: document.getElementById('cfg-address').value.trim(),
    ivaRate: parseFloat(document.getElementById('cfg-ivaRate').value) || 19,
    propinaDefault: parseFloat(document.getElementById('cfg-propinaDefault').value) || 10,
    mesaCount: parseInt(document.getElementById('cfg-mesaCount').value) || 30,
    propinaEnabled: document.getElementById('cfg-propina-toggle').classList.contains('on'),
    preciosIncluyenIva: document.getElementById('cfg-iva-incluido-toggle').classList.contains('on'),
    currency: 'CLP',
  };

  // Handle mesa count change
  var oldCount = App.Store.state.settings.mesaCount || 30;
  var newCount = settings.mesaCount;
  if (newCount > oldCount) {
    var newMesas = [];
    for (var i = oldCount + 1; i <= newCount; i++) {
      var cap = i <= 8 ? 2 : i <= 20 ? 4 : 6;
      newMesas.push({ id: 'mesa-' + i, numero: i, capacidad: cap, estado: 'libre', comandaId: null });
    }
    await App.DB.bulkPut('mesas', newMesas);
    if (newMesas.length > 0) App.Utils.toast(newMesas.length + ' mesas añadidas', 'success');
  } else if (newCount < oldCount) {
    var mesas = await App.DB.getAll('mesas');
    var removed = 0;
    for (var j = 0; j < mesas.length; j++) {
      if (mesas[j].numero > newCount && mesas[j].estado === 'libre') {
        await App.DB.remove('mesas', mesas[j].id);
        removed++;
      }
    }
    if (removed > 0) App.Utils.toast(removed + ' mesas libres eliminadas', 'info');
  }

  // Guardar config de sincronización
  var syncEndpoint = document.getElementById('cfg-syncEndpoint');
  var autoSyncToggle = document.getElementById('cfg-autosync-toggle');
  if (syncEndpoint) {
    await App.Sync.saveConfig(syncEndpoint.value.trim(), autoSyncToggle.classList.contains('on'));
  }

  await App.Store.saveSettings(settings);
  App.Utils.toast('Configuración guardada', 'success');
  App.render();
};

App.Actions.reiniciarDatos = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Reiniciar carta y mesas?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se restaurarán las mesas, categorías y productos de ejemplo. ' +
    'Las comandas, cuentas y movimientos de caja no se verán afectados.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.confirmarReiniciar()">Reiniciar</button>' +
    '</div>'
  );
};

App.Actions.confirmarReiniciar = async function () {
  await App.DB.clear('mesas');
  await App.DB.clear('categorias');
  await App.DB.clear('productos');
  await App.Seed.run();
  App.Utils.closeModal();
  App.render();
};

App.Actions.borrarTodo = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Borrar todo?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se eliminarán <strong>todos</strong> los datos: mesas, productos, comandas, ' +
    'cuentas, movimientos y configuración. Esta acción no se puede deshacer.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.confirmarBorrado()">Borrar todo</button>' +
    '</div>'
  );
};

App.Actions.confirmarBorrado = async function () {
  for (var i = 0; i < App.DB.STORES.length; i++) {
    await App.DB.clear(App.DB.STORES[i]);
  }
  App.Utils.closeModal();
  App.Utils.toast('Todos los datos eliminados', 'info');
  await App.Seed.run();
  await App.Store.loadSettings();
  App.Store.navigate('mesas');
};

App.Actions.testSync = async function () {
  var endpoint = document.getElementById('cfg-syncEndpoint').value.trim();
  var autoSync = document.getElementById('cfg-autosync-toggle').classList.contains('on');
  await App.Sync.saveConfig(endpoint, autoSync);
  App.Utils.toast('Probando conexión...', 'info');
  var result = await App.Sync.testConnection();
  if (result.success) {
    App.Utils.toast('Conexión exitosa ✓', 'success');
  } else {
    App.Utils.toast('Error: ' + (result.error || ''), 'error');
  }
};

App.Actions.syncNow = async function () {
  var endpoint = document.getElementById('cfg-syncEndpoint').value.trim();
  var autoSync = document.getElementById('cfg-autosync-toggle').classList.contains('on');
  await App.Sync.saveConfig(endpoint, autoSync);
  App.Utils.toast('Sincronizando...', 'info');
  var result = await App.Sync.sync();
  if (result.success) {
    App.Utils.toast('Sincronización completada ✓', 'success');
  } else {
    App.Utils.toast('Error: ' + result.error, 'error');
  }
  App.render();
};

// ===== Gestión de usuarios =====
App.Actions.nuevoUsuario = function () {
  App.Actions._usuarioForm(null);
};

App.Actions.editarUsuario = async function (userId) {
  App.Actions._usuarioForm(userId);
};

App.Actions._usuarioForm = function (userId) {
  var usuarios = App.Actions._usuariosCache || [];
  var user = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].id === userId) { user = usuarios[i]; break; }
  }
  var isEdit = !!user;

  App.Utils.modal(
    '<div class="modal-header">' +
    '<span class="modal-title">' + (isEdit ? 'Editar usuario' : 'Nuevo usuario') + '</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button>' +
    '</div>' +
    '<div class="modal-body"><div class="config-form">' +
    '<div class="form-group"><label class="form-label">Nombre</label>' +
    '<input type="text" id="user-name" class="form-input" value="' + (user ? App.Utils.esc(user.name) : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Usuario</label>' +
    '<input type="text" id="user-username" class="form-input" autocapitalize="none" value="' + (user ? App.Utils.esc(user.username) : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Contraseña' + (isEdit ? ' (dejar vacío para no cambiar)' : '') + '</label>' +
    '<input type="password" id="user-password" class="form-input" value=""></div>' +
    '<div class="form-group"><label class="form-label">Rol</label>' +
    '<select id="user-role" class="form-select">' +
    '<option value="mozo"' + (user && user.role === 'mozo' ? ' selected' : '') + '>Mozo</option>' +
    '<option value="admin"' + (user && user.role === 'admin' ? ' selected' : '') + '>Administrador</option>' +
    '</select></div>' +
    '<div class="toggle-row"><span class="form-label" style="margin:0">Activo</span>' +
    '<button class="toggle ' + (!user || user.active ? 'on' : '') + '" id="user-active-toggle" onclick="this.classList.toggle(\'on\')"></button></div>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="App.Actions.guardarUsuario(\'' + (userId || '') + '\')">Guardar</button>' +
    '</div>'
  );
};

App.Actions.guardarUsuario = async function (userId) {
  var name = document.getElementById('user-name').value.trim();
  var username = document.getElementById('user-username').value.trim();
  var password = document.getElementById('user-password').value;
  var role = document.getElementById('user-role').value;
  var active = document.getElementById('user-active-toggle').classList.contains('on');

  if (!name || !username) {
    App.Utils.toast('Completa nombre y usuario', 'error');
    return;
  }
  if (!userId && !password) {
    App.Utils.toast('La contraseña es obligatoria', 'error');
    return;
  }

  var payload = {
    id: userId || null,
    name: name,
    username: username,
    role: role,
    active: active,
  };
  if (password) payload.password = password;

  App.Utils.toast('Guardando...', 'info');
  var result = await App.Auth.saveUser(payload);
  if (result.success) {
    App.Utils.closeModal();
    App.Utils.toast(userId ? 'Usuario actualizado' : 'Usuario creado', 'success');
    App.render();
  } else {
    App.Utils.toast(result.error || 'Error al guardar', 'error');
  }
};

App.Actions.eliminarUsuario = function (userId) {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Eliminar usuario?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Esta acción no se puede deshacer.</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" onclick="App.Actions.confirmarEliminarUsuario(\'' + userId + '\')">Eliminar</button>' +
    '</div>'
  );
};

App.Actions.confirmarEliminarUsuario = async function (userId) {
  var result = await App.Auth.deleteUser(userId);
  App.Utils.closeModal();
  if (result.success) {
    App.Utils.toast('Usuario eliminado', 'info');
    App.render();
  } else {
    App.Utils.toast(result.error, 'error');
  }
};
