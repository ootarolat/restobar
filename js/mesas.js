// mesas.js — table grid view and actions
App.Views = App.Views || {};
App.Actions = App.Actions || {};

App.Views.mesas = async function () {
  const mesas = await App.DB.getAll('mesas');
  mesas.sort((a, b) => a.numero - b.numero);

  // Load comandas for occupied tables to show totals
  const ocupadas = mesas.filter((m) => m.estado === 'ocupada' && m.comandaId);
  const comandas = await Promise.all(ocupadas.map((m) => App.DB.get('comandas', m.comandaId)));
  const comandaMap = {};
  comandas.forEach((c) => { if (c) comandaMap[c.id] = c; });

  const libres = mesas.filter((m) => m.estado === 'libre').length;
  const ocup = mesas.filter((m) => m.estado === 'ocupada').length;
  const res = mesas.filter((m) => m.estado === 'reservada').length;

  let html =
    '<div class="view">' +
    '<div class="view-title">Mesas</div>' +
    '<div class="view-subtitle">' + libres + ' libres · ' + ocup + ' ocupadas · ' + res + ' reservadas</div>' +
    '<div class="mesa-grid">';

  mesas.forEach(function (mesa) {
    let totalHtml = '';
    if (mesa.estado === 'ocupada' && mesa.comandaId && comandaMap[mesa.comandaId]) {
      const comanda = comandaMap[mesa.comandaId];
      if (comanda.items && comanda.items.length > 0) {
        const sum = comanda.items.reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
        totalHtml = '<div class="mesa-total">' + App.Utils.formatCLP(sum) + '</div>';
      }
    }
    html +=
      '<div class="mesa-card ' + mesa.estado + '" onclick="App.Actions.tapMesa(\'' + mesa.id + '\')">' +
      '<span class="mesa-badge ' + mesa.estado + '"></span>' +
      '<div class="mesa-numero">' + mesa.numero + '</div>' +
      '<div class="mesa-capacidad">' + mesa.capacidad + ' pers.</div>' +
      totalHtml +
      '</div>';
  });

  html += '</div></div>';
  return html;
};

App.Actions.tapMesa = async function (mesaId) {
  const mesa = await App.DB.get('mesas', mesaId);
  if (!mesa) return;

  if (mesa.estado === 'libre' || mesa.estado === 'reservada') {
    // Start new comanda
    const comanda = {
      id: App.Utils.uid('com'),
      mesaId: mesa.id,
      items: [],
      estado: 'abierta',
      fecha: Date.now(),
    };
    await App.DB.put('comandas', comanda);
    mesa.estado = 'ocupada';
    mesa.comandaId = comanda.id;
    await App.DB.put('mesas', mesa);
    App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: comanda.id });
  } else if (mesa.estado === 'ocupada') {
    // View existing comanda
    if (mesa.comandaId) {
      App.Store.navigate('comanda', { mesaId: mesa.id, comandaId: mesa.comandaId });
    } else {
      // Orphaned occupied state — fix it
      mesa.estado = 'libre';
      await App.DB.put('mesas', mesa);
      App.render();
    }
  }
};
