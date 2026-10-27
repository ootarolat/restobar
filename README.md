# Restobar POS

Sistema de gestión para restobar (PWA): mesas, comandas, cocina, cuenta, caja y reportes. Funciona offline, se instala en el móvil como app y sincroniza en tiempo real entre todos los dispositivos.

## Características

- **Mesas**: grilla de mesas con estados (libre/ocupada/reservada)
- **Comandas**: toma de pedidos por categoría, notas, envío a cocina
- **Cocina**: pantalla de pedidos pendientes con tiempos
- **Cuenta**: cobro con IVA incluido, propina, división por método de pago
- **Caja**: apertura/cierre de turno, movimientos
- **Reportes**: ventas del día, ticket promedio, top productos
- **Usuarios y roles**: login con Firebase Authentication (admin / mozo)
- **Sincronización en tiempo real**: datos compartidos entre dispositivos vía Cloud Firestore

## Tecnología

- PWA 100% en el navegador (HTML + CSS + JavaScript, sin frameworks)
- **Cloud Firestore** como base de datos en tiempo real (con cache offline)
- **Firebase Authentication** (correo/contraseña) para el login

## Configuración de Firebase

1. **Config pública**: en `js/firebase-config.js` (apiKey, projectId, etc.)
2. **Firestore**: activa Firestore Database en modo producción
3. **Reglas de seguridad**: publica el contenido de `firebase/firestore.rules`
   en la consola (Firestore → Reglas)
4. **Authentication**: habilita "Correo electrónico/contraseña"
5. **Usuarios**: se crean en la consola (Authentication → Users)
6. **Roles**: crea un documento en la colección `usuarios` de Firestore con
   ID = UID del usuario, y campos `{ role: "admin" | "mozo", name: "Nombre" }`.
   Sin documento de rol, el usuario es "mozo" por defecto.

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub (rama `main`)
2. Settings → Pages → Source: `main` branch → Save
3. La app queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`
4. En la consola Firebase → Authentication → Settings → Dominios autorizados,
   agrega `TU-USUARIO.github.io` para permitir el login desde ese dominio.

## Uso

Inicia sesión con el correo/contraseña creados en Firebase. La sincronización
entre dispositivos es automática y en tiempo real.
