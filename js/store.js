// store.js — state management and navigation for Restobar POS
App.Store = (() => {
  const state = {
    view: 'mesas',
    params: {},
    settings: {},
    userRole: 'mozo',
  };

  // ===== Role-based access control =====
  // Roles fijos: admin, mozo, cajero. Además, CADA ESTACIÓN (cocina, bar,
  // ...) es un rol: sus usuarios solo ven la pantalla de su estación.
  // Las vistas internas de flujo (comanda, cuenta) se permiten según rol.
  const ROLE_NAV = {
    // Admin: Caja se accede desde Configuración (no en el nav).
    // 'pase' = pantalla con todas las estaciones (desde ahí entra a cada una).
    admin:   ['mesas', 'pase', 'carta', 'reportes'],
    mozo:    ['mesas'],
    // Cajero: Caja es su herramienta principal → se queda en el nav
    cajero:  ['mesas', 'caja'],
  };

  // Vistas a las que cada rol puede acceder (incluye flujos internos).
  const ROLE_VIEWS = {
    admin:   ['mesas', 'pase', 'carta', 'caja', 'reportes', 'config', 'comanda', 'cuenta'],
    mozo:    ['mesas', 'comanda', 'cuenta'],
    cajero:  ['mesas', 'caja', 'comanda', 'cuenta'],
  };

  // Vista con la que arranca cada rol al iniciar sesión.
  const ROLE_HOME = {
    admin: 'mesas',
    mozo: 'mesas',
    cajero: 'mesas',
  };

  function esEstacion(role) {
    return App.Estaciones && App.Estaciones.esRolEstacion(role);
  }

  function navForRole(role) {
    if (esEstacion(role)) return [role];
    return ROLE_NAV[role] || ROLE_NAV.mozo;
  }

  function canAccess(role, view) {
    if (esEstacion(role)) return view === role;
    if (role === 'admin' && esEstacion(view)) return true; // admin entra a toda estación
    var allowed = ROLE_VIEWS[role] || ROLE_VIEWS.mozo;
    return allowed.indexOf(view) !== -1;
  }

  function homeFor(role) {
    if (esEstacion(role)) return role;
    return ROLE_HOME[role] || 'mesas';
  }

  function isEstacionView(view) {
    return esEstacion(view);
  }

  let renderFn = null;

  function setRender(fn) {
    renderFn = fn;
  }

  function getState() {
    return state;
  }

  function setState(partial) {
    Object.assign(state, partial);
    if (renderFn) renderFn();
  }

  function navigate(view, params = {}) {
    state.view = view;
    state.params = params;
    if (renderFn) renderFn();
    window.scrollTo(0, 0);
    document.getElementById('content').scrollTop = 0;
  }

  async function loadSettings() {
    const defaults = {
      businessName: 'Mi Restobar',
      address: '',
      rut: '',
      ivaRate: 19,
      propinaDefault: 10,
      propinaEnabled: true,
      mesaCount: 30,
      currency: 'CLP',
      preciosIncluyenIva: true,
      // Estaciones de preparación (ver estaciones.js)
      estaciones: App.Estaciones ? App.Estaciones.DEFAULTS : [],
    };
    const saved = await App.DB.getMeta('settings', {});
    state.settings = Object.assign({}, defaults, saved);
    if (!Array.isArray(state.settings.estaciones) || state.settings.estaciones.length === 0) {
      state.settings.estaciones = defaults.estaciones;
    }
  }

  async function saveSettings(settings) {
    state.settings = Object.assign({}, state.settings, settings);
    await App.DB.setMeta('settings', state.settings);
  }

  return {
    state,
    setRender,
    getState,
    setState,
    navigate,
    loadSettings,
    saveSettings,
    navForRole,
    canAccess,
    homeFor,
    isEstacionView,
  };
})();
