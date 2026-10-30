// estaciones.js — estaciones de preparación (cocina, bar, ...).
//
// Cada producto se prepara en un ÁREA (= id de estación). Al enviar un
// pedido, los items se agrupan por área y se crea UNA TANDA POR ÁREA.
// Cada estación ve y avanza solo sus tandas. El cobro no cambia: se sigue
// cobrando sobre comanda.items.
//
// Resolución del área de un producto:
//   producto.area  →  categoria.area  →  sugerencia por nombre de categoría
//   →  estación principal ('cocina').
// Tandas antiguas sin 'area' se consideran de 'cocina' (compatibilidad).
//
// El id de una estación es también el ROL de sus usuarios en Firestore
// (usuarios/{uid}.role = 'bar' → ve solo la pantalla del Bar).
//
// Las estaciones son configurables (Configuración → Estaciones) y se
// guardan en settings.estaciones (colección meta).
App.Estaciones = (() => {
  const DEFAULTS = [
    { id: 'cocina', nombre: 'Cocina', icono: '🍳', recordatorioMin: 8 },
    { id: 'bar', nombre: 'Bar', icono: '🍹', recordatorioMin: 4 },
  ];

  // Ids que no pueden usarse como estación (chocan con roles o vistas)
  const RESERVED = ['admin', 'mozo', 'cajero', 'pase', 'mesas', 'carta', 'caja',
    'reportes', 'config', 'comanda', 'cuenta'];

  // Palabras que sugieren que una categoría se prepara en el bar
  const BAR_RE = /(bebida|cerveza|vino|c[oó]ctel|trago|caf[eé]|\bt[eé]\b|jugo|licor|pisco|whisk|refresco|gaseosa|bar\b)/i;

  function list() {
    var s = App.Store && App.Store.state.settings ? App.Store.state.settings.estaciones : null;
    if (Array.isArray(s) && s.length > 0) return s;
    return DEFAULTS;
  }

  function ids() {
    return list().map(function (e) { return e.id; });
  }

  function exists(id) {
    return ids().indexOf(id) !== -1;
  }

  function principal() {
    return exists('cocina') ? 'cocina' : list()[0].id;
  }

  function get(id) {
    var found = list().filter(function (e) { return e.id === id; })[0];
    return found || { id: id, nombre: id, icono: '📦', recordatorioMin: 8 };
  }

  // Área válida (si la estación fue eliminada, cae en la principal)
  function normalizar(area) {
    return area && exists(area) ? area : principal();
  }

  function sugerirArea(nombreCategoria) {
    if (nombreCategoria && BAR_RE.test(nombreCategoria) && exists('bar')) return 'bar';
    return principal();
  }

  function areaDe(producto, categoria) {
    if (producto && producto.area && exists(producto.area)) return producto.area;
    if (categoria && categoria.area && exists(categoria.area)) return categoria.area;
    return sugerirArea(categoria ? categoria.nombre : '');
  }

  async function areaDeProductoId(productoId) {
    var p = await App.DB.get('productos', productoId);
    var c = p ? await App.DB.get('categorias', p.categoriaId) : null;
    return areaDe(p, c);
  }

  // Área de una tanda (las antiguas no tienen 'area' → cocina)
  function tandaArea(t) {
    return normalizar(t && t.area ? t.area : 'cocina');
  }

  function esRolEstacion(role) {
    return !!role && exists(role);
  }

  function label(id) {
    var e = get(id);
    return e.icono + ' ' + e.nombre;
  }

  // 'Parrilla Norte' → 'parrilla-norte'
  function slug(nombre) {
    return String(nombre || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function isReserved(id) {
    return RESERVED.indexOf(id) !== -1;
  }

  return {
    DEFAULTS: DEFAULTS,
    list: list,
    ids: ids,
    exists: exists,
    principal: principal,
    get: get,
    label: label,
    normalizar: normalizar,
    sugerirArea: sugerirArea,
    areaDe: areaDe,
    areaDeProductoId: areaDeProductoId,
    tandaArea: tandaArea,
    esRolEstacion: esRolEstacion,
    slug: slug,
    isReserved: isReserved,
  };
})();
