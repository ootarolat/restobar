// app-config.js — configuración fija de la aplicación.
//
// Fija aquí la URL del backend de Google Apps Script (la que termina en /exec).
// Si la dejas, todos los equipos que abran la app la usarán automáticamente
// y NO tendrán que configurarla manualmente en la pantalla de login.
//
// Si un equipo guarda su propia URL desde "Configurar servidor", esa tiene
// prioridad sobre esta (útil para apuntar a un backend distinto puntualmente).
//
// Déjala como cadena vacía ('') para exigir configuración manual en cada equipo.
window.APP_CONFIG = {
  // Ejemplo: 'https://script.google.com/macros/s/AKfy.../exec'
  backendUrl: 'https://script.google.com/macros/s/AKfycbzle30lJU7o_GSzDeSPjzQzxINim3S8qhVr2wie0-d0H8hQfiLQbfNe-neeABnHNJz7yg/exec',
};
