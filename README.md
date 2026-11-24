# Inventa

Inventa es un mini ERP de inventario y pedidos para un negocio pequeño: productos con su stock
y stock mínimo, clientes y pedidos que descuentan el stock al crearse y lo devuelven si se
cancelan. Cada usuario solo ve sus propios datos.

La interfaz imita un albarán o libro de almacén impreso (papel, tinta, reglas y sellos).

**App:** <https://inventa-rosy.vercel.app>

## Usuario de prueba

| Email | Contraseña |
|---|---|
| `prueba@inventa.test` | `Albaran-2026` |

Es un usuario ficticio de demostración, con productos, clientes y pedidos ya cargados.

## Qué se puede probar

1. **Panel.** Entra con el usuario de prueba. El panel muestra los ingresos y los pedidos del
   mes (en hora de Madrid, sin contar los cancelados), los pedidos pendientes, el nº de
   productos, las unidades en stock, la lista de productos bajo mínimo y los últimos pedidos.
2. **Crear un pedido.** En *Pedidos → Nuevo pedido*, elige un cliente, añade un par de líneas
   (producto y cantidad) y guarda. Se abre el albarán con sus líneas y el total.
3. **Ver que baja el stock.** En *Productos*, el stock de esos productos ha bajado en las
   cantidades del pedido. Si alguno llega a su mínimo, aparece el sello `STOCK BAJO` y sale en
   el panel.
4. **Pedido sin stock.** Crea otro pedido con una cantidad mayor que el stock de un producto.
   Se rechaza con un mensaje claro (`No hay stock suficiente de "…"`) y no se guarda nada,
   tampoco las otras líneas.
5. **Cancelar.** En el albarán del primer pedido, *Cancelar pedido* (pide confirmación). El
   sello pasa a `CANCELADO` y el stock vuelve a su valor anterior. Un pedido cancelado o
   enviado ya no se puede cancelar ni enviar, así que el stock se devuelve una sola vez.
6. **Enviar.** Un pedido pendiente se puede marcar como enviado; deja de contar como pendiente
   en el panel, pero sigue sumando en los ingresos del mes.

## El equipo de agentes

Inventa se ha construido con tres agentes de Claude Code, cada uno con su archivo de
instrucciones:

| Agente | Archivo | Qué hace |
|---|---|---|
| Orquestador | [`CLAUDE.md`](CLAUDE.md) | Divide el trabajo en tareas ([`docs/plan.md`](docs/plan.md)), se las asigna a Develop, pide la revisión a Testing, guarda los informes, hace los commits, aplica las migraciones y despliega. No escribe código de producto. |
| Develop | [`.claude/agents/develop.md`](.claude/agents/develop.md) | Programa cada tarea siguiendo su guía (stack, estructura, Server Actions, lógica pura con tests, guía visual «Albarán») y las directrices de Testing. No puede darse por aprobado. |
| Testing | [`.claude/agents/testing.md`](.claude/agents/testing.md) | Revisa cada entrega contra las **DIRECTRICES D1–D22** (calidad, seguridad, reglas de negocio, interfaz, Next.js 16 y estilo). Ejecuta lint, tipos, tests y build, prueba la app en el navegador y devuelve un informe con veredicto. No edita archivos. |

Durante la construcción, Develop y Testing se lanzaron como subagentes genéricos de Claude Code
con la orden de leer y cumplir su archivo `.md` (los agentes de `.claude/agents/` se crearon en
la misma sesión y Claude Code solo los registra con nombre propio al empezar una sesión nueva).
Cada encargo concreto del orquestador añadía el texto de la tarea y, en las rondas de
corrección, el informe completo de Testing.

### El bucle

```
Orquestador --tarea--> Develop --entrega--> Testing --informe--> Orquestador
     ^                                                               |
     +------- SUSPENSO: el informe completo vuelve a Develop <-------+
              APROBADO: la tarea se marca como hecha y se pasa a la siguiente
```

- Cada informe se guarda **tal cual**, sin editar, en [`docs/revisiones/`](docs/revisiones/)
  (`T<n>-r<k>.md`) y se hace un commit con su veredicto.
- Basta un solo fallo para que el veredicto sea SUSPENSO. El máximo son 4 rondas por tarea.
- Si una directriz es ambigua o Develop no está de acuerdo con ella, decide el orquestador y
  lo anota en las "Decisiones del orquestador" de [`docs/plan.md`](docs/plan.md).
- Lo que no puede comprobar Testing (la base de datos real) lo verifica el orquestador. Esas
  comprobaciones están en [`docs/verificaciones/`](docs/verificaciones/): por ejemplo, 27
  pruebas SQL con dos usuarios contra el proyecto de Supabase.

### Rondas

| Tarea | Ronda | Veredicto | Motivo |
|---|---|---|---|
| T1 — Base y acceso | [r1](docs/revisiones/T1-r1.md) | APROBADO | |
| T2 — Base de datos | [r1](docs/revisiones/T2-r1.md) | SUSPENSO | Pedidos y líneas se podían escribir directamente por la API (D7, D8, D12–D14) |
| T2 — Base de datos | [r2](docs/revisiones/T2-r2.md) | APROBADO | |
| T2b — Identidad visual | [r1](docs/revisiones/T2b-r1.md) | SUSPENSO | Error de prerender de Next 16 en las rutas privadas (D20) |
| T2b — Identidad visual | [r2](docs/revisiones/T2b-r2.md) | APROBADO | |
| T3 — Productos y clientes | [r1](docs/revisiones/T3-r1.md) | SUSPENSO | El estado de los formularios sobrevivía a la navegación (D17) |
| T3 — Productos y clientes | [r2](docs/revisiones/T3-r2.md) | APROBADO | |
| T4 — Pedidos | [r1](docs/revisiones/T4-r1.md) | APROBADO | |
| T5 — Panel y acabado | [r1](docs/revisiones/T5-r1.md) | APROBADO | |
| T6 — Integración continua | [r1](docs/revisiones/T6-r1.md) | APROBADO | |
| T7 — Migraciones con historial | [r1](docs/revisiones/T7-r1.md) | APROBADO | |
| T8 — Tipos generados | [r1](docs/revisiones/T8-r1.md) | APROBADO | |
| T9 — Tests de base de datos (pgTAP) | [r1](docs/revisiones/T9-r1.md) | APROBADO | |

### Fallos que encontró Testing y cómo se corrigieron

1. **Pedidos escribibles sin pasar por el control de stock (T2 r1).** Develop avisó de que,
   con políticas de escritura en `pedidos` y `pedido_lineas`, alguien podría saltarse el
   control de stock escribiendo directamente por la API REST. El orquestador endureció las
   directrices D7 y D8 y Testing suspendió la migración contra ellas: con un `update` directo
   se podía volver a poner como `pendiente` un pedido cancelado y cancelarlo otra vez, con lo
   que el stock se devolvía dos veces; también se podían cambiar precios y totales.
   **Corrección:** esas dos tablas solo tienen política de lectura, se revocan los permisos de
   escritura y las tres funciones (`crear_pedido`, `cancelar_pedido`, `enviar_pedido`) pasan
   a `security definer`. Al empezar exigen sesión y filtran cada lectura y escritura por
   `owner_id = auth.uid()`.
2. **Error de prerender en todas las pantallas privadas (T2b r1).** Con `npm run dev`, Next 16
   (Cache Components) avisaba de que `/panel`, `/productos`, `/clientes` y `/pedidos` usaban
   un valor inestable (`Date.now()`) al prerenderizar. Venía de `supabase.auth.getUser()`.
   **Corrección:** el cliente de Supabase del servidor llama antes a `await connection()` y cada
   ruta privada tiene su `loading.tsx`. La regla se añadió a la guía de Develop.
3. **Formularios con datos fantasma (T3 r1).** Next 16 conserva ocultas las páginas visitadas.
   Si se enviaba un formulario con errores, se cancelaba y se volvía a abrir, reaparecían los
   valores tecleados y los mensajes de error. En una ficha de edición, alguien podía tomar por
   guardados unos valores que nunca se guardaron. **Corrección:** el componente
   `ResetWhenHidden` reinicia el formulario cuando su página se oculta. También pasó a la guía
   de Develop como regla.
Además, una observación que no bloqueaba:

4. **Título de pestaña en el 404 (observación de T3 r1, corregida en T5).** En
   `/productos/<id-que-no-existe>` se veía la página 404, pero la pestaña seguía diciendo
   "Editar producto · Inventa". Al corregirlo se aplicó también a las fichas de clientes y
   pedidos. **Corrección:** las
   fichas calculan su título con `generateMetadata` y comparten con la página una única
   consulta (`React.cache`). Si el registro no existe, lanzan `notFound()` y la pestaña lleva
   el título del 404.

Testing también intentó romper la app a propósito. En T4 manipuló la petición de crear pedido
con `total_cents: 1`, un `owner_id` falso y precios de 1 céntimo: el pedido se guardó con el
precio real del producto.

## Stack y seguridad

- **Next.js 16** (App Router, Cache Components, `src/proxy.ts`), React 19, TypeScript estricto
  y Tailwind CSS v4.
- **Supabase** (Postgres, Auth y RLS) con `@supabase/ssr`. Validación con `zod` y tests con
  `vitest`. Despliegue en Vercel.
- La lógica de negocio pura (dinero, stock, pedidos, fechas en hora de Madrid, cifras del panel)
  está en `src/lib/domain/`, con sus tests.

Decisiones de seguridad:

- **RLS en todas las tablas.** Cada fila tiene `owner_id not null default auth.uid()`, y las
  políticas limitan todo a `owner_id = auth.uid()`. La app nunca envía `owner_id`.
- **Los pedidos solo se escriben con funciones `security definer`.** `pedidos` y
  `pedido_lineas` solo se pueden leer desde la API. Crear, enviar y cancelar pasan por
  `crear_pedido`, `enviar_pedido` y `cancelar_pedido`. Estas funciones exigen sesión, filtran
  por el usuario, usan `search_path = ''` y bloquean las filas con `for update`. Además, hacen
  todo o nada: si una línea no tiene stock, no se guarda ninguna. Solo `authenticated` puede
  ejecutarlas.
- **Los precios nunca vienen del cliente.** La app solo envía el cliente y pares
  `producto_id` + cantidad. La función copia el precio del producto en ese momento y calcula
  el total. Si luego se edita el producto, el albarán no cambia.
- **El stock nunca es negativo.** Hay `check (stock >= 0)` en la tabla y la función comprueba
  el stock dentro de la propia transacción.
- **Sin claves en el repositorio.** La app solo usa la URL del proyecto y la clave
  *publicable* de Supabase, que viven en `.env.local` (ignorado por git) y en las variables de
  entorno de Vercel. La clave secreta del proyecto no se usa en ningún sitio.
- Cada página privada y cada Server Action comprueban la sesión en el servidor, además de la
  redirección a `/login` de `src/proxy.ts`.

## Cómo ejecutarlo en local

Hace falta Node.js 22 o posterior, la CLI de Supabase y un proyecto de Supabase.

1. **Dependencias y variables de entorno**

   ```bash
   npm install
   cp .env.example .env.local
   ```

   En `.env.local`, pon la URL del proyecto y la clave publicable de Supabase
   (*Project Settings → API*).

2. **Base de datos.** Enlaza tu proyecto con la CLI de Supabase y aplica las migraciones de
   `supabase/migrations/` para dejar el esquema y el historial sincronizados:

   ```bash
   supabase link --project-ref <ref-del-proyecto>
   supabase db push --linked
   ```

   Las migraciones actuales son:

   - `supabase/migrations/0001_esquema.sql`: tablas, RLS, políticas y funciones de pedidos.
   - `supabase/migrations/0002_revocar_rls_auto_enable.sql`: quita el permiso de ejecución de
     `public.rls_auto_enable()` (función que solo existe si el proyecto tiene activado el RLS
     automático de Supabase).
   - `supabase/migrations/20261124094951_habilitar_pgtap.sql`: habilita la extensión `pgtap` en
     el esquema `extensions` para los tests de base de datos.

3. **Datos de demostración (opcional).** Crea primero el usuario `prueba@inventa.test` en
   *Authentication → Users*. Después ejecuta `supabase/seed_demo.sql` en el editor SQL, que
   necesita permisos de administrador para leer `auth.users`. El script **borra los datos de
   ese usuario** y vuelve a cargar 10 productos, 6 clientes y 8 pedidos. Los pedidos se crean
   con `crear_pedido`, así que el stock queda coherente.

4. **Arrancar y comprobar**

   ```bash
   npm run dev        # http://localhost:3000
   npm run lint       # ESLint
   npm run typecheck  # tsc --noEmit
   npm test           # Vitest
   npm run test:db    # tests pgTAP en supabase/tests/ (no dejan datos)
   npm run build      # build de producción
   npm run db:types   # regenera src/lib/database.types.ts desde el esquema de Supabase
   ```

   Los tests de base de datos viven en `supabase/tests/` (formato pgTAP envuelto en `begin; ... rollback;`,
   por lo que no dejan filas en ninguna tabla). `npm run test:db` ejecuta `supabase test db --linked`
   cuando Docker está activo y, si no hay Docker disponible, ejecuta cada archivo con
   `supabase db query --linked -f` validando estrictamente la salida TAP.

## Producción

### Integración continua

Cada pull request y cada push a `main` ejecutan [`.github/workflows/ci.yml`](.github/workflows/ci.yml) en GitHub Actions con dos comprobaciones:

- **Calidad:** instala dependencias con `npm ci` (Node.js 22 LTS) y ejecuta `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` con valores ficticios para las variables públicas de Supabase.
- **Secretos:** analiza el historial del PR o del push con Gitleaks (`.gitleaks.toml`) para evitar que entren credenciales en el repositorio.

Las actualizaciones de dependencias de `npm` y `github-actions` se revisan cada semana mediante [`.github/dependabot.yml`](.github/dependabot.yml), agrupando las versiones menores y de corrección.

### Migraciones

El historial de esquema se gestiona exclusivamente con la CLI de Supabase (`supabase_migrations.schema_migrations`). **Nunca se ejecuta SQL suelto contra producción** desde el editor SQL ni mediante consultas ad hoc.

Flujo obligatorio para cualquier cambio de esquema:

1. **Enlazar el proyecto** (una vez por entorno local; la CLI pedirá la contraseña de la base de datos):

   ```bash
   supabase link --project-ref uqupgywhmmdpjjenxywb
   ```

2. **Crear la migración** en una rama de trabajo:

   ```bash
   supabase migration new <nombre>
   ```

3. **Revisar en PR y comprobar antes de aplicar** que el historial local y remoto coinciden y qué cambios se van a ejecutar:

   ```bash
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

4. **Aplicar la migración** una vez revisada y regenerar los tipos TypeScript si cambió el esquema:

   ```bash
   supabase db push --linked
   npm run db:types
   ```

Respecto a entornos, actualmente Inventa trabaja contra un único proyecto de Supabase; si se separa un entorno de pruebas o preproducción, el mismo flujo se aplica enlazando cada proyecto con su `--project-ref` antes de subir cambios a producción. De forma opcional, se puede añadir un workflow manual (`workflow_dispatch`) en GitHub Actions para ejecutar `supabase db push` bajo demanda —nunca automático en cada push—, lo que requeriría configurar los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` en GitHub Secrets.

### Conectar Vercel con GitHub (previews por PR)

Para que Vercel genere una URL de vista previa por cada pull request y despliegue `main` automáticamente:

1. En Vercel, abre *Account Settings → Authentication → Connect GitHub* y autoriza la cuenta de GitHub.
2. En el proyecto de Inventa en Vercel, abre *Project → Settings → Git*, vincula el repositorio `Esteban7893/inventa` y deja `main` como rama de producción.
