// config.js — settings view and data management actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.config = async function () {
  var s = App.Store.state.settings;
  var user = App.Auth.getCurrentUser();

  var userInfo =
    '<div class="carta-item">' +
    '<div class="carta-item-info">' +
    '<div class="carta-item-nombre">' + App.Utils.esc(user ? user.name : '') + '</div>' +
    '<div class="carta-item-meta">' + App.Utils.esc(user ? user.email : '') + ' · ' +
    (user && user.role === 'admin' ? 'Administrador' : 'Mozo') + '</div>' +
    '</div></div>';

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
    '<div class="section-title mb-12">Sesión</div>' +
    userInfo +
    '<div class="text-muted text-sm mt-12">Los usuarios se administran desde la consola de Firebase (Authentication). El rol de cada usuario se define en la colección <strong>usuarios</strong> de Firestore.</div>' +
    '<div class="divider"></div>' +
    '<div class="section-title mb-12">Gestión de datos</div>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.reiniciarDatos()">Reiniciar carta y mesas</button>' +
    '<button class="btn btn-outline btn-block" onclick="App.Actions.borrarTodo()" style="color:var(--danger);border-color:var(--danger);margin-top:8px">Borrar todos los datos</button>' +
    '<div class="text-muted text-sm mt-12">⚠️ Estas acciones afectan a <strong>todos los dispositivos</strong> (datos compartidos en la nube).</div>' +
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

  await App.Store.saveSettings(settings);
  App.Utils.toast('Configuración guardada', 'success');
  App.render();
};

App.Actions.reiniciarDatos = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Reiniciar carta y mesas?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se restaurarán las mesas, categorías y productos de ejemplo ' +
    'para <strong>todos los dispositivos</strong>. Las comandas, cuentas y movimientos de caja no se verán afectados.</p></div>' +
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
  await App.Seed.run(true);
  App.Utils.closeModal();
  App.Utils.toast('Carta y mesas reiniciadas', 'success');
  App.render();
};

App.Actions.borrarTodo = function () {
  App.Utils.modal(
    '<div class="modal-header"><span class="modal-title">¿Borrar todo?</span>' +
    '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
    '<div class="modal-body"><p class="text-muted">Se eliminarán <strong>todos</strong> los datos de la nube: mesas, productos, comandas, ' +
    'cuentas, movimientos y configuración, en <strong>todos los dispositivos</strong>. Esta acción no se puede deshacer.</p></div>' +
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
  await App.Seed.run(true);
  await App.Store.loadSettings();
  App.Store.navigate('mesas');
};
