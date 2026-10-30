---
inclusion: always
---

# Estructura del proyecto

```
index.html            Shell + orden de carga de scripts
sw.js                 Service worker (CACHE_NAME = versión, FILES = app shell)
manifest.json, icon.svg
css/style.css         Tema oscuro mobile-first (variables en :root)
firebase/firestore.rules  Reglas por rol (publicar manualmente en la consola)
js/
  firebase-config.js  Config pública de Firebase
  firebase-init.js    (módulo) init Firebase → window.FB
  db.js               App.DB: cache realtime + put/update(transacción)/remove/meta
  utils.js            App.Utils: formato, toast, modal, sonidos, calcTotales
  store.js            App.Store: estado, navegación, roles/permisos, settings
  estaciones.js       App.Estaciones: estaciones configurables y resolución de área
  seed.js             Datos de ejemplo (solo admin, si está vacío)
  mesas.js            Vista Mesas, claim de mesa, servir por estación, reasignar mozo
  carta.js            Carta: productos (área, despacho directo) y categorías (área)
  comanda.js          Toma de pedido, envío dividido por estación, anulaciones, liberar mesa
  cuenta.js           Cobro: propina, pago dividido, registro de venta y caja
  caja.js             Apertura/cierre, movimientos, egresos
  estacion.js         Pantalla de estación genérica + vista Pase (admin)
  reportes.js         Reportes del día (por método, estación, mozo, anulaciones)
  config.js           Configuración (hub): negocio, caja, estaciones, sesión, mantenimiento
  mantenimiento.js    Cerrar jornada, reinicios, asignar estaciones a categorías
  auth.js             Login Firebase Auth + perfil/rol
  app.js              Orquestador: render, header, nav, badges, motor de alertas, recordatorios
```

## Modelo de datos (Firestore)
- `comandas/{id}`: `{ mesaId, mozoUid, mozoName, estado: abierta|cerrada|cancelada, items[], tandas[] }`
  - item: `{ key, productoId, nombre, cantidad, precio, notas, area, despachoDirecto, tandaId, anulado?, motivoAnulacion?, anuladoPor?, anuladoAt? }`
  - tanda: `{ id, envioId, numero, area, directa?, estado: enviada|preparando|lista|servida|anulada, items[{key,..., listo?, anulado?}], enviadaAt, preparandoAt, listaAt, servidoAt }`
- `cuentas/{id}`: venta cerrada `{ items[{..., area}], anulados[], tiempos[{area, enviadaAt, listaAt, ...}], pagos[{metodo, monto}], metodoPago (o 'mixto'), subtotal, iva, propina, total, fecha }`
- `movimientos/{id}`: un ingreso por cada pago; egresos manuales.
- `categorias/{id}`: `{ nombre, orden, area }` · `productos/{id}`: `{ nombre, categoriaId, precio, disponible, area?, despachoDirecto? }`
- `meta/settings`: `{ value: { businessName, ivaRate, propina..., estaciones:[{id, nombre, icono, recordatorioMin}] } }`
- `usuarios/{uid}`: `{ role, name }` (solo lectura desde la app)
