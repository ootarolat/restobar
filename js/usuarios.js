// usuarios.js — administración de usuarios (solo admin): alta, edición,
// roles, baja/reactivación y restablecer contraseña.
//
// Modelo (colección 'usuarios', id = uid de Firebase Auth):
//   { name, email, role, roles[], activo, creadoAt, ... }
//   role  = rol principal (admin > cajero > mozo > estación); es el que usan
//           la app y las reglas de Firestore.
//   roles = lista completa. Una estación (cocina, bar, ...) es exclusiva: no
//           se combina con roles de sala.
// La baja es lógica (activo=false): conserva el historial y es reversible.
// Las reglas de Firestore le quitan todo acceso y la app cierra su sesión.
App.Usuarios = (function () {
  var SALA = [['admin', 'Administrador'], ['cajero', 'Cajero'], ['mozo', 'Mozo']];
  var PRIORIDAD = ['admin', 'cajero', 'mozo'];
  var lista = [];

  function esc(s) { return App.Utils.esc(s); }
  function yo() { return App.Auth.getCurrentUser(); }
  function esSala(r) { return PRIORIDAD.indexOf(r) !== -1; }
  function rolNombre(r) {
    for (var i = 0; i < SALA.length; i++) if (SALA[i][0] === r) return SALA[i][1];
    return App.Estaciones.exists(r) ? App.Estaciones.label(r) : r;
  }
  // Rol principal a partir de la lista de roles
  function principal(roles) {
    for (var i = 0; i < PRIORIDAD.length; i++) if (roles.indexOf(PRIORIDAD[i]) !== -1) return PRIORIDAD[i];
    return roles[0];
  }
  function ordenar(roles) {
    var sala = PRIORIDAD.filter(function (r) { return roles.indexOf(r) !== -1; });
    var otros = roles.filter(function (r) { return !esSala(r); });
    return sala.concat(otros);
  }
  function admins() {
    return lista.filter(function (u) { return u.activo && u.role === 'admin'; });
  }

  async function cargar() {
    var snap = await window.FB.getDocs(window.FB.collection(window.FB.db, 'usuarios'));
    var out = [];
    snap.forEach(function (d) {
      var x = d.data();
      var role = x.role || 'mozo';
      out.push({
        uid: d.id, name: x.name || d.id, email: x.email || '', role: role,
        roles: Array.isArray(x.roles) && x.roles.length ? x.roles : [role],
        activo: x.activo !== false,
      });
    });
    out.sort(function (a, b) {
      if (a.activo !== b.activo) return a.activo ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    lista = out;
    return out;
  }

  // ---------- vista ----------
  async function view() {
    var head = typeof cfgHeader === 'function' ? cfgHeader('👥 Usuarios') : '<div class="view-title">Usuarios</div>';
    var u;
    try { u = await cargar(); }
    catch (e) {
      console.error('Usuarios', e);
      return '<div class="view">' + head + '<div class="text-muted">No se pudo leer la lista de usuarios. ' +
        'Verifica que las reglas de Firestore estén publicadas.</div></div>';
    }
    var yoUid = yo() && yo().uid;
    var items = u.map(function (x) {
      var chips = ordenar(x.roles).map(function (r) {
        return '<span class="usr-chip">' + esc(rolNombre(r)) + '</span>';
      }).join('');
      return '<div class="carta-item usr-item' + (x.activo ? '' : ' usr-baja') + '" style="cursor:pointer" ' +
        'onclick="App.Actions.usrEditar(\'' + esc(x.uid) + '\')">' +
        '<div class="carta-item-info">' +
        '<div class="carta-item-nombre">' + esc(x.name) + (x.uid === yoUid ? ' <span class="text-muted">(tú)</span>' : '') +
        (x.activo ? '' : ' <span class="usr-chip usr-chip-baja">De baja</span>') + '</div>' +
        '<div class="carta-item-meta">' + (x.email ? esc(x.email) : 'correo no registrado') + '</div>' +
        '<div style="margin-top:6px">' + chips + '</div></div>' +
        '<div class="carta-item-precio">›</div></div>';
    }).join('');
    var activos = u.filter(function (x) { return x.activo; }).length;
    return '<div class="view">' + head +
      '<button class="btn btn-primary btn-block" onclick="App.Actions.usrNuevo()">➕ Nuevo usuario</button>' +
      '<div class="text-muted text-sm mt-12 mb-12">' + activos + ' activos · ' + (u.length - activos) + ' de baja</div>' +
      '<div class="carta-list" style="display:flex;flex-direction:column;gap:8px">' + items + '</div>' +
      '<div class="text-muted text-sm mt-16">Dar de baja no borra nada: se conserva el historial y se puede reactivar. ' +
      'Un usuario de baja pierde el acceso y su sesión se cierra automáticamente.</div></div>';
  }

  // ---------- formulario ----------
  function rolesHtml(sel) {
    function chk(id, label, station) {
      return '<label class="usr-rol"><input type="checkbox" class="usr-rol-chk" data-id="' + esc(id) + '" data-st="' + (station ? 1 : 0) + '" ' +
        (sel.indexOf(id) !== -1 ? 'checked' : '') + ' onchange="App.Actions.usrRolChange(this)"> ' + label + '</label>';
    }
    var sala = SALA.map(function (r) { return chk(r[0], r[1], false); }).join('');
    var est = App.Estaciones.ids().map(function (id) { return chk(id, App.Estaciones.label(id), true); }).join('');
    return '<div class="form-label">Roles</div>' +
      '<div class="usr-roles">' + sala + '</div>' +
      '<div class="form-label" style="margin-top:8px">Estación (excluye los roles de sala)</div>' +
      '<div class="usr-roles">' + est + '</div>';
  }
  function leerRoles() {
    var r = [];
    document.querySelectorAll('.usr-rol-chk').forEach(function (c) { if (c.checked) r.push(c.getAttribute('data-id')); });
    return ordenar(r);
  }
  function porUid(uid) { return lista.filter(function (u) { return u.uid === uid; })[0]; }

  // ---------- acciones ----------
  var A = App.Actions;
  A.usrRolChange = function (el) {
    if (!el.checked) return;
    var estacion = el.getAttribute('data-st') === '1';
    document.querySelectorAll('.usr-rol-chk').forEach(function (c) {
      if (c === el) return;
      // una estación excluye todo lo demás; un rol de sala excluye estaciones
      if (estacion || c.getAttribute('data-st') === '1') c.checked = false;
    });
  };
  A.usrNuevo = function () {
    App.Utils.modal(
      '<div class="modal-header"><span class="modal-title">Nuevo usuario</span>' +
      '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="form-group"><label class="form-label">Nombre</label><input type="text" id="usr-name" class="form-input" maxlength="60" autocomplete="off"></div>' +
      '<div class="form-group"><label class="form-label">Correo (será su usuario)</label><input type="email" id="usr-email" class="form-input" autocapitalize="none" autocomplete="off"></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Contraseña (mín. 6)</label><input type="password" id="usr-pass" class="form-input" autocomplete="new-password"></div>' +
      '<div class="form-group"><label class="form-label">Repetir</label><input type="password" id="usr-pass2" class="form-input" autocomplete="new-password"></div>' +
      '</div>' + rolesHtml(['mozo']) +
      '<div id="usr-err" class="login-error"></div></div>' +
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
      '<button class="btn btn-primary" id="usr-save" onclick="App.Actions.usrCrear()">Crear usuario</button></div>'
    );
  };
  function err(msg) { var e = document.getElementById('usr-err'); if (e) e.textContent = msg; }
  function authMsg(e) {
    var c = (e && e.code) || '';
    if (c.indexOf('email-already-in-use') !== -1)
      return 'Ese correo ya tiene una cuenta. Si es un usuario dado de baja, reactívalo desde la lista.';
    if (c.indexOf('invalid-email') !== -1) return 'Correo inválido.';
    if (c.indexOf('weak-password') !== -1) return 'Contraseña muy débil (mínimo 6 caracteres).';
    if (c.indexOf('network') !== -1) return 'Sin conexión. Intenta de nuevo.';
    return 'No se pudo crear la cuenta.';
  }
  A.usrCrear = async function () {
    var name = document.getElementById('usr-name').value.trim();
    var email = document.getElementById('usr-email').value.trim().toLowerCase();
    var pass = document.getElementById('usr-pass').value;
    var pass2 = document.getElementById('usr-pass2').value;
    var roles = leerRoles();
    if (!name) return err('Ingresa el nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Correo inválido.');
    if (pass.length < 6) return err('La contraseña debe tener al menos 6 caracteres.');
    if (pass !== pass2) return err('Las contraseñas no coinciden.');
    if (!roles.length) return err('Elige al menos un rol.');
    if (lista.some(function (u) { return u.email && u.email.toLowerCase() === email; }))
      return err('Ya existe un usuario con ese correo (revisa la lista, puede estar de baja).');
    var btn = document.getElementById('usr-save');
    btn.disabled = true; btn.textContent = 'Creando...'; err('');
    var uid;
    try { uid = await window.FB.createAuthUser(email, pass); }
    catch (e) { btn.disabled = false; btn.textContent = 'Crear usuario'; return err(authMsg(e)); }
    var perfil = {
      name: name, email: email, role: principal(roles), roles: roles, activo: true,
      creadoAt: Date.now(), creadoPor: yo().uid,
    };
    try {
      await window.FB.setDoc(window.FB.doc(window.FB.db, 'usuarios', uid), perfil);
    } catch (e) {
      console.error('Perfil no guardado', e);
      btn.disabled = false; btn.textContent = 'Reintentar guardar perfil';
      btn.setAttribute('onclick', 'App.Actions.usrReintentarPerfil()');
      A._usrPendiente = { uid: uid, perfil: perfil };
      return err('La cuenta se creó pero no se pudo guardar el perfil. Pulsa "Reintentar". Sin perfil, el usuario entraría como mozo.');
    }
    App.Utils.closeModal();
    App.Utils.toast('Usuario creado: ' + name, 'success');
    App.Store.navigate('config', { section: 'usuarios' });
  };
  A.usrReintentarPerfil = async function () {
    var p = A._usrPendiente;
    if (!p) return;
    try {
      await window.FB.setDoc(window.FB.doc(window.FB.db, 'usuarios', p.uid), p.perfil);
      A._usrPendiente = null;
      App.Utils.closeModal();
      App.Utils.toast('Usuario creado: ' + p.perfil.name, 'success');
      App.Store.navigate('config', { section: 'usuarios' });
    } catch (e) { err('Sigue fallando. Revisa tu conexión y que las reglas estén publicadas.'); }
  };

  A.usrEditar = function (uid) {
    var u = porUid(uid);
    if (!u) return;
    var soyYo = yo() && yo().uid === uid;
    var acciones = '';
    if (u.activo) {
      acciones += u.email
        ? '<button class="btn btn-outline btn-block" onclick="App.Actions.usrResetPass(\'' + esc(uid) + '\')">✉ Enviar enlace para cambiar contraseña</button>'
        : '<div class="text-muted text-sm">Sin correo registrado: no se puede enviar el enlace de contraseña.</div>';
      acciones += soyYo
        ? '<div class="text-muted text-sm mt-8">No puedes darte de baja a ti mismo ni quitarte el rol de administrador.</div>'
        : '<button class="btn btn-danger btn-block mt-8" onclick="App.Actions.usrBajaConfirmar(\'' + esc(uid) + '\')">Dar de baja</button>';
    } else {
      acciones = '<button class="btn btn-primary btn-block" onclick="App.Actions.usrReactivar(\'' + esc(uid) + '\')">Reactivar usuario</button>';
    }
    App.Utils.modal(
      '<div class="modal-header"><span class="modal-title">' + esc(u.name) + '</span>' +
      '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="text-muted text-sm mb-12">' + (u.email ? esc(u.email) : 'correo no registrado') +
      (u.activo ? '' : ' · <strong>De baja</strong>') + '</div>' +
      '<div class="form-group"><label class="form-label">Nombre</label><input type="text" id="usr-name" class="form-input" maxlength="60" value="' + esc(u.name) + '"></div>' +
      rolesHtml(u.roles) +
      '<div id="usr-err" class="login-error"></div>' +
      '<div style="margin-top:14px">' + acciones + '</div>' +
      '<div class="text-muted text-sm mt-12">El correo no se puede cambiar desde la app. Si hay cambios de rol, al usuario se le recarga la app sola.</div></div>' +
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cerrar</button>' +
      '<button class="btn btn-primary" onclick="App.Actions.usrGuardar(\'' + esc(uid) + '\')">Guardar</button></div>'
    );
  };
  async function actualizar(uid, cambios) {
    cambios.updatedAt = Date.now();
    cambios.updatedBy = yo().uid;
    await window.FB.setDoc(window.FB.doc(window.FB.db, 'usuarios', uid), cambios, { merge: true });
  }
  A.usrGuardar = async function (uid) {
    var u = porUid(uid);
    if (!u) return;
    var name = document.getElementById('usr-name').value.trim();
    var roles = leerRoles();
    if (!name) return err('Ingresa el nombre.');
    if (!roles.length) return err('Elige al menos un rol.');
    var role = principal(roles);
    var soyYo = yo() && yo().uid === uid;
    if (soyYo && roles.indexOf('admin') === -1) return err('No puedes quitarte el rol de administrador.');
    if (u.activo && u.role === 'admin' && role !== 'admin' && admins().length <= 1)
      return err('Debe quedar al menos un administrador activo.');
    try {
      await actualizar(uid, { name: name, role: role, roles: roles });
    } catch (e) { console.error(e); return err('No se pudo guardar (¿reglas de Firestore publicadas?).'); }
    App.Utils.closeModal();
    App.Utils.toast('Usuario actualizado', 'success');
    App.Store.navigate('config', { section: 'usuarios' });
  };
  A.usrBajaConfirmar = function (uid) {
    var u = porUid(uid);
    if (!u) return;
    if (u.role === 'admin' && admins().length <= 1) return err('Debe quedar al menos un administrador activo.');
    App.Utils.modal(
      '<div class="modal-header"><span class="modal-title">Dar de baja</span>' +
      '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
      '<div class="modal-body"><p>¿Dar de baja a <strong>' + esc(u.name) + '</strong>?</p>' +
      '<p class="text-muted text-sm mt-8">Perderá el acceso y su sesión se cerrará. El historial no se borra y puedes reactivarlo cuando quieras.</p></div>' +
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="App.Actions.usrEditar(\'' + esc(uid) + '\')">Cancelar</button>' +
      '<button class="btn btn-danger" onclick="App.Actions.usrBaja(\'' + esc(uid) + '\')">Dar de baja</button></div>'
    );
  };
  A.usrBaja = async function (uid) {
    var u = porUid(uid);
    if (!u || (yo() && yo().uid === uid)) return;
    if (u.role === 'admin' && admins().length <= 1) { App.Utils.toast('Debe quedar al menos un administrador activo', 'error'); return; }
    try { await actualizar(uid, { activo: false, bajaAt: Date.now(), bajaPor: yo().uid }); }
    catch (e) { console.error(e); App.Utils.toast('No se pudo dar de baja', 'error'); return; }
    App.Utils.closeModal();
    App.Utils.toast('Usuario dado de baja', 'success');
    App.Store.navigate('config', { section: 'usuarios' });
  };
  A.usrReactivar = async function (uid) {
    try { await actualizar(uid, { activo: true, reactivadoAt: Date.now() }); }
    catch (e) { console.error(e); App.Utils.toast('No se pudo reactivar', 'error'); return; }
    App.Utils.closeModal();
    App.Utils.toast('Usuario reactivado', 'success');
    App.Store.navigate('config', { section: 'usuarios' });
  };
  A.usrResetPass = async function (uid) {
    var u = porUid(uid);
    if (!u || !u.email) return;
    try {
      await window.FB.sendPasswordReset(u.email);
      App.Utils.toast('Enlace enviado a ' + u.email, 'success');
    } catch (e) { console.error(e); err('No se pudo enviar el correo.'); }
  };

  return { view: view, principal: principal };
})();
