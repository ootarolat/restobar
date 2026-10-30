# Restobar POS

Sistema de gestión para restobar (PWA): mesas, comandas, estaciones de preparación (cocina, bar, …), cuenta, caja y reportes. Funciona offline, se instala en el móvil como app y sincroniza en tiempo real entre todos los dispositivos.

## Características

- **Mesas**: grilla de mesas con estados (libre/ocupada/reservada); avisos de "listo" por estación y servir por estación (bebidas / comida)
- **Comandas**: toma de pedidos por categoría, notas, envío dividido automáticamente por estación (y envío parcial, ej. "solo bar")
- **Estaciones** (cocina, bar y las que agregues): cada una ve solo lo suyo, en columnas Enviados → Preparando → Listos, con marcado de líneas sueltas y recordatorio de demora configurable
- **Pase** (admin): todas las estaciones lado a lado
- **Despacho directo**: productos sin preparación (lata, agua) quedan listos al enviarse
- **Anulaciones**: un producto ya enviado se anula (con motivo) en vez de borrarse; la estación recibe el aviso y queda en los reportes
- **Cuenta**: cobro con IVA incluido, propina y **pago dividido** en varios métodos
- **Caja**: apertura/cierre de turno, movimientos (un ingreso por cada método de pago)
- **Reportes**: ventas del día, ticket promedio, top productos, ventas por mozo, **ventas y tiempos de preparación por estación**, anulaciones
- **Usuarios y roles**: login con Firebase Authentication; permisos reforzados con reglas de Firestore
- **Sincronización en tiempo real** con **transacciones** (cocina, bar y mozo pueden modificar la misma comanda a la vez sin pisarse)

## Roles

| Rol | Ve | Puede |
|-----|----|-------|
| `admin` | Mesas, Pase (todas las estaciones), Carta, Reportes, Configuración (incl. Caja) | Todo |
| `mozo` | Mesas | Tomar pedidos, servir, anular, cobrar |
| `cajero` | Mesas, Caja | Lo del mozo + caja |
| `cocina` | Pantalla Cocina | Avanzar sus pedidos |
| `bar` | Pantalla Bar | Avanzar sus pedidos (bebidas) |
| `<estación>` | Su pantalla | Igual que cocina/bar, para estaciones creadas en Configuración → Estaciones |

## Cómo se divide una comanda

Cada producto tiene un **área** (estación): `producto.area` → si no, `categoria.area` → si no, se sugiere por el nombre de la categoría (bebidas, cervezas, vinos, cócteles, café → bar) → si no, cocina.

Al tocar **Enviar pedido**, los productos pendientes se agrupan por área y se crea **una tanda por estación** (todas con el mismo número de envío). Cada estación avanza la suya; el mozo recibe "🍹 ¡Bebidas listas!" o "🍳 ¡Comida lista!" por separado. **El cobro no cambia**: se cobra la comanda completa (sin las líneas anuladas).

## Configuración de Firebase

1. **Config pública**: en `js/firebase-config.js` (apiKey, projectId, etc.)
2. **Firestore**: activa Firestore Database en modo producción
3. **Reglas de seguridad**: publica el contenido de `firebase/firestore.rules`
   en la consola (Firestore → Reglas). **Vuelve a publicarlas al actualizar a v18**
   (ahora validan permisos por rol).
4. **Authentication**: habilita "Correo electrónico/contraseña"
5. **Usuarios**: se crean en la consola (Authentication → Users)
6. **Roles**: crea un documento en la colección `usuarios` de Firestore con
   ID = UID del usuario, y campos `{ role: "admin" | "mozo" | "cajero" | "cocina" | "bar", name: "Nombre" }`.
   Sin documento de rol, el usuario es "mozo" por defecto.

## Actualizar una instalación existente (v17 → v18)

1. Publica las nuevas reglas de `firebase/firestore.rules`.
2. Crea los usuarios del bar con `role: "bar"`.
3. Entra como admin → Configuración → Mantenimiento → **Asignar estación a categorías**
   (o ajusta cada una en Carta → ✏️ Categoría). Mientras tanto, la app ya sugiere el área por el nombre de la categoría.
4. Los pedidos en curso creados antes de la actualización siguen funcionando (se tratan como de cocina).

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub (rama `main`)
2. Settings → Pages → Source: `main` branch → Save
3. La app queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`
4. En la consola Firebase → Authentication → Settings → Dominios autorizados,
   agrega `TU-USUARIO.github.io` para permitir el login desde ese dominio.

## Uso

Inicia sesión con el correo/contraseña creados en Firebase. La sincronización
entre dispositivos es automática y en tiempo real.
