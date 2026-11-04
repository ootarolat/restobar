// seed.js — initial demo data for Restobar POS
App.Seed = (() => {
  async function run(force) {
    const mesaCount = await App.DB.count('mesas');
    if (mesaCount > 0 && !force) return; // already seeded

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
      { id: 'cat-entradas', nombre: 'Entradas', orden: 1, area: 'cocina' },
      { id: 'cat-pizzas', nombre: 'Pizzas', orden: 2, area: 'cocina' },
      { id: 'cat-sandwiches', nombre: 'Sandwiches', orden: 3, area: 'cocina' },
      { id: 'cat-ensaladas', nombre: 'Ensaladas', orden: 4, area: 'cocina' },
      { id: 'cat-fondo', nombre: 'Fondo', orden: 5, area: 'cocina' },
      { id: 'cat-postres', nombre: 'Postres', orden: 6, area: 'cocina' },
      { id: 'cat-bebidas', nombre: 'Bebidas', orden: 7, area: 'bar' },
      { id: 'cat-cervezas', nombre: 'Cervezas', orden: 8, area: 'bar' },
      { id: 'cat-vinos', nombre: 'Vinos', orden: 9, area: 'bar' },
      { id: 'cat-cocteles', nombre: 'Cocteles', orden: 10, area: 'bar' },
      { id: 'cat-cafe', nombre: 'Café / Té', orden: 11, area: 'bar' },
    ];
    // area = estación donde se prepara (ver estaciones.js)
    await App.DB.bulkPut('categorias', categorias);

    // Products (Chilean prices in CLP)
    // despachoDirecto: productos que no requieren preparación (lata, agua):
    // al enviarse quedan directamente "listos" para que el mozo los retire.
    const productos = [
      // Entradas
      { id: 'p101', nombre: 'Ceviche Machas', categoriaId: 'cat-entradas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p102', nombre: 'Ceviche Reineta', categoriaId: 'cat-entradas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p103', nombre: 'Ceviche Salmón', categoriaId: 'cat-entradas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p104', nombre: 'Ceviche Promoción (x3)', categoriaId: 'cat-entradas', precio: 12000, descripcion: '', disponible: true },
      { id: 'p105', nombre: 'Empanada Queso', categoriaId: 'cat-entradas', precio: 1500, descripcion: '', disponible: true },
      { id: 'p106', nombre: 'Empanada Camaron Queso', categoriaId: 'cat-entradas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p107', nombre: 'Empanada Carapacho Queso', categoriaId: 'cat-entradas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p108', nombre: 'Empanada Macha Queso', categoriaId: 'cat-entradas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p109', nombre: 'Empanada Mechada Queso', categoriaId: 'cat-entradas', precio: 2000, descripcion: '', disponible: true },
      { id: 'p110', nombre: 'Papas Fritas', categoriaId: 'cat-entradas', precio: 4000, descripcion: '', disponible: true },
      // Pizzas
      { id: 'p201', nombre: 'Pizza Cuatro Quesos', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p202', nombre: 'Pizza Margarita', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p203', nombre: 'Pizza Pepperoni', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      { id: 'p204', nombre: 'Pizza Especial Restobar', categoriaId: 'cat-pizzas', precio: 0, descripcion: '', disponible: false },
      // Sandwiches
      { id: 'p301', nombre: 'Completo', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '2500', disponible: true },
      { id: 'p302', nombre: 'Completo Italiano', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '3000', disponible: true },
      { id: 'p303', nombre: 'Sandwich', categoriaId: 'cat-sandwiches', precio: 0, descripcion: '', disponible: false },
      // Ensaladas
      { id: 'p401', nombre: 'Ensalada a la Chilena', categoriaId: 'cat-ensaladas', precio: 5500, descripcion: 'Cebolla, Tomate', disponible: true },
      { id: 'p402', nombre: 'Ensalada Surtida', categoriaId: 'cat-ensaladas', precio: 6500, descripcion: 'Lechuga, Tomate, Zanahoria', disponible: true },
      // Fondo
      { id: 'p501', nombre: 'Carne con Agregado', categoriaId: 'cat-fondo', precio: 5000, descripcion: '', disponible: true, requiereAgregado: true },
      { id: 'p502', nombre: 'Pollo con Agregado', categoriaId: 'cat-fondo', precio: 5000, descripcion: '', disponible: true, requiereAgregado: true },
      { id: 'p503', nombre: 'Pescado con Agregado', categoriaId: 'cat-fondo', precio: 5000, descripcion: '', disponible: true, requiereAgregado: true },
      { id: 'p504', nombre: 'Agregado Arroz', categoriaId: 'cat-fondo', precio: 1500, descripcion: '', disponible: true },
      { id: 'p505', nombre: 'Agregado Papas Fritas', categoriaId: 'cat-fondo', precio: 3000, descripcion: '', disponible: true },
      { id: 'p506', nombre: 'Agregado Papa Mayo', categoriaId: 'cat-fondo', precio: 1500, descripcion: '', disponible: true },
      { id: 'p507', nombre: 'Agregado Puré', categoriaId: 'cat-fondo', precio: 1500, descripcion: '', disponible: true },
      { id: 'p508', nombre: 'Pichanga Promoción', categoriaId: 'cat-fondo', precio: 15000, descripcion: '', disponible: true },
      { id: 'p509', nombre: 'Pichanga Sola', categoriaId: 'cat-fondo', precio: 18000, descripcion: '', disponible: true },    
      // Postres
      { id: 'p601', nombre: 'Helado', categoriaId: 'cat-postres', precio: 3500, descripcion: '', disponible: true },
      { id: 'p602', nombre: 'Torta', categoriaId: 'cat-postres', precio: 3500, descripcion: '', disponible: false },
      { id: 'p603', nombre: 'Volcán de Chocolate', categoriaId: 'cat-postres', precio: 4200, descripcion: 'Con helado de vainilla', disponible: false },
      // Bebidas
      { id: 'p701', nombre: 'Agua Mineral', categoriaId: 'cat-bebidas', precio: 1500, descripcion: '', disponible: false, despachoDirecto: false },
      { id: 'p702', nombre: 'Coca Cola', categoriaId: 'cat-bebidas', precio: 2000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p703', nombre: 'Coca Cola Lata', categoriaId: 'cat-bebidas', precio: 3000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p704', nombre: 'Fanta', categoriaId: 'cat-bebidas', precio: 2000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p705', nombre: 'Fanta Lata', categoriaId: 'cat-bebidas', precio: 3000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p706', nombre: 'Sprite', categoriaId: 'cat-bebidas', precio: 2000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p707', nombre: 'Sprite Lata', categoriaId: 'cat-bebidas', precio: 3000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p708', nombre: 'Jugo Natural Frambuesa', categoriaId: 'cat-bebidas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p709', nombre: 'Jugo Natural Frutilla', categoriaId: 'cat-bebidas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p710', nombre: 'Jugo Natural Mango', categoriaId: 'cat-bebidas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p711', nombre: 'Jugo Natural Maracuyá', categoriaId: 'cat-bebidas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p712', nombre: 'Jugo Natural Piña', categoriaId: 'cat-bebidas', precio: 2500, descripcion: '', disponible: true },
      { id: 'p713', nombre: 'Terremoto Niños', categoriaId: 'cat-bebidas', precio: 3000, descripcion: '', disponible: true },
      // Cervezas
      { id: 'p801', nombre: 'Base Michelada', categoriaId: 'cat-cervezas', precio: 1000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p802', nombre: 'Cerveza Lata', categoriaId: 'cat-cervezas', precio: 3000, descripcion: '', disponible: true, despachoDirecto: false },
      { id: 'p803', nombre: 'Cerveza Litro Heineken con Base Michelada', categoriaId: 'cat-cervezas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p804', nombre: 'Cerveza Litro Royal con Base Michelada', categoriaId: 'cat-cervezas', precio: 5000, descripcion: '', disponible: true },
      { id: 'p805', nombre: 'Cerveza Corona', categoriaId: 'cat-cervezas', precio: 3500, descripcion: '', disponible: true },
      { id: 'p806', nombre: 'Cerveza Cristal', categoriaId: 'cat-cervezas', precio: 3000, descripcion: '', disponible: true },
      { id: 'p807', nombre: 'Cerveza Kunstmann', categoriaId: 'cat-cervezas', precio: 4500, descripcion: '', disponible: true },
      // Vinos
      { id: 'p901', nombre: 'Botella Vino Blanco', categoriaId: 'cat-vinos', precio: 12000, descripcion: '', disponible: false },
      { id: 'p902', nombre: 'Botella Vino Casillero del Diablo (Tinto)', categoriaId: 'cat-vinos', precio: 12000, descripcion: '', disponible: true },
      { id: 'p903', nombre: 'Botella Vino Oveja Negra (Tinto)', categoriaId: 'cat-vinos', precio: 15000, descripcion: '', disponible: true },
      { id: 'p904', nombre: 'Botella Vino Viento del Sur (Tinto)', categoriaId: 'cat-vinos', precio: 15000, descripcion: '', disponible: true },
      // Cocteles
      { id: 'p1001', nombre: 'Mojito Frambuesa', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1002', nombre: 'Mojito Frutilla', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1003', nombre: 'Mojito Mango', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1004', nombre: 'Mojito Maracuyá', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1005', nombre: 'Mojito Piña', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1006', nombre: 'Piscola', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1007', nombre: 'Piscola Promoción', categoriaId: 'cat-cocteles', precio: 7000, descripcion: '', disponible: true },
      { id: 'p1008', nombre: 'Ron', categoriaId: 'cat-cocteles', precio: 4000, descripcion: '', disponible: true },
      { id: 'p1009', nombre: 'Ron Promoción', categoriaId: 'cat-cocteles', precio: 7000, descripcion: '', disponible: true },  
      { id: 'p1010', nombre: 'Terremoto', categoriaId: 'cat-cocteles', precio: 5000, descripcion: '', disponible: true },
      { id: 'p1011', nombre: 'Whiskey', categoriaId: 'cat-cocteles', precio: 5000, descripcion: 'Jack Daniel'+'s', disponible: true },
      { id: 'p1012', nombre: 'Whisky', categoriaId: 'cat-cocteles', precio: 4500, descripcion: 'Johnnie Walker', disponible: true },
      // Café
      { id: 'p1101', nombre: 'Café Expresso', categoriaId: 'cat-cafe', precio: 2000, descripcion: '', disponible: true },
      { id: 'p1102', nombre: 'Café Prensa Francesa', categoriaId: 'cat-cafe', precio: 2500, descripcion: '', disponible: true },
      { id: 'p1103', nombre: 'Capuccino', categoriaId: 'cat-cafe', precio: 0, descripcion: '', disponible: false },
      { id: 'p1104', nombre: 'Té o Infusión', categoriaId: 'cat-cafe', precio: 1500, descripcion: '', disponible: true },
    ];
    await App.DB.bulkPut('productos', productos);

    App.Utils.toast('Datos de ejemplo cargados', 'success');
  }

  return { run };
})();
