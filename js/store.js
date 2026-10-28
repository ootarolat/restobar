// store.js — state management and navigation for Restobar POS
App.Store = (() => {
  const state = {
    view: 'mesas',
    params: {},
    settings: {},
    userRole: 'mozo',
  };

  // ===== Role-based access control =====
  // Pestañas (nav) visibles por rol. Las vistas internas de flujo
  // (comanda, cuenta) se permiten implícitamente según la pestaña base.
  const ROLE_NAV = {
    // Admin: Caja se accede desde Configuración (no en el nav)
    admin:   ['mesas', 'cocina', 'carta', 'reportes'],
    mozo:    ['mesas'],
    // Cajero: Caja es su herramienta principal → se queda en el nav
    cajero:  ['mesas', 'caja'],
    cocina:  ['cocina'],
  };

  // Vistas a las que cada rol puede acceder (incluye flujos internos).
  const ROLE_VIEWS = {
    admin:   ['mesas', 'cocina', 'carta', 'caja', 'reportes', 'config', 'comanda', 'cuenta'],
    mozo:    ['mesas', 'comanda', 'cuenta'],
    cajero:  ['mesas', 'caja', 'comanda', 'cuenta'],
    cocina:  ['cocina'],
  };

  // Vista con la que arranca cada rol al iniciar sesión.
  const ROLE_HOME = {
    admin: 'mesas',
    mozo: 'mesas',
    cajero: 'mesas',
    cocina: 'cocina',
  };

  function navForRole(role) {
    return ROLE_NAV[role] || ROLE_NAV.mozo;
  }

  function canAccess(role, view) {
    var allowed = ROLE_VIEWS[role] || ROLE_VIEWS.mozo;
    return allowed.indexOf(view) !== -1;
  }

  function homeFor(role) {
    return ROLE_HOME[role] || 'mesas';
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
    };
    const saved = await App.DB.getMeta('settings', {});
    state.settings = Object.assign({}, defaults, saved);
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
  };
})();
