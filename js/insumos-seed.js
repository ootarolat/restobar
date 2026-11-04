// insumos-seed.js — carga inicial editable de INSUMOS y RECETAS del inventario.
// Equivalente a seed.js pero para el módulo de inventario.
//
// CÓMO EDITARLO:
//   - INSUMOS: una línea por insumo con ins(id, nombre, categoría, unidad,
//     "se compra en", equivalencia). La unidad es 'u', 'g' o 'ml'; la
//     equivalencia es cuántas unidades base trae una unidad de compra
//     (ej. una botella de 750 ml → 750; un kg → 1000; una unidad → 1).
//   - RECETAS: se asignan por NOMBRE del producto de la carta (no por ID).
//     Cada receta es una lista de [insumoId, cantidad en unidad base].
//     Ej. Piscola usa 90 ml de pisco → ['ins-pisco', 90].
//
// Tras editar: en la app, Inventario → "Cargar insumos sugeridos" crea los
// que falten (no duplica ni pisa los existentes), y "Revisar recetas"
// corrige las recetas sugeridas.
App.InsumosSeed = (() => {
  function ins(id, nombre, categoria, unidad, compraNombre, compraFactor) {
    return {
      id: id, nombre: nombre, categoria: categoria, unidad: unidad,
      compraNombre: compraNombre, compraFactor: compraFactor,
      stock: 0, stockMin: 0, stockObjetivo: 0, costo: 0,
      diasReposicion: 2, inicializado: false,
    };
  }

  // ===== INSUMOS =====
  const INSUMOS = [
    // Empanadas (por variedad, se compran por unidad)
    ins('ins-emp-queso', 'Empanada Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-camaron', 'Empanada Camarón Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-carapacho', 'Empanada Carapacho Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-macha', 'Empanada Macha Queso', 'Empanadas', 'u', 'unidad', 1),
    ins('ins-emp-mechada', 'Empanada Mechada Queso', 'Empanadas', 'u', 'unidad', 1),
    // Papas
    ins('ins-papas', 'Papas congeladas', 'Papas', 'g', 'bolsa 2,5 kg', 2500),
    // Proteínas (se controlan en gramos; se compran por kg)
    ins('ins-carne', 'Carne', 'Proteínas', 'g', 'kg', 1000),
    ins('ins-pollo', 'Pollo', 'Proteínas', 'g', 'kg', 1000),
    ins('ins-pescado', 'Pescado', 'Proteínas', 'g', 'kg', 1000),
    // Bebidas (lata, por sabor)
    ins('ins-coca', 'Coca Cola', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-fanta', 'Fanta', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-sprite', 'Sprite', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-coca-lata', 'Coca Cola Lata', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-fanta-lata', 'Fanta Lata', 'Bebidas', 'u', 'unidad', 1),
    ins('ins-sprite-lata', 'Sprite Lata', 'Bebidas', 'u', 'unidad', 1),


    // Pulpas (por sabor; se compran por kg)
    ins('ins-pulpa-frambuesa', 'Pulpa Frambuesa', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-frutilla', 'Pulpa Frutilla', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-mango', 'Pulpa Mango', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-maracuya', 'Pulpa Maracuyá', 'Pulpas', 'g', 'kg', 1000),
    ins('ins-pulpa-pina', 'Pulpa Piña', 'Pulpas', 'g', 'kg', 1000),
    // Cervezas (por marca)
    ins('ins-cerv-lata', 'Cerveza Lata', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-heineken', 'Cerveza Litro Heineken', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-royal', 'Cerveza Litro Royal', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-corona', 'Cerveza Corona', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-cristal', 'Cerveza Cristal', 'Cervezas', 'u', 'unidad', 1),
    ins('ins-cerv-kunstmann', 'Cerveza Kunstmann', 'Cervezas', 'u', 'unidad', 1),
    // Vinos (por etiqueta)
    ins('ins-vino-casillero', 'Vino Casillero del Diablo', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-oveja', 'Vino Oveja Negra', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-viento', 'Vino Viento del Sur', 'Vinos', 'u', 'botella', 1),
    ins('ins-vino-blanco', 'Vino Blanco', 'Vinos', 'u', 'botella', 1),
    // Licores (se controlan en ml; se compran por botella)
    ins('ins-ron', 'Ron', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-pisco', 'Pisco', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-whiskey', 'Whiskey (Jack Daniel\'s)', 'Licores', 'ml', 'botella 750 ml', 750),
    ins('ins-whisky', 'Whisky (Johnnie Walker)', 'Licores', 'ml', 'botella 750 ml', 750),
    // Café
    ins('ins-cafe-grano', 'Café en grano', 'Café', 'g', 'kg', 1000),
    ins('ins-cafe-instantaneo', 'Café instantáneo', 'Café', 'g', 'frasco 170 g', 170),
  ];

  // ===== RECETAS (por NOMBRE de producto) =====
  const PULPA = 100; // g de pulpa por jugo o mojito
  const RECETAS = {
    // Empanadas → su insumo congelado
    'Empanada Queso': [['ins-emp-queso', 1]],
    'Empanada Camaron Queso': [['ins-emp-camaron', 1]],
    'Empanada Carapacho Queso': [['ins-emp-carapacho', 1]],
    'Empanada Macha Queso': [['ins-emp-macha', 1]],
    'Empanada Mechada Queso': [['ins-emp-mechada', 1]],
    // Papas
    'Papas Fritas': [['ins-papas', 500]],
    'Agregado Papas Fritas': [['ins-papas', 250]],
    'Pichanga Promoción': [['ins-papas', 700]],
    'Pichanga Sola': [['ins-papas', 700]],
    // Fondos (proteína; el agregado se controla aparte si tiene insumo)
    'Carne con Agregado': [['ins-carne', 200]],
    'Pollo con Agregado': [['ins-pollo', 200]],
    'Pescado con Agregado': [['ins-pescado', 200]],
    // Bebidas en lata
    'Coca Cola': [['ins-coca', 1]],
    'Coca Cola Lata': [['ins-coca-lata', 1]],
    'Fanta': [['ins-fanta', 1]],
    'Fanta Lata': [['ins-fanta-lata', 1]],
    'Sprite': [['ins-sprite', 1]],
    'Sprite Lata': [['ins-sprite-lata', 1]],
    // Jugos naturales (pulpa por sabor)
    'Jugo Natural Frambuesa': [['ins-pulpa-frambuesa', PULPA]],
    'Jugo Natural Frutilla': [['ins-pulpa-frutilla', PULPA]],
    'Jugo Natural Mango': [['ins-pulpa-mango', PULPA]],
    'Jugo Natural Maracuyá': [['ins-pulpa-maracuya', PULPA]],
    'Jugo Natural Piña': [['ins-pulpa-pina', PULPA]],
    // Cervezas
    'Cerveza Lata': [['ins-cerv-lata', 1]],
    'Cerveza Litro Heineken con Base Michelada': [['ins-cerv-heineken', 1]],
    'Cerveza Litro Royal con Base Michelada': [['ins-cerv-royal', 1]],
    'Cerveza Corona': [['ins-cerv-corona', 1]],
    'Cerveza Cristal': [['ins-cerv-cristal', 1]],
    'Cerveza Kunstmann': [['ins-cerv-kunstmann', 1]],
    // Vinos
    'Botella Vino Blanco': [['ins-vino-blanco', 1]],
    'Botella Vino Casillero del Diablo (Tinto)': [['ins-vino-casillero', 1]],
    'Botella Vino Oveja Negra (Tinto)': [['ins-vino-oveja', 1]],
    'Botella Vino Viento del Sur (Tinto)': [['ins-vino-viento', 1]],
    // Cócteles (ron 90 ml + pulpa; pisco/whisky 90 ml)
    'Mojito Frambuesa': [['ins-ron', 90], ['ins-pulpa-frambuesa', PULPA]],
    'Mojito Frutilla': [['ins-ron', 90], ['ins-pulpa-frutilla', PULPA]],
    'Mojito Mango': [['ins-ron', 90], ['ins-pulpa-mango', PULPA]],
    'Mojito Maracuyá': [['ins-ron', 90], ['ins-pulpa-maracuya', PULPA]],
    'Mojito Piña': [['ins-ron', 90], ['ins-pulpa-pina', PULPA]],
    'Piscola': [['ins-pisco', 90]],
    'Piscola Promoción': [['ins-pisco', 90]],
    'Whiskey': [['ins-whiskey', 90]],
    'Whisky': [['ins-whisky', 90]],
    // Café
    'Café Expresso': [['ins-cafe-grano', 20]],
    'Café Prensa Francesa': [['ins-cafe-grano', 20]],
    'Capuccino': [['ins-cafe-grano', 20]],
  };

  // ===== AGREGADOS (acompañamientos de carne/pollo/pescado) =====
  // Cada plato con requiereAgregado:true pide elegir UNO de estos.
  // El plato queda como una sola línea ("Carne con Agregado — Arroz").
  //   nombre:  lo que ve el mozo y la cocina
  //   precio:  monto que SE SUMA al precio del plato (CLP)
  //   insumos: insumos extra que descuenta el agregado (además de la proteína).
  //            [] = no descuenta nada (ej. arroz sin insumo definido).
  const AGREGADOS = [
    { id: 'arroz', nombre: 'Arroz', precio: 1500, insumos: [] },
    { id: 'papas-fritas', nombre: 'Papas Fritas', precio: 1500, insumos: [['ins-papas', 250]] },
    { id: 'papa-mayo', nombre: 'Papa Mayo', precio: 1500, insumos: [] },
    { id: 'pure', nombre: 'Puré', precio: 1500, insumos: [] },
  ];

  // Nombre normalizado (sin tildes ni mayúsculas) para emparejar productos
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  const RECETAS_N = {};
  Object.keys(RECETAS).forEach(function (n) { RECETAS_N[norm(n)] = RECETAS[n]; });

  // Lista de insumos (copias nuevas, para no mutar las plantillas)
  function insumos() {
    return INSUMOS.map(function (i) { return Object.assign({}, i); });
  }
  // Receta sugerida para un producto, buscada por su nombre
  function recetaDe(producto) {
    var r = producto && RECETAS_N[norm(producto.nombre)];
    return r ? r.map(function (l) { return { insumoId: l[0], cantidad: l[1] }; }) : null;
  }
  // Firma (para reconocer una receta sugerida mal asignada)
  function firmaDe(nombre) {
    var r = RECETAS[nombre];
    if (!r) return null;
    return r.map(function (l) { return l[0] + ':' + Number(l[1]); }).sort().join('|');
  }

  return {
    insumos: insumos,
    recetaDe: recetaDe,
    nombres: function () { return Object.keys(RECETAS); },
    firmaDe: firmaDe,
    norm: norm,
    agregados: function () { return AGREGADOS.map(function (a) { return Object.assign({}, a); }); },
    agregado: function (id) { return AGREGADOS.filter(function (a) { return a.id === id; })[0] || null; },
  };
})();
