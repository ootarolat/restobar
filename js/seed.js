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
    //  { id: 'cat-pizzas', nombre: 'Pizzas', orden: 2 },
    //  { id: 'cat-sandwiches', nombre: 'Sandwiches', orden: 3 },
      { id: 'cat-ensaladas', nombre: 'Ensaladas', orden: 4 },
      { id: 'cat-fondo', nombre: 'Fondo', orden: 5 },
    //  { id: 'cat-postres', nombre: 'Postres', orden: 6 },
      { id: 'cat-bebidas', nombre: 'Bebidas', orden: 7 },
      { id: 'cat-cervezas', nombre: 'Cervezas', orden: 8 },
      { id: 'cat-vinos', nombre: 'Vinos', orden: 9 },
      { id: 'cat-cocteles', nombre: 'Cocteles', orden: 10 },
      { id: 'cat-cafe', nombre: 'Café y Té', orden: 11 },
    ];
    await App.DB.bulkPut('categorias', categorias);

    // Products (Chilean prices in CLP)
    const productos = [
      // Entradas
      { id: 'p1', nombre: 'Papas Fritas', categoriaId: 'cat-entradas', precio: 3500, descripcion: 'Crujientes con salsa de la casa', disponible: true },
      { id: 'p2', nombre: 'Nachos con Queso', categoriaId: 'cat-entradas', precio: 4500, descripcion: 'Tortillas, queso fundido, guacamole', disponible: false },
      { id: 'p3', nombre: 'Tabla de Quesos', categoriaId: 'cat-entradas', precio: 8900, descripcion: 'Selección de quesos y frutos secos', disponible: false },
      { id: 'p4', nombre: 'Choripán', categoriaId: 'cat-entradas', precio: 3200, descripcion: 'Chorizo artesanal, pan, pebre', disponible: false },
      { id: 'p5', nombre: 'Chicharrón de Mote', categoriaId: 'cat-entradas', precio: 5500, descripcion: 'Carnes crocantes, mote, limón', disponible: false },
      // Pizzas
      { id: 'p6', nombre: 'Pizza Margarita', categoriaId: 'cat-pizzas', precio: 6900, descripcion: 'Tomate, mozzarella, albahaca', disponible: false },
      { id: 'p7', nombre: 'Pizza Pepperoni', categoriaId: 'cat-pizzas', precio: 8900, descripcion: 'Pepperoni, mozzarella, tomate', disponible: false },
      { id: 'p8', nombre: 'Pizza Cuatro Quesos', categoriaId: 'cat-pizzas', precio: 9500, descripcion: 'Mozzarella, parmesano, gorgonzola, fontina', disponible: false },
      { id: 'p9', nombre: 'Pizza Especial Restobar', categoriaId: 'cat-pizzas', precio: 10900, descripcion: 'Carne, tocino, champiñones, extra queso', disponible: false },
      // Sandwiches
      { id: 'p10', nombre: 'Lomito Completo', categoriaId: 'cat-sandwiches', precio: 5500, descripcion: 'Lomo de cerdo, tomate, palta, mayo', disponible: false },
      { id: 'p11', nombre: 'Churrasco a lo Pobre', categoriaId: 'cat-sandwiches', precio: 6900, descripcion: 'Carne, huevo, cebolla, palta', disponible: false },
      { id: 'p12', nombre: 'Sandwich Italiano', categoriaId: 'cat-sandwiches', precio: 5200, descripcion: 'Lomo, tomate, palta, mayo', disponible: false },
      // Ensaladas
      { id: 'p13', nombre: 'Ensalada César', categoriaId: 'cat-ensaladas', precio: 5500, descripcion: 'Lechuga, pollo, crutones, parmesano', disponible: false },
      { id: 'p14', nombre: 'Ensalada Restobar', categoriaId: 'cat-ensaladas', precio: 6500, descripcion: 'Mixta, queso de cabra, frutos secos', disponible: false },
      // Fondo
      { id: 'p15', nombre: 'Lomo Vetado', categoriaId: 'cat-fondo', precio: 14500, descripcion: '200g, puré, verduras', disponible: true },
      { id: 'p16', nombre: 'Pollo Asado', categoriaId: 'cat-fondo', precio: 9900, descripcion: 'Pechuga, papas, ensalada', disponible: true },
      { id: 'p17', nombre: 'Pasta Alfredo', categoriaId: 'cat-fondo', precio: 8500, descripcion: 'Fettuccine, salsa cremosa, pollo', disponible: true },
      { id: 'p18', nombre: 'Pescado Frito', categoriaId: 'cat-fondo', precio: 12500, descripcion: 'Reineta, arroz, ensalada', disponible: true },
      // Postres
      { id: 'p19', nombre: 'Tiramisú', categoriaId: 'cat-postres', precio: 3500, descripcion: 'Clásico italiano', disponible: false },
      { id: 'p20', nombre: 'Cheesecake', categoriaId: 'cat-postres', precio: 3500, descripcion: 'Con frutos rojos', disponible: false },
      { id: 'p21', nombre: 'Volcán de Chocolate', categoriaId: 'cat-postres', precio: 4200, descripcion: 'Con helado de vainilla', disponible: false },
      // Bebidas
      { id: 'p22', nombre: 'Coca Cola', categoriaId: 'cat-bebidas', precio: 1800, descripcion: '', disponible: true },
      { id: 'p23', nombre: 'Sprite', categoriaId: 'cat-bebidas', precio: 1800, descripcion: '', disponible: true },
      { id: 'p24', nombre: 'Jugo Natural', categoriaId: 'cat-bebidas', precio: 2500, descripcion: 'Frutilla, mango, frambuesa', disponible: true },
      { id: 'p25', nombre: 'Agua Mineral', categoriaId: 'cat-bebidas', precio: 1500, descripcion: 'Con o sin gas', disponible: false },
      // Cervezas
      { id: 'p26', nombre: 'Cerveza Litro', categoriaId: 'cat-cervezas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p27', nombre: 'Cerveza Lata', categoriaId: 'cat-cervezas', precio: 3000, descripcion: '', disponible: true },
      { id: 'p28', nombre: 'Tabla Degustación 3 Cervezas', categoriaId: 'cat-cervezas', precio: 12000, descripcion: '3 variedades artesanales', disponible: false },
      // Vinos
      { id: 'p29', nombre: 'Vino Copa', categoriaId: 'cat-vinos', precio: 3500, descripcion: 'Tinto o blanco', disponible: true },
      { id: 'p30', nombre: 'Botella Vino Tinto', categoriaId: 'cat-vinos', precio: 18000, descripcion: 'Casa', disponible: true },
      { id: 'p31', nombre: 'Botella Vino Blanco', categoriaId: 'cat-vinos', precio: 17000, descripcion: 'Casa', disponible: true },
      // Cocteles
      { id: 'p32', nombre: 'Pisco Sour', categoriaId: 'cat-cocteles', precio: 4500, descripcion: 'Pisco, limón, jarabe, clara de huevo', disponible: true },
      { id: 'p33', nombre: 'Mojito', categoriaId: 'cat-cocteles', precio: 5000, descripcion: 'Ron, menta, lima, soda', disponible: true },
      { id: 'p34', nombre: 'Aperol Spritz', categoriaId: 'cat-cocteles', precio: 5500, descripcion: 'Aperol, prosecco, soda', disponible: false },
      { id: 'p35', nombre: 'Margarita', categoriaId: 'cat-cocteles', precio: 5200, descripcion: 'Tequila, triple sec, limón', disponible: false },
      // Café
      { id: 'p36', nombre: 'Café Expresso', categoriaId: 'cat-cafe', precio: 1500, descripcion: '', disponible: true },
      { id: 'p37', nombre: 'Café Latte', categoriaId: 'cat-cafe', precio: 2500, descripcion: '', disponible: false },
      { id: 'p38', nombre: 'Capuccino', categoriaId: 'cat-cafe', precio: 2500, descripcion: '', disponible: false },
      { id: 'p39', nombre: 'Té o Infusión', categoriaId: 'cat-cafe', precio: 1500, descripcion: 'Variada selección', disponible: true },
    ];
    await App.DB.bulkPut('productos', productos);

    App.Utils.toast('Datos de ejemplo cargados', 'success');
  }

  return { run };
})();
