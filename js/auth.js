// auth.js — authentication via Firebase Auth (email/password).
// Users are created in the Firebase console. Their role (admin/mozo) is
// stored in the Firestore 'usuarios' collection, keyed by the Auth UID.
App.Auth = (() => {
  var currentUser = null;   // { uid, email, role, name }
  var authInited = false;

  // Resolve the role/name for a given Auth user from the 'usuarios' collection.
  // If no role doc exists yet, default to 'mozo' (admin must be set explicitly).
  async function resolveProfile(fbUser) {
    var role = 'mozo';
    var name = fbUser.email;
    try {
      var snap = await window.FB.getDoc(window.FB.doc(window.FB.db, 'usuarios', fbUser.uid));
      if (snap.exists()) {
        var data = snap.data();
        if (data.role) role = data.role;
        if (data.name) name = data.name;
      }
    } catch (e) {
      console.warn('No se pudo leer el perfil del usuario:', e);
    }
    return { uid: fbUser.uid, email: fbUser.email, role: role, name: name };
  }

  // Start listening to auth state. Calls onReady(isLoggedIn) once resolved.
  function listen(onLogin, onLogout) {
    window.FB.onAuthStateChanged(async function (fbUser) {
      if (fbUser) {
        currentUser = await resolveProfile(fbUser);
        App.Store.state.userRole = currentUser.role;
        onLogin(currentUser);
      } else {
        currentUser = null;
        App.Store.state.userRole = 'mozo';
        onLogout();
      }
      authInited = true;
    });
  }

  function showLogin() {
    var header = document.getElementById('header');
    var nav = document.getElementById('bottom-nav');
    if (header) header.style.display = 'none';
    if (nav) nav.style.display = 'none';
    document.getElementById('content').innerHTML =
      '<div class="login-screen">' +
      '<div class="login-logo">🍽️</div>' +
      '<h1 class="login-title">Restobar</h1>' +
      '<div class="login-form">' +
      '<input type="email" id="login-email" class="login-input" placeholder="Correo" autocomplete="username" autocapitalize="none" autofocus>' +
      '<input type="password" id="login-password" class="login-input" placeholder="Contraseña" autocomplete="current-password" ' +
      'onkeydown="if(event.key===\'Enter\')App.Auth.doLogin()">' +
      '<button class="btn btn-primary btn-block btn-lg" id="login-btn" onclick="App.Auth.doLogin()">Ingresar</button>' +
      '<div id="login-error" class="login-error"></div>' +
      '</div></div>';
  }

  async function doLogin() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');
    errorEl.textContent = '';

    if (!email || !password) {
      errorEl.textContent = 'Ingresa correo y contraseña';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Ingresando...';
    try {
      await window.FB.signIn(email, password);
      // onAuthStateChanged handles the rest (profile + render)
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
      errorEl.textContent = loginErrorMessage(e);
      var pwd = document.getElementById('login-password');
      if (pwd) { pwd.value = ''; pwd.focus(); }
    }
  }

  function loginErrorMessage(e) {
    var code = e && e.code ? e.code : '';
    if (code.indexOf('invalid-credential') !== -1 ||
        code.indexOf('wrong-password') !== -1 ||
        code.indexOf('user-not-found') !== -1) {
      return 'Correo o contraseña incorrectos';
    }
    if (code.indexOf('invalid-email') !== -1) return 'Correo inválido';
    if (code.indexOf('too-many-requests') !== -1) return 'Demasiados intentos. Espera un momento.';
    if (code.indexOf('network') !== -1) return 'Sin conexión. Verifica tu internet.';
    return 'No se pudo iniciar sesión';
  }

  async function logout() {
    try { await window.FB.signOut(); } catch (e) {}
    // onAuthStateChanged will show the login screen
  }

  function getCurrentUser() { return currentUser; }
  function isLoggedIn() { return currentUser !== null; }
  function isInited() { return authInited; }

  return {
    listen: listen,
    showLogin: showLogin,
    doLogin: doLogin,
    logout: logout,
    getCurrentUser: getCurrentUser,
    isLoggedIn: isLoggedIn,
    isInited: isInited,
  };
})();
