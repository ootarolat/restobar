# Implementation Plan — Rol Bar y estaciones

- [x] 1. Base de datos y concurrencia
  - [x] 1.1 Exponer `runTransaction` en `firebase-init.js`
  - [x] 1.2 `App.DB.update(store, id, mutator)` con transacción y fallback offline
  - [x] 1.3 `App.Utils.calcTotales` como única fórmula de IVA/propina (excluye anulados)
  - _Requirements: 6.1, 5.1_

- [x] 2. Estaciones y áreas
  - [x] 2.1 `js/estaciones.js`: estaciones configurables, `areaDe`, `tandaArea`, sugerencia por nombre
  - [x] 2.2 `area` en categorías del seed; `despachoDirecto` en latas/agua
  - [x] 2.3 Carta: editar/crear categoría con área; producto con área opcional y despacho directo
  - [x] 2.4 Mantenimiento: "Asignar estación a categorías"
  - _Requirements: 1.1–1.4_

- [x] 3. Envío dividido (`comanda.js`)
  - [x] 3.1 `enviarPedido(comandaId, soloArea?)`: una tanda por área + tanda directa
  - [x] 3.2 Modal de orden agrupado por área, envío parcial, envíos con estado por estación
  - [x] 3.3 Keys por línea (migración en caliente de comandas antiguas)
  - _Requirements: 2.1–2.3, 8.5_

- [x] 4. Rol bar y pantallas de estación
  - [x] 4.1 Roles dinámicos en `store.js` (id de estación = rol)
  - [x] 4.2 `js/estacion.js`: tablero genérico, marcado por línea, Iniciar/Listo atómicos
  - [x] 4.3 Vista `pase` para admin (todas las estaciones + filtro)
  - [x] 4.4 Nav, títulos y badges por estación en `app.js`
  - _Requirements: 3.1–3.3, 3.5_

- [x] 5. Alertas y recordatorios
  - [x] 5.1 Aviso de tanda nueva a la estación destino (corrige aviso que antes no sonaba)
  - [x] 5.2 Avisos al mozo diferenciados (bebidas/comida) y de anulaciones a la estación
  - [x] 5.3 Recordatorio por umbral de cada estación
  - _Requirements: 2.4, 3.4, 4.1, 7.1_

- [x] 6. Sala
  - [x] 6.1 Mesas: listos por estación y "Servir" con selector
  - [x] 6.2 Claim atómico de mesa
  - [x] 6.3 Reasignar mozo desde la lista de `usuarios`
  - _Requirements: 4.2, 6.2, 8.4_

- [x] 7. Anulaciones y liberar mesa
  - [x] 7.1 Anular línea enviada con motivo (y en la tanda)
  - [x] 7.2 Liberar con pedidos en curso: aviso, comanda `cancelada`, tandas `anulada`
  - [x] 7.3 Limpiar comandas incluye canceladas
  - _Requirements: 7.1, 7.2_

- [x] 8. Cobro
  - [x] 8.1 Pago dividido por método; un movimiento por pago
  - [x] 8.2 Cierre atómico (anti doble cobro); venta con área, tiempos y anulados
  - _Requirements: 5.1–5.3_

- [x] 9. Reportes y configuración
  - [x] 9.1 Ventas y tiempos por estación, pagos mixtos, anulaciones
  - [x] 9.2 Configuración → Estaciones (crear/editar/eliminar, umbral)
  - _Requirements: 8.2, 8.3_

- [x] 10. Seguridad y despliegue
  - [x] 10.1 Reglas de Firestore por rol
  - [x] 10.2 Versión v18 (`APP_VERSION`, `CACHE_NAME`), nuevos archivos en `sw.js` e `index.html`
  - [x] 10.3 README y steering de Kiro actualizados
  - _Requirements: 8.1_

- [ ] 11. Pendiente manual (fuera del código)
  - [ ] 11.1 Publicar `firebase/firestore.rules` en la consola de Firebase
  - [ ] 11.2 Crear usuarios con `role: "bar"` en `usuarios/{uid}`
  - [ ] 11.3 Validar reglas en el Rules Playground / emulador
