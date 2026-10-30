# Requirements Document — Rol Bar y estaciones de preparación

## Introduction

Se agrega el rol **bar**, responsable de preparar las bebidas. Cada comanda se divide en tandas por estación (cocina y bar), sin cambiar el cobro. Se incluyen mejoras de robustez (concurrencia, seguridad) y operación (anulaciones, pago dividido, reportes por estación).

## Requirements

### Requirement 1 — Área por producto

**User Story:** Como admin, quiero definir en qué estación se prepara cada categoría/producto, para que los pedidos lleguen a quien corresponde.

#### Acceptance Criteria
1. WHEN el admin edita una categoría THEN el sistema SHALL permitir elegir su estación (área).
2. WHEN el admin edita un producto THEN el sistema SHALL permitir heredar el área de la categoría o elegir otra.
3. IF una categoría no tiene área THEN el sistema SHALL sugerirla por nombre (bebidas, cervezas, vinos, cócteles, café → bar; resto → cocina).
4. WHEN el admin ejecuta "Asignar estación a categorías" THEN el sistema SHALL guardar el área sugerida solo en las categorías sin área.

### Requirement 2 — Envío dividido

**User Story:** Como mozo, quiero enviar el pedido una sola vez y que se reparta solo entre cocina y bar.

#### Acceptance Criteria
1. WHEN el mozo toca "Enviar pedido" THEN el sistema SHALL crear una tanda por cada área con productos pendientes, con el mismo número de envío.
2. WHEN hay pendientes de más de un área THEN el sistema SHALL ofrecer enviar solo un área.
3. IF un producto es de despacho directo THEN el sistema SHALL crear una tanda aparte en estado "lista".
4. WHEN se envía THEN el sistema SHALL avisar (sonido + toast) solo a la estación destino y al admin.

### Requirement 3 — Rol y pantalla de estación

**User Story:** Como bartender, quiero ver solo las bebidas pendientes y avanzarlas.

#### Acceptance Criteria
1. WHEN un usuario con `role: "bar"` inicia sesión THEN el sistema SHALL mostrar solo la pantalla del Bar.
2. WHEN la estación marca Iniciar/Listo THEN el sistema SHALL actualizar solo su tanda.
3. WHEN la estación marca todas las líneas activas como listas THEN la tanda SHALL pasar a "lista".
4. IF un pedido "enviado" supera el umbral de la estación (bar 4 min, cocina 8 min, configurable) THEN el sistema SHALL emitir un recordatorio.
5. WHEN el admin abre "Pase" THEN el sistema SHALL mostrar todas las estaciones lado a lado, con filtro por estación.

### Requirement 4 — Servicio por estación

**User Story:** Como mozo, quiero saber qué está listo (bebidas o comida) y servir por separado.

#### Acceptance Criteria
1. WHEN una tanda pasa a "lista" THEN el mozo dueño SHALL recibir "🍹 ¡Bebidas listas!" o "🍳 ¡Comida lista!".
2. WHEN hay listos de varias estaciones THEN "Servir" SHALL preguntar qué servir (por estación o todo).

### Requirement 5 — Cobro sin cambios

#### Acceptance Criteria
1. The sistema SHALL cobrar sobre `comanda.items` activos, independiente de las tandas.
2. WHEN se usa "Dividir pago" THEN el sistema SHALL exigir que la suma de pagos sea igual al total y SHALL registrar un movimiento de caja por pago.
3. IF dos dispositivos cobran la misma comanda a la vez THEN el sistema SHALL registrar una sola venta.

### Requirement 6 — Concurrencia

#### Acceptance Criteria
1. WHEN cocina, bar y mozo modifican la misma comanda simultáneamente THEN ningún cambio SHALL perderse (transacciones).
2. WHEN dos mozos toman la misma mesa libre a la vez THEN solo uno SHALL quedarse con ella.

### Requirement 7 — Anulaciones y liberación

#### Acceptance Criteria
1. WHEN se anula un producto enviado THEN el sistema SHALL marcarlo anulado con motivo, no cobrarlo y avisar a la estación.
2. WHEN se libera una mesa con pedidos en curso THEN el sistema SHALL advertirlo, anular las tandas activas y conservar la comanda como "cancelada".

### Requirement 8 — Seguridad, reportes y configuración

#### Acceptance Criteria
1. The reglas de Firestore SHALL permitir a las estaciones modificar solo `tandas` de `comandas`; carta y configuración solo admin.
2. The reportes SHALL mostrar ventas y tiempo promedio de preparación por estación, pagos por método y anulaciones.
3. The admin SHALL poder crear/editar/eliminar estaciones; el id de la estación SHALL ser el rol de sus usuarios.
4. WHEN el admin reasigna una mesa THEN SHALL elegir el mozo de la lista real de usuarios.
5. Los datos anteriores (tandas sin área, items sin key) SHALL seguir funcionando.
