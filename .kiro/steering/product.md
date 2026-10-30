---
inclusion: always
---

# Producto: Restobar POS

PWA para restobares en Chile (CLP, IVA 19% incluido por defecto, UI en español).
Se usa en celulares/tablets en sala, cocina y bar, sincronizados en tiempo real.

## Roles
- `admin`: todo. Nav: Mesas, Pase, Carta, Reportes (+ ⚙️ Configuración, que incluye Caja).
- `mozo`: Mesas → comanda → cuenta. Solo gestiona sus mesas (salvo admin).
- `cajero`: lo del mozo + Caja.
- Estaciones (`cocina`, `bar`, y las creadas en Configuración → Estaciones): el **id de la estación es el rol**. Solo ven su pantalla.
- El rol vive en Firestore `usuarios/{uid}.role`; sin documento = `mozo`. Nunca se escribe desde la app.

## Flujo de una comanda
1. Mozo toma mesa (claim atómico) → agrega productos (líneas pendientes, `tandaId: null`).
2. **Enviar pedido**: los pendientes se agrupan por **área** y se crea **una tanda por estación** con el mismo `numero` de envío. También puede enviar solo un área ("Enviar solo: 🍹 Bar").
3. Productos `despachoDirecto` (lata, agua) generan una tanda aparte ya `lista`.
4. Cada estación: `enviada → preparando → lista` (o marcando líneas sueltas; al completar todas, pasa a `lista`).
5. El mozo marca `servida` desde Mesas (por estación o todo).
6. Cobro sobre `comanda.items` activos (sin anulados). Pago simple o dividido. **El cobro no depende de las estaciones.**

## Reglas de negocio
- Lo enviado no se edita ni se borra: se **anula** con motivo (queda en `cuentas.anulados` y en reportes).
- Liberar una mesa con envíos la deja `cancelada` y anula sus tandas activas (las estaciones reciben aviso).
- Área de un producto: `producto.area` → `categoria.area` → sugerencia por nombre de categoría → `cocina`.
- Tandas antiguas sin `area` = `cocina`.
