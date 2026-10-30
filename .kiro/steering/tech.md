---
inclusion: always
---

# Stack y convenciones técnicas

- **Sin frameworks ni build**: HTML + CSS + JavaScript clásico (ES5-ish, `var`, `function`). Scripts no-módulo cargados en orden desde `index.html`; todo cuelga de `window.App` (`App.DB`, `App.Utils`, `App.Store`, `App.Estaciones`, `App.Views.*`, `App.Actions.*`).
- Solo `js/firebase-init.js` es módulo ES: importa Firebase 10.12.2 desde gstatic y expone `window.FB` (incluye `runTransaction`).
- **Firestore** con cache offline persistente. `App.DB` mantiene un cache en memoria alimentado por `onSnapshot` de todas las colecciones (`meta, mesas, categorias, productos, comandas, cuentas, sesiones, movimientos`).
- Vistas = funciones `async` que devuelven strings HTML; eventos inline `onclick="App.Actions.x(...)"`. Escapar SIEMPRE texto de usuario con `App.Utils.esc`.
- Hosting: GitHub Pages. PWA con `sw.js` network-first.

## Reglas obligatorias
- **Escrituras concurrentes**: para modificar documentos compartidos (comandas, mesas) usar `App.DB.update(store, id, mutator)` (transacción; fallback local offline). El mutator debe ser determinista: generar ids/timestamps **fuera** del mutator. Devolver `false` para no escribir.
- **Totales/IVA**: usar solo `App.Utils.calcTotales(items, settings, propinaRate)`; excluye líneas `anulado`. No duplicar fórmulas.
- **Estaciones**: nunca hardcodear `'cocina'`/`'bar'` en lógica nueva; usar `App.Estaciones` (`list`, `get`, `label`, `areaDe`, `tandaArea`, `esRolEstacion`, `principal`).
- **Permisos**: `App.Store.canAccess/navForRole/homeFor`. Si cambian permisos, actualizar también `firebase/firestore.rules` (las estaciones solo pueden modificar `tandas` de `comandas`).
- **Al publicar una versión**: subir `App.APP_VERSION` en `js/config.js` y `CACHE_NAME` en `sw.js` (mismo número), y agregar archivos nuevos a `FILES` en `sw.js` y a `index.html`.
- Compatibilidad hacia atrás con datos existentes en Firestore (campos nuevos opcionales, fallbacks).
- Textos de UI en español (Chile); montos con `App.Utils.formatCLP`.
- No agregar tests automáticamente salvo que se pidan.
