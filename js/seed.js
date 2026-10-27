// seed.js — initial demo data for Restobar POS
App.Seed = (() => {
  async function run() {
    const mesaCount = await App.DB.count('mesas');
    if (mesaCount > 0) return; // already seeded

    // Tables
    const mesas = [];
    for (let i = 1; i <= 36; i++) {
      const capacidad = i <= 8 ? 4 : i <= 20 ? 4 : 4;
      mesas.push({
        id: 'mesa-' + i,
        numero: i,
        capacidad,
        estado: 'libre',
        comandaId: null,
      });
    }
    await App.DB.bulkPut('mesas', mesas);

    // Categories
    const categorias = [
      { id: 'cat-entradas', nombre: 'Entradas', orden: 1 },
      { id: 'cat-pizzas', nombre: 'Pizzas', orden: 2 },
      { id: 'cat-sandwiches', nombre: 'Sandwiches', orden: 3 },
      { id: 'cat-ensaladas', nombre: 'Ensaladas', orden: 4 },
      { id: 'cat-fondo', nombre: 'Fondo', orden: 5 },
      { id: 'cat-postres', nombre: 'Postres', orden: 6 },
      { id: 'cat-bebidas', nombre: 'Bebidas', orden: 7 },
      { id: 'cat-cervezas', nombre: 'Cervezas', orden: 8 },
      { id: 'cat-vinos', nombre: 'Vinos', orden: 9 },
      { id: 'cat-cocteles', nombre: 'Cocteles', orden: 10 },
      { id: 'cat-cafe', nombre: 'Café / Té', orden: 11 },
    ];
    await App.DB.bulkPut('categorias', categorias);

    // Products (Chilean prices in CLP)
    const productos = [
      // Entradas
      { id: 'p101', nombre: 'Papas Fritas', categoriaId: 'cat-entradas', precio: 3500, descripcion: '', disponible: true },
      { id: 'p102', nombre: 'Empanada Queso', categoriaId: 'cat-entradas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p103', nombre: 'Empanada Camaron Queso', categoriaId: 'cat-entradas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p104', nombre: 'Empanada Carapacho Queso', categoriaId: 'cat-entradas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p105', nombre: 'Empanada Macha Queso', categoriaId: 'cat-entradas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p106', nombre: 'Empanada Mechada Queso', categoriaId: 'cat-entradas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p107', nombre: 'Ceviche', categoriaId: 'cat-entradas', precio: 2500, descripcion: '', disponible: true },
      // Pizzas
      { id: 'p201', nombre: 'Pizza Margarita', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p202', nombre: 'Pizza Pepperoni', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p203', nombre: 'Pizza Cuatro Quesos', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p204', nombre: 'Pizza Especial Restobar', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      // Sandwiches
      { id: 'p301', nombre: 'Completo', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '', disponible: true },
      { id: 'p302', nombre: 'Completo Italiano', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '', disponible: true },
      { id: 'p303', nombre: 'Sandwich', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '', disponible: false },
      // Ensaladas
      { id: 'p401', nombre: 'Ensalada a la Chilena', categoriaId: 'cat-ensaladas', precio: 5500, descripcion: 'Cebolla, Tomate', disponible: true },
      { id: 'p402', nombre: 'Ensalada Surtida', categoriaId: 'cat-ensaladas', precio: 6500, descripcion: 'Lechuga, Tomate, Zanahoria', disponible: true },
      // Fondo
      { id: 'p501', nombre: 'Colacion Carne / Arroz', categoriaId: 'cat-fondo', precio: 6500, descripcion: '', disponible: true },
      { id: 'p502', nombre: 'Colacion Carne / Papas Mayo', categoriaId: 'cat-fondo', precio: 6500, descripcion: '', disponible: true },
      { id: 'p503', nombre: 'Colacion Pollo / Arroz', categoriaId: 'cat-fondo', precio: 6500, descripcion: '', disponible: true },
      { id: 'p504', nombre: 'Colacion Pollo / Papas Mayo', categoriaId: 'cat-fondo', precio: 6500, descripcion: '', disponible: true },
      { id: 'p505', nombre: 'Pescado con Agregado', categoriaId: 'cat-fondo', precio: 6500, descripcion: '', disponible: true },
      // Postres
      { id: 'p601', nombre: 'Helado', categoriaId: 'cat-postres', precio: 3500, descripcion: '', disponible: true },
      { id: 'p602', nombre: 'Torta', categoriaId: 'cat-postres', precio: 3500, descripcion: '', disponible: false },
      { id: 'p603', nombre: 'Volcán de Chocolate', categoriaId: 'cat-postres', precio: 4200, descripcion: 'Con helado de vainilla', disponible: false },
      // Bebidas
      { id: 'p701', nombre: 'Coca Cola', categoriaId: 'cat-bebidas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p702', nombre: 'Sprite', categoriaId: 'cat-bebidas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p703', nombre: 'Jugo Natural', categoriaId: 'cat-bebidas', precio: 2500, descripcion: 'Frutilla, mango, frambuesa', disponible: true },
      { id: 'p704', nombre: 'Agua Mineral', categoriaId: 'cat-bebidas', precio: 0, descripcion: '', disponible: false },
      // Cervezas
      { id: 'p801', nombre: 'Cerveza Litro', categoriaId: 'cat-cervezas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p802', nombre: 'Cerveza Lata', categoriaId: 'cat-cervezas', precio: 3000, descripcion: '', disponible: true },
      { id: 'p803', nombre: 'Tabla Degustación 3 Cervezas', categoriaId: 'cat-cervezas', precio: 0, descripcion: '', disponible: false },
      // Vinos
      { id: 'p901', nombre: 'Vino Copa', categoriaId: 'cat-vinos', precio: 3500, descripcion: '', disponible: true },
      { id: 'p902', nombre: 'Botella Vino Tinto', categoriaId: 'cat-vinos', precio: 12000, descripcion: '', disponible: true },
      { id: 'p903', nombre: 'Botella Vino Blanco', categoriaId: 'cat-vinos', precio: 12000, descripcion: '', disponible: true },
      // Cocteles
      { id: 'p1001', nombre: 'Mojito', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1002', nombre: 'Piscola', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1003', nombre: 'Piscola Promoción', categoriaId: 'cat-cocteles', precio: 7000, descripcion: '', disponible: true },
      { id: 'p1004', nombre: 'Whiskey', categoriaId: 'cat-cocteles', precio: 5000, descripcion: 'Jack Daniel'+'s', disponible: true },
      { id: 'p1005', nombre: 'Whisky', categoriaId: 'cat-cocteles', precio: 4500, descripcion: 'Johnnie Walker', disponible: true },
      // Café
      { id: 'p1101', nombre: 'Café Expresso', categoriaId: 'cat-cafe', precio: 1500, descripcion: '', disponible: true },
      { id: 'p1102', nombre: 'Café Latte', categoriaId: 'cat-cafe', precio: 0, descripcion: '', disponible: false },
      { id: 'p1103', nombre: 'Capuccino', categoriaId: 'cat-cafe', precio: 0, descripcion: '', disponible: false },
      { id: 'p1104', nombre: 'Té o Infusión', categoriaId: 'cat-cafe', precio: 1500, descripcion: '', disponible: true },
    ];
    await App.DB.bulkPut('productos', productos);

    App.Utils.toast('Datos de ejemplo cargados', 'success');
  }

  return { run };
})();
