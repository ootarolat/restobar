// store.js — state management and navigation for Restobar POS
App.Store = (() => {
  const state = {
    view: 'mesas',
    params: {},
    settings: {},
    userRole: 'mozo',
  };

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
  };
})();
