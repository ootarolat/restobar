// auth.js — login validated by Google Apps Script backend.
// Passwords are NEVER stored in the browser. Only a session token
// and non-sensitive user info (id, username, name, role) are cached
// locally so the app can keep working offline after a validated login.
App.Auth = (() => {
  var currentUser = null;
  var currentToken = null;

  function getEndpoint() {
    return App.Sync.resolveEndpoint();
  }

  // Backend POST helper (text/plain avoids CORS preflight)
  async function api(payload) {
    var endpoint = await getEndpoint();
    if (!endpoint) return { success: false, error: 'offline', offline: true };
    try {
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'offline', offline: true };
    }
  }

  // Called on app init — returns true if a valid local session exists
  async function init() {
    var session = await App.DB.getMeta('session', null);
    if (session && session.user && session.token) {
      currentUser = session.user;
      currentToken = session.token;
      App.Store.state.userRole = session.user.role;
      return true;
    }
    return false;
  }

  function showLogin() {
    document.getElementById('header').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('content').innerHTML =
      '<div class="login-screen">' +
      '<div class="login-logo">🍽️</div>' +
      '<h1 class="login-title">Restobar</h1>' +
      '<div class="login-form">' +
      '<input type="text" id="login-username" class="login-input" placeholder="Usuario" autocomplete="username" autocapitalize="none" autofocus>' +
      '<input type="password" id="login-password" class="login-input" placeholder="Contraseña" autocomplete="current-password" ' +
      'onkeydown="if(event.key===\'Enter\')App.Auth.doLogin()">' +
      '<button class="btn btn-primary btn-block btn-lg" id="login-btn" onclick="App.Auth.doLogin()">Ingresar</button>' +
      '<div id="login-error" class="login-error"></div>' +
      '<button class="btn btn-outline btn-block" onclick="App.Auth.configureBackend()">Configurar servidor</button>' +
      '</div></div>';
  }

  async function configureBackend() {
    var current = await getEndpoint();
    App.Utils.modal(
      '<div class="modal-header"><span class="modal-title">Servidor (backend)</span>' +
      '<button class="modal-close" onclick="App.Utils.closeModal()">✕</button></div>' +
      '<div class="modal-body"><div class="form-group">' +
      '<label class="form-label">URL del Web App (Apps Script)</label>' +
      '<input type="text" id="login-endpoint" class="form-input" value="' + App.Utils.esc(current) + '" ' +
      'placeholder="https://script.google.com/macros/s/.../exec"></div>' +
      '<p class="text-muted text-sm">Pega aquí la URL que termina en /exec de tu implementación de Google Apps Script.</p></div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="App.Utils.closeModal()">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="App.Auth.saveBackendUrl()">Guardar</button>' +
      '</div>'
    );
  }

  async function saveBackendUrl() {
    var url = document.getElementById('login-endpoint').value.trim();
    var autoSync = await App.DB.getMeta('autoSync', false);
    await App.Sync.saveConfig(url, autoSync);
    App.Utils.closeModal();
    App.Utils.toast(url ? 'Servidor configurado' : 'URL borrada', 'success');
  }

  async function doLogin() {
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');
    errorEl.textContent = '';

    if (!username || !password) {
      errorEl.textContent = 'Ingresa usuario y contraseña';
      return;
    }

    var endpoint = await getEndpoint();
    if (!endpoint) {
      errorEl.textContent = 'Configura la URL del backend antes de iniciar sesión';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    var result = await api({ action: 'login', username: username, password: password });

    btn.disabled = false;
    btn.textContent = 'Ingresar';

    if (result.offline) {
      errorEl.textContent = 'Sin conexión al servidor. Verifica tu internet.';
      return;
    }

    if (result.success && result.user && result.token) {
      currentUser = result.user;
      currentToken = result.token;
      App.Store.state.userRole = result.user.role;
      // Only non-sensitive data + token are persisted locally
      await App.DB.setMeta('session', { user: result.user, token: result.token });
      document.getElementById('header').style.display = '';
      App.Store.setRender(App.render);
      App.render();
      App.Utils.toast('Bienvenido, ' + result.user.name, 'success');
    } else {
      errorEl.textContent = result.error || 'Usuario o contraseña incorrectos';
      var pwd = document.getElementById('login-password');
      pwd.value = ''; pwd.focus();
    }
  }

  async function logout() {
    currentUser = null;
    currentToken = null;
    App.Store.state.userRole = 'mozo';
    await App.DB.setMeta('session', null);
    showLogin();
  }

  function getCurrentUser() { return currentUser; }
  function getToken() { return currentToken; }
  function isLoggedIn() { return currentUser !== null; }

  // ===== User management (admin only, via backend) =====

  async function getUsers() {
    var result = await api({ action: 'listUsers', token: currentToken });
    if (result.needLogin) { await logout(); return []; }
    return result.success ? result.users : [];
  }

  async function saveUser(user) {
    var result = await api({ action: 'saveUser', token: currentToken, user: user });
    if (result.needLogin) { await logout(); }
    return result;
  }

  async function deleteUser(userId) {
    var result = await api({ action: 'deleteUser', token: currentToken, userId: userId });
    if (result.needLogin) { await logout(); }
    return result;
  }

  async function changePassword(currentPassword, newPassword) {
    var result = await api({
      action: 'changePassword',
      token: currentToken,
      currentPassword: currentPassword,
      newPassword: newPassword,
    });
    if (result.needLogin) { await logout(); }
    return result;
  }

  return {
    init: init,
    showLogin: showLogin,
    doLogin: doLogin,
    configureBackend: configureBackend,
    saveBackendUrl: saveBackendUrl,
    logout: logout,
    getCurrentUser: getCurrentUser,
    getToken: getToken,
    isLoggedIn: isLoggedIn,
    getUsers: getUsers,
    saveUser: saveUser,
    deleteUser: deleteUser,
    changePassword: changePassword,
  };
})();
