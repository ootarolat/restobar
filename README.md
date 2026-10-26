# Restobar POS

Sistema de gestión para restobar (PWA): mesas, comandas, cocina, cuenta, caja y reportes. Funciona offline y se instala en el móvil como app.

## Características

- **Mesas**: grilla de mesas con estados (libre/ocupada/reservada)
- **Comandas**: toma de pedidos por categoría, notas, envío a cocina
- **Cocina**: pantalla de pedidos pendientes con tiempos
- **Cuenta**: cobro con IVA incluido, propina, división por método de pago
- **Caja**: apertura/cierre de turno, movimientos
- **Reportes**: ventas del día, ticket promedio, top productos
- **Usuarios y roles**: login validado por el backend (admin / mozo)
- **Sincronización**: respaldo y datos compartidos vía Google Sheets

## Tecnología

- PWA 100% en el navegador (HTML + CSS + JavaScript, sin frameworks)
- Almacenamiento local con IndexedDB (offline-first)
- Backend opcional en Google Apps Script (`google-apps-script/Code.gs`)

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub (rama `main`)
2. Settings → Pages → Source: `main` branch → Save
3. La app queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`

## Backend (Google Apps Script)

El código del backend está en `google-apps-script/Code.gs`. Las instrucciones de
instalación y despliegue están comentadas al inicio de ese archivo.

Desde la pantalla de login de la app, toca **"Configurar servidor"** y pega la
URL del Web App (`.../exec`) para conectar cada equipo al mismo backend.

## Uso

Usuario por defecto: `admin` / `admin` (cámbialo apenas inicies sesión).
